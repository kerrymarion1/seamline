-- Hugpix, 2026-11-28.
-- 1. Recently deleted: every photo or video record deleted from
--    seamline_photos, whoever or whatever deletes it, is kept 30 days in
--    seamline_photo_trash, and the admin can put it back
--    (seamline_restore_photo). Its files go to trash/ in video storage rather
--    than being deleted (supabase/functions/seamline-media).
-- 2. Advent reminders: who has turned the daily reminder off for themselves
--    (seamline_reminders; on unless a row says off). Sent by seamline-advent,
--    only once the admin turns them on (seamline_settings "advent"; off for now).
-- 3. The features list gains "trash" and "reminders" (35, from the live list).

-- 1. The bin.
create table if not exists public.seamline_photo_trash (
  library uuid not null,
  id text not null,
  path text,
  name text,
  width integer,
  height integer,
  bytes bigint,
  created_at timestamptz,
  kind text,
  poster text,
  duration real,
  thumb text,
  album text,
  added_by uuid,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  primary key (library, id)
);
alter table public.seamline_photo_trash enable row level security;

drop policy if exists seamline_photo_trash_admin_select on public.seamline_photo_trash;
create policy seamline_photo_trash_admin_select on public.seamline_photo_trash
  for select to authenticated
  using (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));

-- Every deleted record goes in the bin (again, if it was there before).
create or replace function public.seamline_photo_to_trash()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.seamline_photo_trash
    (library, id, path, name, width, height, bytes, created_at, kind, poster, duration, thumb, album, added_by, deleted_at, deleted_by)
  values
    (old.library, old.id, old.path, old.name, old.width, old.height, old.bytes, old.created_at, old.kind, old.poster,
     old.duration, old.thumb, old.album, old.added_by, now(), auth.uid())
  on conflict (library, id) do update set
    path = excluded.path, name = excluded.name, width = excluded.width, height = excluded.height, bytes = excluded.bytes,
    created_at = excluded.created_at, kind = excluded.kind, poster = excluded.poster, duration = excluded.duration,
    thumb = excluded.thumb, album = excluded.album, added_by = excluded.added_by,
    deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by;
  return old;
end;
$$;

drop trigger if exists seamline_photos_to_trash on public.seamline_photos;
create trigger seamline_photos_to_trash
  after delete on public.seamline_photos
  for each row execute function public.seamline_photo_to_trash();

-- Put one back (the admin only). It comes back as just added, so the app's
-- clean-up gives it an hour to be put in an album.
create or replace function public.seamline_restore_photo(p_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lib uuid := public.seamline_my_library();
  t public.seamline_photo_trash;
begin
  if not public.seamline_is_admin() then
    raise exception 'Only the admin can put photos back';
  end if;
  select * into t from public.seamline_photo_trash where library = lib and id = p_id;
  if not found then
    raise exception 'That is no longer in Recently deleted';
  end if;
  insert into public.seamline_photos
    (library, id, path, name, width, height, bytes, created_at, kind, poster, duration, thumb, album, added_by)
  values
    (t.library, t.id, t.path, t.name, t.width, t.height, t.bytes, now(), t.kind, t.poster, t.duration, t.thumb, t.album, t.added_by)
  on conflict do nothing;
  delete from public.seamline_photo_trash where library = lib and id = p_id;
end;
$$;
revoke all on function public.seamline_restore_photo(text) from public, anon;
grant execute on function public.seamline_restore_photo(text) to authenticated;

-- What has been in the bin 30 days goes for good (the admin's app, once a day;
-- the files themselves are emptied by seamline-media's "purge").
create or replace function public.seamline_purge_trash()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not public.seamline_is_admin() then
    return 0;
  end if;
  delete from public.seamline_photo_trash
  where library = public.seamline_my_library() and deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.seamline_purge_trash() from public, anon;
grant execute on function public.seamline_purge_trash() to authenticated;

-- 2. Advent reminders: each person's own switch.
create table if not exists public.seamline_reminders (
  user_id uuid primary key default auth.uid(),
  library uuid not null,
  advent boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.seamline_reminders enable row level security;

drop policy if exists seamline_reminders_own_select on public.seamline_reminders;
create policy seamline_reminders_own_select on public.seamline_reminders
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists seamline_reminders_own_insert on public.seamline_reminders;
create policy seamline_reminders_own_insert on public.seamline_reminders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and library = (select public.seamline_my_library()));
drop policy if exists seamline_reminders_own_update on public.seamline_reminders;
create policy seamline_reminders_own_update on public.seamline_reminders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and library = (select public.seamline_my_library()));

-- 3. Features: the live list (33) plus "trash" and "reminders".
create or replace function public.seamline_features()
returns jsonb
language sql immutable set search_path = ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true, "quiet": true, "threads": true, "moreReactions": true, "animatedReactions": true, "reactionLooks": true, "settings": true, "familyDays": true, "trash": true, "reminders": true}'::jsonb;
$$;
