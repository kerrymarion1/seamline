-- Hugpix 2: the admin's switch for everyone, and family days.
--
-- 1. seamline_settings: choices the admin makes for the whole library, one
--    row per key. The first is "v2" (lib/v2.js): Hugpix 2 on for everyone.
--    Everyone in the library reads them; only the admin changes them.
-- 2. seamline_family_days: birthdays, anniversaries and other days the family
--    keeps (screens/Holidays.jsx). Anyone in Hugpix adds one; only whoever
--    added it, or the admin, changes or removes it.
-- 3. The switches "settings" and "familyDays" tell the app both are here.
-- Nothing already saved is changed.

-- ---------- 1. the admin's choices for everyone ----------
create table if not exists public.seamline_settings (
  library uuid not null,
  key text not null check (length(key) between 1 and 40),
  value jsonb not null default 'true'::jsonb,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (library, key)
);
alter table public.seamline_settings enable row level security;

drop policy if exists seamline_settings_select on public.seamline_settings;
create policy seamline_settings_select on public.seamline_settings
  for select to authenticated
  using (library = (select public.seamline_my_library()));

drop policy if exists seamline_settings_admin_insert on public.seamline_settings;
create policy seamline_settings_admin_insert on public.seamline_settings
  for insert to authenticated
  with check (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));

drop policy if exists seamline_settings_admin_update on public.seamline_settings;
create policy seamline_settings_admin_update on public.seamline_settings
  for update to authenticated
  using (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()))
  with check (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));

drop policy if exists seamline_settings_admin_delete on public.seamline_settings;
create policy seamline_settings_admin_delete on public.seamline_settings
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));

-- ---------- 2. family days ----------
-- `kind`: 'birthday' or 'anniversary' (then `name` is whose: "Regine", "Kerry
-- and Regine"), or 'day' (then `name` is the day: "Gotcha day"). `person` is
-- the account it belongs to, when it's someone in Hugpix (their picture
-- shows). `year` is optional: the year it started.
create table if not exists public.seamline_family_days (
  id uuid primary key default gen_random_uuid(),
  library uuid not null,
  kind text not null check (kind in ('birthday', 'anniversary', 'day')),
  name text not null check (length(btrim(name)) between 1 and 60),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  year smallint check (year is null or year between 1900 and 2100),
  person uuid references auth.users (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists seamline_family_days_library on public.seamline_family_days (library);
alter table public.seamline_family_days enable row level security;

drop policy if exists seamline_family_days_select on public.seamline_family_days;
create policy seamline_family_days_select on public.seamline_family_days
  for select to authenticated
  using (library = (select public.seamline_my_library()));

drop policy if exists seamline_family_days_insert on public.seamline_family_days;
create policy seamline_family_days_insert on public.seamline_family_days
  for insert to authenticated
  with check (library = (select public.seamline_my_library()) and created_by = (select auth.uid()));

drop policy if exists seamline_family_days_update on public.seamline_family_days;
create policy seamline_family_days_update on public.seamline_family_days
  for update to authenticated
  using (library = (select public.seamline_my_library()) and (created_by = (select auth.uid()) or (select public.seamline_is_admin())))
  with check (library = (select public.seamline_my_library()));

drop policy if exists seamline_family_days_delete on public.seamline_family_days;
create policy seamline_family_days_delete on public.seamline_family_days
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and (created_by = (select auth.uid()) or (select public.seamline_is_admin())));

-- ---------- 3. what this database supports ----------
-- The live list on 2026-11-23 (31 switches), with "settings" and "familyDays" added.
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true, "quiet": true, "threads": true, "moreReactions": true, "animatedReactions": true, "reactionLooks": true, "settings": true, "familyDays": true}'::jsonb;
$$;
