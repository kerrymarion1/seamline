-- Hugpix: more seasonal greetings (src/components/GreetingsMore.jsx). Beside
-- the 13 from before (20261021_greetings_invites.sql): Santa's sleigh, a
-- reindeer and a lit tree for Christmas; a witch, a black cat and a candy
-- shower for Halloween; a horn of plenty, a scarecrow and falling acorns for
-- Thanksgiving; and sets for New Year (midnight, champagne, confetti, gold
-- fireworks) and the Fourth of July (fireworks, the flag, an eagle, a
-- sparkler). Messages and photo reactions may carry any of them.

alter table public.seamline_messages drop constraint if exists seamline_messages_effect_check;
alter table public.seamline_messages add constraint seamline_messages_effect_check check (
  effect is null or effect in (
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh',
    'reindeer', 'tree', 'ghost', 'bats', 'pumpkin', 'spider',
    'witch', 'cat', 'candy', 'turkey', 'leaves', 'pie',
    'squirrel', 'harvest', 'scarecrow', 'acorns', 'midnight', 'champagne',
    'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
  )
);

alter table public.seamline_reactions drop constraint if exists seamline_reactions_emoji;
alter table public.seamline_reactions add constraint seamline_reactions_emoji check (
  emoji in (
    '❤️', '😂', '😮', '😢', '👍', '🎉',
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh',
    'reindeer', 'tree', 'ghost', 'bats', 'pumpkin', 'spider',
    'witch', 'cat', 'candy', 'turkey', 'leaves', 'pie',
    'squirrel', 'harvest', 'scarecrow', 'acorns', 'midnight', 'champagne',
    'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
  )
);

-- The app offers the new ones only once this has run.
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true}'::jsonb;
$$;
