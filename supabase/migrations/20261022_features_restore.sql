-- Hugpix: puts back the switches 20261022_places.sql dropped by mistake
-- (greetings, moreGreetings, memberInvites, rename): it rewrote
-- seamline_features() from an older list. This is the whole list; nothing
-- else changes.
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true}'::jsonb;
$$;
