// The name the app shows for an account (see userName in src/lib/cloud.js):
// the one chosen in Seamline's settings first, else any the account carries,
// else made from the email address.
export function nameOf(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const meta = user.user_metadata ?? {};
  const given = meta.seamline_name || meta.full_name || meta.name || meta.display_name;
  if (given) return String(given).trim().slice(0, 60);
  const local = (user.email ?? "").split("@")[0].replace(/[._-]+/g, " ").replace(/\d+$/, "").trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) : "Someone";
}

export const firstName = (user: Parameters<typeof nameOf>[0]) => nameOf(user).split(" ")[0];
