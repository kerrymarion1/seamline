-- Animated, themed reactions (src/components/ReactionFaces.jsx): seven kinds,
-- saved by name and drawn in whatever theme is showing, so a "love" given in
-- November turns into the Christmas one in December.
--   love, laugh, dance, smile, wave, like, rolleyes
--
-- Part 1 of 3, safe to run before the app that uses it is live: the seven
-- join the reactions the database takes (the old emoji stay allowed, so a
-- phone still on an older Hugpix keeps working), and the switch goes on.
-- Part 2, 20261122_animated_reactions_convert.sql, turns the reactions given
-- so far into their kinds: run it only once the new app is live, or the old
-- one shows them as words. Part 3, once Kerry has confirmed the new ones:
-- drop the old emoji from these checks, after converting any given since.

begin;

-- Photos in albums: the old ten, the seven, and the seasonal greetings.
alter table public.seamline_reactions drop constraint if exists seamline_reactions_emoji;
alter table public.seamline_reactions add constraint seamline_reactions_emoji check (emoji = any (array[
  '❤️', '😂', '😮', '😢', '👍', '🎉', '🤗', '🔥', '✨', '👏',
  'love', 'laugh', 'dance', 'smile', 'wave', 'like', 'rolleyes',
  'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh', 'reindeer', 'tree',
  'ghost', 'bats', 'pumpkin', 'spider', 'witch', 'cat', 'candy',
  'turkey', 'leaves', 'pie', 'squirrel', 'harvest', 'scarecrow', 'acorns',
  'midnight', 'champagne', 'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
]));
alter table public.seamline_reactions alter column emoji set default 'love';

-- Messages: the same.
alter table public.seamline_message_reactions drop constraint if exists seamline_message_reactions_emoji_check;
alter table public.seamline_message_reactions add constraint seamline_message_reactions_emoji_check check (emoji = any (array[
  '❤️', '😂', '😮', '😢', '👍', '🎉', '🤗', '🔥', '✨', '👏',
  'love', 'laugh', 'dance', 'smile', 'wave', 'like', 'rolleyes',
  'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh', 'reindeer', 'tree',
  'ghost', 'bats', 'pumpkin', 'spider', 'witch', 'cat', 'candy',
  'turkey', 'leaves', 'pie', 'squirrel', 'harvest', 'scarecrow', 'acorns',
  'midnight', 'champagne', 'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
]));

-- Comments: the old ten and the seven (no greetings on comments).
alter table public.seamline_comment_reactions drop constraint if exists seamline_comment_reactions_emoji_check;
alter table public.seamline_comment_reactions add constraint seamline_comment_reactions_emoji_check check (emoji = any (array[
  '❤️', '😂', '😮', '😢', '👍', '🎉', '🤗', '🔥', '✨', '👏',
  'love', 'laugh', 'dance', 'smile', 'wave', 'like', 'rolleyes'
]));

-- The switch the app waits for before offering the seven: the live list
-- (selected 2026-11-22, 29 switches) plus "animatedReactions".
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true, "quiet": true, "moreReactions": true, "threads": true, "animatedReactions": true}'::jsonb;
$$;

commit;
