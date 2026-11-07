// Hugpix: someone on the welcome page, with no code yet, asks for one. They
// are signed out, so there is no JWT to check (verify_jwt is off). The
// request is kept in seamline_code_requests and Kerry gets an email at
// kerry@plaitup.com, sent through the same Zoho mailbox as Plait's `mail`
// function, with Reply-To set to the person so answering is one tap.
//
// Not a spam cannon: an address is emailed about at most once a day, and
// after thirty requests in a day the rest wait until tomorrow.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// nodemailer, as in `mail`: denomailer ran out of CPU on the TLS handshake.
import nodemailer from "npm:nodemailer@6.9.16";

const KERRY = "kerry@plaitup.com";
const FROM_ADDRESS = Deno.env.get("ZOHO_SMTP_USER") ?? KERRY;
const APP = "https://hugpix.com";
const DAY = 24 * 60 * 60 * 1000;
const DAILY_LIMIT = 30;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
// One line, no angle brackets, at most `max` characters: it may end up in a subject.
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n<>]+/g, " ").trim().slice(0, max);

type Mail = { to: string; replyTo: string; subject: string; text: string; html: string };

async function sendSmtp(m: Mail) {
  const transport = nodemailer.createTransport({
    host: Deno.env.get("ZOHO_SMTP_HOST") ?? "smtppro.zoho.com",
    port: 465,
    secure: true,
    auth: {
      user: Deno.env.get("ZOHO_SMTP_USER") ?? FROM_ADDRESS,
      // Zoho shows an app password in groups of four; the spaces are not part of it.
      pass: Deno.env.get("ZOHO_SMTP_PASS")!.replace(/\s+/g, ""),
    },
  });
  await transport.sendMail({ from: `Hugpix <${FROM_ADDRESS}>`, ...m });
}

// Zoho's API, for when the mailbox is set up that way instead (see `mail`).
async function sendZohoApi(m: Mail) {
  const dc = Deno.env.get("ZOHO_DC") ?? "com";
  const tok = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: Deno.env.get("ZOHO_REFRESH_TOKEN")!,
      client_id: Deno.env.get("ZOHO_CLIENT_ID")!,
      client_secret: Deno.env.get("ZOHO_CLIENT_SECRET")!,
      grant_type: "refresh_token",
    }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error("Zoho would not refresh the token");
  const auth = { Authorization: `Zoho-oauthtoken ${tok.access_token}` };
  const accounts = await fetch(`https://mail.zoho.${dc}/api/accounts`, { headers: auth }).then((r) => r.json());
  const accountId = accounts?.data?.[0]?.accountId;
  if (!accountId) throw new Error("Zoho returned no mail account");
  const sent = await fetch(`https://mail.zoho.${dc}/api/accounts/${accountId}/messages`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      fromAddress: FROM_ADDRESS, toAddress: m.to, replyTo: m.replyTo, subject: m.subject, content: m.html, mailFormat: "html",
    }),
  });
  if (!sent.ok) throw new Error("Zoho refused the message");
}

function send(m: Mail) {
  if (Deno.env.get("ZOHO_REFRESH_TOKEN")) return sendZohoApi(m);
  if (Deno.env.get("ZOHO_SMTP_PASS")) return sendSmtp(m);
  throw new Error("Mail is not set up: no Zoho password in the function secrets.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let body: { email?: string; name?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return reply({ error: "That doesn't look like an email address." }, 400);
  const name = clean(body.name, 60);
  const note = clean(body.note, 300);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const { count } = await db.from("seamline_code_requests")
    .select("email", { count: "exact", head: true })
    .gte("asked_at", new Date(now.getTime() - DAY).toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return reply({ error: "Lots of people asked today. Try again tomorrow." }, 429);

  const { data: before } = await db.from("seamline_code_requests").select("notified_at").eq("email", email).maybeSingle();
  const { error: saveError } = await db.from("seamline_code_requests")
    .upsert({ email, name: name || null, note: note || null, asked_at: now.toISOString() });
  if (saveError) return reply({ error: "Could not save that. Try again later." }, 500);

  // Asked again the same day: saved, but Kerry has already been told.
  if (before?.notified_at && now.getTime() - Date.parse(before.notified_at) < DAY) return reply({ ok: true });

  const who = name ? `${name} (${email})` : email;
  try {
    await send({
      to: KERRY,
      replyTo: email,
      subject: `Hugpix: ${who} asked for a code`,
      text: `${who} asked for an invite code on the Hugpix welcome page.`
        + (note ? `\n\nThey said: ${note}` : "")
        + `\n\nReply to this email to answer them. Make a code in Hugpix: ${APP}/settings`,
      html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:520px">`
        + `<p><strong>${esc(who)}</strong> asked for an invite code on the Hugpix welcome page.</p>`
        + (note ? `<p>They said: ${esc(note)}</p>` : "")
        + `<p>Reply to this email to answer them. <a href="${APP}/settings">Make a code in Hugpix</a> (Settings, Invite codes).</p>`
        + `</div>`,
    });
  } catch (e) {
    console.error("seamline-code-request: mail failed", e);
    return reply({ error: "Your request is saved, but the email didn't go. Try again later." }, 502);
  }
  await db.from("seamline_code_requests").update({ notified_at: now.toISOString() }).eq("email", email);
  return reply({ ok: true });
});
