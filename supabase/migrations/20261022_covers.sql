-- Hugpix: several cover photos for a season, one shown each time the front
-- page loads (lib/cloud.js). The table that held one a season now holds any
-- number, each once; the switch "covers" tells the app so. Nothing is lost:
-- the cover already there stays as the first of them.
alter table public.seamline_pins add column if not exists id uuid not null default gen_random_uuid();
-- How the cover sits in its frame, [x, y] percentages (components/CoverFramer), or null for the middle.
alter table public.seamline_pins add column if not exists focus jsonb;
do $$
begin
  -- The old key, one row a season, makes way for one row per photo.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.seamline_pins'::regclass and contype = 'p' and array_length(conkey, 1) = 2
  ) then
    alter table public.seamline_pins drop constraint seamline_pins_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.seamline_pins'::regclass and contype = 'p') then
    alter table public.seamline_pins add primary key (id);
  end if;
end $$;
create unique index if not exists seamline_pins_one_each on public.seamline_pins (library, season, album, image);

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true}'::jsonb;
$$;
