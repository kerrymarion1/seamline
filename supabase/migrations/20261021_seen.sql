-- Hugpix: "Seen by", who has seen each photo and when.
--
-- One row per person per photo: when they first saw it and when they last
-- did. A photo counts as seen once it has been open in the viewer for about
-- a second. The people who can see an album can see who has seen its photos;
-- each person can only write their own row, on albums they can see. Nobody
-- deletes rows (they go when the library does).

create table if not exists public.seamline_photo_views (
  library uuid not null,
  album text not null,
  photo text not null,
  user_id uuid not null default auth.uid(),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (library, album, photo, user_id)
);
alter table public.seamline_photo_views enable row level security;

drop policy if exists seamline_photo_views_select on public.seamline_photo_views;
create policy seamline_photo_views_select on public.seamline_photo_views
  for select to authenticated
  using (library = (select public.seamline_my_library()) and public.seamline_sees_album(library, album));

drop policy if exists seamline_photo_views_insert on public.seamline_photo_views;
create policy seamline_photo_views_insert on public.seamline_photo_views
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
  );

drop policy if exists seamline_photo_views_update on public.seamline_photo_views;
create policy seamline_photo_views_update on public.seamline_photo_views
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
  );

-- The app shows "Seen by" only once the table is here.
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true}'::jsonb;
$$;
