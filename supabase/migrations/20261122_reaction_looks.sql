-- Reactions stay as sent: each one remembers which theme's character it was
-- given as (components/ReactionFaces.jsx), so a love given at Thanksgiving
-- stays the turkey hugging a heart after the season moves on, while new ones
-- take the season showing then. Reactions given before this have no look and
-- show as the everyday smiley.
--   everyday, newyear, july4, halloween, thanksgiving, christmas
-- Safe to run before the app that uses it is live: nothing reads `look` yet,
-- and it may be empty.

begin;

alter table public.seamline_reactions add column if not exists look text
  check (look is null or look = any (array['everyday', 'newyear', 'july4', 'halloween', 'thanksgiving', 'christmas']));
alter table public.seamline_message_reactions add column if not exists look text
  check (look is null or look = any (array['everyday', 'newyear', 'july4', 'halloween', 'thanksgiving', 'christmas']));
alter table public.seamline_comment_reactions add column if not exists look text
  check (look is null or look = any (array['everyday', 'newyear', 'july4', 'halloween', 'thanksgiving', 'christmas']));

-- The switch the app waits for before saving and reading looks: the live list
-- (selected 2026-11-22, 30 switches) plus "reactionLooks".
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true, "quiet": true, "moreReactions": true, "threads": true, "animatedReactions": true, "reactionLooks": true}'::jsonb;
$$;

commit;
