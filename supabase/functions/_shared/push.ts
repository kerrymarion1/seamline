// Seamline: sends a notification to every device in a library that has
// notifications turned on (rows in seamline_push). Used by seamline-notify
// (a member added photos) and seamline-visitor-upload (a visitor did).
// Needs the secrets VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; without them it
// quietly sends nothing.
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type Note = {
  title: string;
  body: string;
  url: string; // the page to open when the notification is tapped
  tag: string; // a newer notification with the same tag replaces the older one
};

// Photos and videos counted the way the app says them: "6 photos", "1 video",
// "3 photos and 2 videos".
export function countText(photos: number, videos: number) {
  const say = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (!videos) return say(photos, "photo");
  return photos ? `${say(photos, "photo")} and ${say(videos, "video")}` : say(videos, "video");
}

// `except` is the person who did it: none of their own devices are told.
// `only` sends to one person's devices, or to a list of people's (a secret
// album's, a chat's), instead of everyone's.
export async function notifyLibrary(
  admin: SupabaseClient,
  library: string,
  note: Note,
  except?: string,
  only?: string | string[],
) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails("https://seamline-app.netlify.app", publicKey, privateKey);

  let query = admin.from("seamline_push").select("endpoint, p256dh, auth").eq("library", library);
  if (except) query = query.neq("user_id", except);
  if (Array.isArray(only)) {
    if (!only.length) return;
    query = query.in("user_id", only);
  } else if (only) {
    query = query.eq("user_id", only);
  }
  const { data } = await query;

  await Promise.all((data ?? []).map(async (device) => {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(note),
        { TTL: 60 * 60 * 24 },
      );
    } catch (err) {
      // The device has turned notifications off, or the app was removed.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("seamline_push").delete().eq("endpoint", device.endpoint);
    }
  }));
}
