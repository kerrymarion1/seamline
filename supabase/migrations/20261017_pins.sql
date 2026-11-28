-- Seamline: the photo pinned to lead the front page, shared by the whole
-- library, one per season ('everyday', 'halloween', 'thanksgiving',
-- 'christmas'). Everyone in the library sees it; members pin and unpin,
-- guests only see. Apply after 20261017_guest_albums.sql.

create table if not exists public.seamline_pins (
  library uuid not null,
  season text not null check (length(season) between 1 and 40),
  album text not null,
  image text not null,
  pinned_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (library, season)
);
alter table public.seamline_pins enable row level security;

drop policy if exists seamline_pins_select on public.seamline_pins;
create policy seamline_pins_select on public.seamline_pins
  for select to authenticated
  using (library = (select public.seamline_my_library()));

drop policy if exists seamline_pins_member_insert on public.seamline_pins;
create policy seamline_pins_member_insert on public.seamline_pins
  for insert to authenticated
  with check (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

drop policy if exists seamline_pins_member_update on public.seamline_pins;
create policy seamline_pins_member_update on public.seamline_pins
  for update to authenticated
  using (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()))
  with check (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

drop policy if exists seamline_pins_member_delete on public.seamline_pins;
create policy seamline_pins_member_delete on public.seamline_pins
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true}'::jsonb;
$$;
