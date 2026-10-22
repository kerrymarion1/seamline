// Seamline: looks after videos, which live in Cloudflare R2 rather than in
// Supabase Storage (its free plan refuses files over 50 MB).
// Only signed-in members of a library may call this. The video itself never
// passes through here: the app asks for a one-hour upload address, then sends
// the file straight to R2. Everything is filed under the caller's library, and
// a caller can only delete what is under their own.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

// Where the bucket is. None of this is secret; the key is, and is never written here.
const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID") ?? "15e6ec5d0175cefe69d74ec5756ca10d";
const BUCKET = Deno.env.get("R2_BUCKET") ?? "seamline";
const PUBLIC_URL = (Deno.env.get("R2_PUBLIC_URL") ?? "https://media.plaitup.com").replace(/\/+$/, "");
const ENDPOINT = `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}`;
const UPLOAD_SECONDS = 3600;
const MAX_FILES = 20; // per request
const EXTENSIONS = /^(mp4|m4v|mov|webm|mkv|3gp|jpg)$/;

// The key comes from the function's secrets if set there, otherwise from
// Vault in the database (see seamline_r2_keys). Read once, then remembered.
let client: AwsClient | null = null;
async function storage(): Promise<AwsClient | null> {
  if (client) return client;
  let id = Deno.env.get("R2_ACCESS_KEY_ID");
  let secret = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!id || !secret) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await admin.rpc("seamline_r2_keys");
    id = data?.id;
    secret = data?.secret;
  }
  if (!id || !secret) return null;
  client = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
  return client;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const random = () => {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // Who is asking, and which library is theirs.
  const authorization = req.headers.get("Authorization") ?? "";
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: library, error: libraryError } = await user.rpc("seamline_my_library");
  if (libraryError || !library) return reply({ error: "This account cannot store videos." }, 403);

  const r2 = await storage();
  if (!r2) return reply({ error: "Video storage is not set up yet." }, 503);

  let body: { action?: string; files?: { ext?: string }[]; paths?: string[] };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }

  // Addresses to upload to. Each file gets a new random name under the library.
  if (body.action === "sign") {
    const files = body.files ?? [];
    if (!files.length || files.length > MAX_FILES) return reply({ error: "Bad request" }, 400);
    const signed = [];
    for (const file of files) {
      const ext = String(file.ext ?? "").toLowerCase();
      if (!EXTENSIONS.test(ext)) return reply({ error: "That kind of file cannot be stored." }, 415);
      const key = `${library}/${random()}.${ext}`;
      const url = new URL(`${ENDPOINT}/${key}`);
      url.searchParams.set("X-Amz-Expires", String(UPLOAD_SECONDS));
      const request = await r2.sign(new Request(url, { method: "PUT" }), { aws: { signQuery: true } });
      signed.push({ url: request.url, path: `${PUBLIC_URL}/${key}` });
    }
    return reply({ files: signed });
  }

  if (body.action === "delete") {
    // Guests add to the library but never remove from it.
    const { data: guest } = await user.rpc("seamline_is_guest");
    if (guest) return reply({ error: "Guests cannot remove anything." }, 403);
    const paths = body.paths ?? [];
    if (paths.length > 200) return reply({ error: "Bad request" }, 400);
    const prefix = `${PUBLIC_URL}/${library}/`;
    for (const path of paths) {
      const name = String(path).slice(prefix.length);
      // Anything outside the caller's own library is left alone.
      if (!String(path).startsWith(prefix) || !/^[\w-]+\.[a-z0-9]+$/.test(name)) continue;
      const res = await r2.fetch(`${ENDPOINT}/${library}/${name}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) return reply({ error: "A video could not be removed." }, 502);
    }
    return reply({ ok: true });
  }

  return reply({ error: "Bad request" }, 400);
});
