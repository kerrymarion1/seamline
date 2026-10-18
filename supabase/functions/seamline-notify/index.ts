// Seamline: tell the other people in the library's devices about something
// that just happened. Only signed-in members and guests may call this, and
// the caller's own devices are never told.
//
//   { album, name, made: true }          someone made an album
//   { album, name, photos, videos }      someone added photos or videos to one
//     (either with `members` when the album is secret)
//   { chat, text, photo }                someone sent a message
//   { album, name, photo, heart: true }  someone hearted a photo in an album
//   { album, name, photo, comment }      someone commented on one
//
// An album is everyone's news unless it is secret: then only the people in
// it hear. A message is heard only by the people in its chat. A heart goes
// to whoever added the photo; a comment to them and to anyone else who has
// commented on it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { firstName, nameOf } from "../_shared/names.ts";
import { countText, notifyLibrary } from "../_shared/push.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const count = (n: unknown) => Math.max(0, Math.min(10000, Math.round(Number(n) || 0)));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // Who is asking, and which library is theirs.
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const [{ data: auth }, { data: library }] = await Promise.all([caller.auth.getUser(), caller.rpc("seamline_my_library")]);
  if (!auth?.user || !library) return reply({ error: "Not a member of a library." }, 403);

  let body: {
    album?: string; name?: string; photos?: number; videos?: number; made?: boolean; members?: unknown[];
    chat?: string; text?: string; photo?: boolean | string; heart?: boolean; comment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // A message: only the other people in the chat, and only if the caller is in it.
  if (body.chat) {
    const chatId = String(body.chat);
    if (!/^[0-9a-f-]{36}$/.test(chatId)) return reply({ error: "Bad request" }, 400);
    const { data: chat } = await admin.from("seamline_chats").select("id, library, members, title").eq("id", chatId).maybeSingle();
    if (!chat || chat.library !== library || !chat.members.includes(auth.user.id)) return reply({ error: "Not in that chat." }, 403);
    const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const said = text || (body.photo ? "Sent a photo" : "");
    if (!said) return reply({ error: "Bad request" }, 400);
    const group = chat.members.length > 2;
    await notifyLibrary(admin, library, {
      title: group ? (chat.title || "Group chat") : nameOf(auth.user),
      body: group ? `${firstName(auth.user)}: ${said}` : said,
      url: `/messages/${chat.id}`,
      tag: `chat-${chat.id}`,
    }, auth.user.id, chat.members);
    return reply({ ok: true });
  }

  // A heart or a comment on one photo in an album the caller can see.
  if (typeof body.photo === "string" && (body.heart === true || typeof body.comment === "string")) {
    const albumId = String(body.album ?? "");
    const photo = body.photo;
    if (!/^[\w-]{1,64}$/.test(albumId) || !/^[\w-]{1,64}$/.test(photo)) return reply({ error: "Bad request" }, 400);
    const { data: doc } = await admin.from("seamline_docs").select("data")
      .eq("library", library).eq("kind", "album").eq("id", albumId).maybeSingle();
    const data = doc?.data;
    if (!data || !(data.imageIds ?? []).includes(photo)) return reply({ error: "No such photo." }, 404);
    const secret = data.secret === true;
    const members: string[] = (data.members ?? []).map(String);
    if (secret && !members.includes(auth.user.id)) {
      const { data: isAdmin } = await caller.rpc("seamline_is_admin");
      if (!isAdmin) return reply({ error: "Not in that album." }, 403);
    }
    const by = data.addedBy?.[photo];
    const to = new Set<string>();
    if (by && typeof by === "object" && by.id) to.add(String(by.id));
    const said = typeof body.comment === "string" ? body.comment.replace(/\s+/g, " ").trim().slice(0, 140) : "";
    if (said) {
      const { data: rows } = await admin.from("seamline_photo_comments").select("user_id")
        .eq("library", library).eq("album", albumId).eq("photo", photo);
      for (const r of rows ?? []) to.add(String(r.user_id));
    }
    to.delete(auth.user.id);
    const only = [...to].filter((id) => !secret || members.includes(id));
    if (only.length) {
      await notifyLibrary(admin, library, {
        title: String(data.name ?? body.name ?? "An album").slice(0, 80),
        body: said ? `${firstName(auth.user)}: ${said}` : `${firstName(auth.user)} loved your photo`,
        url: `/album/${albumId}?photo=${encodeURIComponent(photo)}`,
        tag: `photo-${albumId}-${photo}`,
      }, auth.user.id, only);
    }
    return reply({ ok: true });
  }

  // `made: true` is a new album; otherwise photos and videos were added to one.
  const album = String(body.album ?? "");
  const albumName = String(body.name ?? "").trim().slice(0, 80) || "an album";
  const photos = count(body.photos);
  const videos = count(body.videos);
  const made = body.made === true;
  if (!/^[\w-]{1,64}$/.test(album) || (!made && photos + videos === 0)) return reply({ error: "Bad request" }, 400);

  // A secret album is news only for the people in it. The album on the server
  // says who they are; one just made may not have reached it yet, so the app
  // sends its people along (kept to people in this library).
  let only: string[] | undefined;
  const { data: doc } = await admin.from("seamline_docs").select("data")
    .eq("library", library).eq("kind", "album").eq("id", album).maybeSingle();
  if (doc?.data?.secret === true) {
    only = (doc.data.members ?? []).map(String);
  } else if (!doc && Array.isArray(body.members)) {
    const asked = body.members.map(String).filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 100);
    const { data: rows } = await admin.from("seamline_members").select("user_id").eq("library", library).in("user_id", asked);
    only = (rows ?? []).map((r) => String(r.user_id));
  }

  // Same tag either way: photos added straight after making the album replace
  // "made a new album" with what was added.
  await notifyLibrary(admin, library, {
    title: albumName,
    body: made ? `${firstName(auth.user)} made a new album` : `${firstName(auth.user)} added ${countText(photos, videos)}`,
    url: `/album/${album}`,
    tag: `album-${album}`,
  }, auth.user.id, only);
  return reply({ ok: true });
});
