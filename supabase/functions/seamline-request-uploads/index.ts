// Seamline: a signed-in person asks, from a shared album, to add photos.
// The request itself is made by seamline_request_uploads in the database, as
// them; when it is new, the library's admin gets a notification. The admin is
// the member the library is named after, so their id is the library's.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { firstName } from "../_shared/names.ts";
import { notifyLibrary } from "../_shared/push.ts";

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

  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth?.user) return reply({ status: "signed out" });

  // { token } asks from a shared album; { access: true } asks from the app's
  // front door, with no link (seamline_request_access).
  let token = "";
  let access = false;
  try {
    const body = await req.json();
    token = String(body.token ?? "");
    access = body.access === true;
  } catch {
    return reply({ error: "Bad request" }, 400);
  }

  const { data: status, error } = access
    ? await caller.rpc("seamline_request_access")
    : await caller.rpc("seamline_request_uploads", { share_token: token });
  if (error) return reply({ error: "Could not send that request." }, 500);

  if (status === "asked") {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // The request just made says which library it went to; a link also gives its title.
    const { data: asked } = await admin.from("seamline_requests").select("library, album").eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (asked) {
      const sent = notifyLibrary(admin, asked.library, {
        title: "Seamline",
        body: asked.album
          ? `${firstName(auth.user)} asked to add photos to ${asked.album}`
          : `${firstName(auth.user)} asked to see the albums`,
        url: "/settings",
        tag: `request-${auth.user.id}`,
      }, undefined, asked.library).catch(() => {});
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(sent);
      else await sent;
    }
  }
  return reply({ status: status === "asked" ? "pending" : status });
});
