-- Hugpix, 2026-10-25. Two things Kerry asked for; everything here only adds.
--
-- 1. Pausing notifications, the way Plait does it (0166 there): until a time,
--    or 'infinity' for off until turned back on; no row is on. The sending
--    functions (_shared/push.ts) skip anyone paused; the app still shows
--    everything in What's new. Each person sets their own.
create table if not exists public.seamline_quiet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  library uuid not null,
  until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.seamline_quiet enable row level security;
drop policy if exists seamline_quiet_own on public.seamline_quiet;
create policy seamline_quiet_own on public.seamline_quiet
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and library = (select public.seamline_my_library()));

-- 2. Four more reactions (a hug, fire, sparkles, clapping) on photos and on
--    messages, beside the six and the seasonal greetings.
alter table public.seamline_reactions drop constraint if exists seamline_reactions_emoji;
alter table public.seamline_reactions add constraint seamline_reactions_emoji check (
  emoji in (
    '❤️', '😂', '😮', '😢', '👍', '🎉', '🤗', '🔥', '✨', '👏',
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh',
    'reindeer', 'tree', 'ghost', 'bats', 'pumpkin', 'spider',
    'witch', 'cat', 'candy', 'turkey', 'leaves', 'pie',
    'squirrel', 'harvest', 'scarecrow', 'acorns', 'midnight', 'champagne',
    'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
  )
);
alter table public.seamline_message_reactions drop constraint if exists seamline_message_reactions_emoji_check;
alter table public.seamline_message_reactions add constraint seamline_message_reactions_emoji_check check (
  emoji in (
    '❤️', '😂', '😮', '😢', '👍', '🎉', '🤗', '🔥', '✨', '👏',
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh',
    'reindeer', 'tree', 'ghost', 'bats', 'pumpkin', 'spider',
    'witch', 'cat', 'candy', 'turkey', 'leaves', 'pie',
    'squirrel', 'harvest', 'scarecrow', 'acorns', 'midnight', 'champagne',
    'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
  )
);

-- ---------- what this database supports ----------
-- The list as the database had it on 2026-10-25 (select seamline_features()),
-- plus "quiet" and "moreReactions".
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true, "quiet": true, "moreReactions": true}'::jsonb;
$$;
