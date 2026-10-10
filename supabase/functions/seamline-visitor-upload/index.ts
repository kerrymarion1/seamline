// Seamline: lets a visitor add a photo to a shared album.
// There is no login here. Access is checked in this function instead: the
// request must carry a valid link code and that link's PIN. Ten wrong PINs in
// a row lock adding photos on that link for 15 minutes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "seamline";
const MAX_BYTES = 8 * 1024 * 1024; // per photo
const MAX_VISITOR_PHOTOS = 100; // per link
const STORAGE_LIMIT = 1024 ** 3; // free plan: 1 GB across all links
const MAX_FAILURES = 10;
const LOCK_MINUTES = 15;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }
  const token = String(form.get("token") ?? "");
  const pin = String(form.get("pin") ?? "");
  const file = form.get("file");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: share } = await admin
    .from("seamline_shares")
    .select("id, owner, kind, items, upload_pin, pin_failures, pin_locked_until, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!share || (share.expires_at && new Date(share.expires_at) <= new Date())) {
    return reply({ error: "This link is not available." }, 404);
  }
  if (!share.upload_pin || share.kind !== "album") {
    return reply({ error: "Adding photos is turned off for this album." }, 403);
  }
  if (share.pin_locked_until && new Date(share.pin_locked_until) > new Date()) {
    return reply({ error: "Too many wrong PINs. Try again in 15 minutes." }, 429);
  }
  if (pin !== share.upload_pin) {
    const failures = (share.pin_failures ?? 0) + 1;
    const locked = failures >= MAX_FAILURES;
    await admin
      .from("seamline_shares")
      .update({
        pin_failures: locked ? 0 : failures,
        pin_locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
      })
      .eq("id", share.id);
    return reply({ error: "That PIN is not right." }, 401);
  }

  // A request without a photo just checks the PIN.
  if (!(file instanceof File)) {
    if (share.pin_failures) await admin.from("seamline_shares").update({ pin_failures: 0 }).eq("id", share.id);
    return reply({ ok: true });
  }

  const ext = TYPES[file.type];
  if (!ext) return reply({ error: "Only JPEG, PNG or WebP photos can be added." }, 415);
  if (file.size > MAX_BYTES) return reply({ error: "That photo is too large." }, 413);
  const visitorCount = (share.items as { visitor?: boolean }[]).filter((it) => it.visitor).length;
  if (visitorCount >= MAX_VISITOR_PHOTOS) return reply({ error: "This album cannot take any more added photos." }, 409);

  const { data: rows } = await admin.from("seamline_shares").select("bytes").eq("owner", share.owner);
  const used = (rows ?? []).reduce((n: number, r: { bytes: number }) => n + Number(r.bytes), 0);
  if (used + file.size > STORAGE_LIMIT) return reply({ error: "The album's storage is full." }, 507);

  const id = `v-${crypto.randomUUID()}`;
  const path = `${share.owner}/${id}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (uploadError) return reply({ error: "The photo could not be stored." }, 500);

  const clean = (file.name || "photo").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "photo";
  const dim = (key: string) => Math.max(0, Math.min(20000, Math.round(Number(form.get(key)) || 0)));
  const item = {
    id,
    path,
    name: clean,
    width: dim("width"),
    height: dim("height"),
    bytes: file.size,
    visitor: true,
    added: new Date().toISOString(),
  };
  const { error: appendError } = await admin.rpc("seamline_append_item", { share: share.id, item });
  if (appendError) {
    await admin.storage.from(BUCKET).remove([path]);
    return reply({ error: "The photo could not be added." }, 500);
  }
  return reply({ ok: true, item });
});
