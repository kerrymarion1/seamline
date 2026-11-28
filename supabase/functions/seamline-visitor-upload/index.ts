// Seamline: lets a signed-in person add a photo to a shared album.
// Only people allowed by the library can: its members, and people the admin
// has approved by email (seamline_rights decides, and also applies any block).
// The link itself must have adding photos switched on (guest_uploads).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { firstName, nameOf } from "../_shared/names.ts";
import { countText, notifyLibrary } from "../_shared/push.ts";

const BUCKET = "seamline";
const BURST_MINUTES = 30; // photos added this close together are told as one batch
const MAX_BYTES = 8 * 1024 * 1024; // per photo
const MAX_VISITOR_PHOTOS = 100; // per link
const STORAGE_LIMIT = 1024 ** 3; // free plan: 1 GB across all links
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

  // Who is adding. Signed-out visitors can look, but not add.
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await caller.auth.getUser();
  const user = auth?.user;
  if (!user) return reply({ error: "Sign in to add photos." }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }
  const token = String(form.get("token") ?? "");
  const file = form.get("file");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: share } = await admin
    .from("seamline_shares")
    .select("id, owner, kind, title, source_id, items, guest_uploads, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!share || (share.expires_at && new Date(share.expires_at) <= new Date())) {
    return reply({ error: "This link is not available." }, 404);
  }
  if (!share.guest_uploads || share.kind !== "album") {
    return reply({ error: "Adding photos is turned off for this album." }, 403);
  }
  const { data: rights } = await caller.rpc("seamline_rights", { lib: share.owner });
  if (!rights?.upload) return reply({ error: "You haven't been given permission to add photos to this album." }, 403);
  if (!(file instanceof File)) return reply({ error: "Bad request" }, 400);

  const ext = TYPES[file.type];
  if (!ext) return reply({ error: "Only JPEG, PNG or WebP photos can be added." }, 415);
  if (file.size > MAX_BYTES) return reply({ error: "That photo is too large." }, 413);
  const visitorCount = (share.items as { visitor?: boolean }[]).filter((it) => it.visitor).length;
  if (visitorCount >= MAX_VISITOR_PHOTOS) return reply({ error: "This album cannot take any more added photos." }, 409);

  // Only what is kept in Supabase Storage counts here; photos and videos kept
  // in Cloudflare are recorded by their full address and have their own limit.
  const { data: rows } = await admin.from("seamline_shares").select("items").eq("owner", share.owner);
  const seen = new Map<string, number>();
  for (const r of rows ?? []) {
    for (const it of (r.items ?? []) as { path: string; bytes: number }[]) {
      if (!/^https?:\/\//.test(it.path)) seen.set(it.path, Number(it.bytes) || 0);
    }
  }
  const used = [...seen.values()].reduce((n, b) => n + b, 0);
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
    // Who added it, so the album can say so once it is kept, and the admin can block them.
    by: { id: user.id, name: nameOf(user) },
    added: new Date().toISOString(),
  };
  const { error: appendError } = await admin.rpc("seamline_append_item", { share: share.id, item });
  if (appendError) {
    await admin.storage.from(BUCKET).remove([path]);
    return reply({ error: "The photo could not be added." }, 500);
  }

  // Tell the library's members. Photos arrive one at a time, so the message
  // counts what this person added to this link in the last half hour, and each
  // new one replaces the last on the phone rather than piling up.
  const since = Date.now() - BURST_MINUTES * 60000;
  const recent = 1 + (share.items as { visitor?: boolean; added?: string; by?: { id?: string } }[])
    .filter((it) => it.visitor && it.by?.id === user.id && it.added && Date.parse(it.added) > since).length;
  const albumId = String(share.source_id ?? "").split(":")[0];
  const sent = notifyLibrary(admin, share.owner, {
    title: share.title || "Your shared album",
    body: `${firstName(user)} added ${countText(recent, 0)}`,
    url: albumId ? `/album/${albumId}` : "/",
    tag: `link-${share.id}-${user.id}`,
  }, user.id).catch(() => {});
  // Send after replying, so nobody is kept waiting.
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(sent);
  else await sent;

  return reply({ ok: true, item });
});
