// Hugpix 2: the Advent reminder. December 1 to 24, at noon Eastern, the
// Netlify timer (netlify/functions/advent.mjs) calls this, and everyone in a
// library whose admin has turned Advent reminders on (Settings > Hugpix 2;
// seamline_settings "advent", off until then — Kerry: "have advent reminder
// off for now") hears that day's thing to look for: "Advent · day 3 /
// Something red. Add yours to Christmas 26." A tap opens the family's
// Christmas album. Each person can turn it off for themselves in Settings
// (seamline_reminders); it's on for them unless they do.
//
// Anyone may call it (no sign-in), so it decides for itself whether it's
// time: only in Advent, only from 11 in the morning Eastern, and only once a
// day per library (the day's mark in seamline_settings, taken first).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { notifyLibrary } from "../_shared/push.ts";

// The same as ADVENT in src/lib/holidays.js.
const ADVENT = [
  "Something red", "Your front door", "A window", "Something warm to drink", "Lights", "Something you made",
  "Hands", "A tree", "Something sweet", "Outside today", "A favourite ornament", "Something green",
  "Wrapping", "Someone laughing", "Something old", "Your table", "A card or a letter", "Something that sparkles",
  "A pet, or a friend", "Shoes by the door", "After dark", "Something cooking", "Getting ready", "Christmas Eve",
];
const ZONE = "America/New_York";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day), hour = Number(parts.hour);
  if (month !== 12 || day > 24) return json({ skipped: "not Advent" });
  if (hour < 11) return json({ skipped: "too early" });
  const mark = `advent:${year}-12-${String(day).padStart(2, "0")}`;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // The libraries whose admin has turned Advent reminders on.
  const { data: on, error } = await admin.from("seamline_settings").select("library").eq("key", "advent").eq("value", true);
  if (error) return json({ error: error.message }, 500);

  const sent: string[] = [];
  for (const { library } of on ?? []) {
    // Today's mark, taken before sending: a second call finds it and stops.
    const { error: taken } = await admin.from("seamline_settings").insert({ library, key: mark, value: true });
    if (taken) continue;
    // Last year's and the days before are no longer needed.
    await admin.from("seamline_settings").delete().eq("library", library).like("key", "advent:%").neq("key", mark);

    // The family's Christmas album this year: the one with the most photos.
    const { data: albums } = await admin.from("seamline_docs").select("id, data")
      .eq("library", library).eq("kind", "album").eq("deleted", false).eq("data->holiday->>id", "christmas");
    const album = (albums ?? [])
      .filter((a) => Number(a.data?.holiday?.year) === year && !a.data?.secret)
      .sort((a, b) => (b.data?.imageIds?.length ?? 0) - (a.data?.imageIds?.length ?? 0))[0];

    // Everyone with notifications on, less anyone who turned the reminder off.
    const [{ data: devices }, { data: off }] = await Promise.all([
      admin.from("seamline_push").select("user_id").eq("library", library),
      admin.from("seamline_reminders").select("user_id").eq("library", library).eq("advent", false),
    ]);
    const quiet = new Set((off ?? []).map((r) => String(r.user_id)));
    const only = [...new Set((devices ?? []).map((d) => String(d.user_id)))].filter((id) => !quiet.has(id));
    if (!only.length) continue;

    await notifyLibrary(admin, library, {
      title: `Advent · day ${day}`,
      body: `${ADVENT[day - 1]}. Add yours${album?.data?.name ? ` to ${album.data.name}` : ""}.`,
      url: album ? `/album/${album.id}` : "/",
      tag: "advent",
    }, undefined, only);
    sent.push(library);
  }
  return json({ ok: true, day, sent: sent.length });
});
