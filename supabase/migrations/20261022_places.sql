-- Hugpix: where the photos were taken, on shared pages. A link carries the
-- place of what it shows ({ name, lat, lng }, or null); each photo's own
-- place rides in its item as `place`, a name. Everything here only adds; the
-- app keeps it switched off until seamline_features() says it is here.

alter table public.seamline_shares
  add column if not exists place jsonb;

-- The shared page gets the place too. Its shape changes, so it is made anew.
drop function if exists public.seamline_open_share(text);
create function public.seamline_open_share(share_token text)
returns table(kind text, title text, items jsonb, updated_at timestamptz, allow_uploads boolean, place jsonb)
language sql
stable
security definer
set search_path to ''
as $$
  select s.kind, s.title, public.seamline_public_items(s.items), s.updated_at, (s.guest_uploads and s.kind = 'album'), s.place
  from public.seamline_shares s
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now());
$$;
revoke all on function public.seamline_open_share(text) from public;
grant execute on function public.seamline_open_share(text) to anon, authenticated;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "places": true}'::jsonb;
$$;
