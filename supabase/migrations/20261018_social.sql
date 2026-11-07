-- Hugpix: hearts and comments on album photos, profile photos, instant
-- messages and the admin's guest/member switch. Apply after 20261017_private.sql.

-- ---------- hearts and comments on photos in albums ----------
-- For people in the library (the share links keep their own favourites and
-- notes). Whoever can see an album can heart and comment on its photos; a
-- secret album's stay among its own people.
create table if not exists public.seamline_reactions (
  library uuid not null,
  album text not null,
  photo text not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (library, album, photo, user_id)
);
alter table public.seamline_reactions enable row level security;

create table if not exists public.seamline_photo_comments (
  id uuid primary key default gen_random_uuid(),
  library uuid not null,
  album text not null,
  photo text not null,
  user_id uuid not null default auth.uid(),
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists seamline_photo_comments_by_album on public.seamline_photo_comments (library, album, created_at);
alter table public.seamline_photo_comments enable row level security;

drop policy if exists seamline_reactions_select on public.seamline_reactions;
create policy seamline_reactions_select on public.seamline_reactions
  for select to authenticated
  using (library = (select public.seamline_my_library()) and public.seamline_sees_album(library, album));
drop policy if exists seamline_reactions_insert on public.seamline_reactions;
create policy seamline_reactions_insert on public.seamline_reactions
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
  );
drop policy if exists seamline_reactions_delete on public.seamline_reactions;
create policy seamline_reactions_delete on public.seamline_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists seamline_photo_comments_select on public.seamline_photo_comments;
create policy seamline_photo_comments_select on public.seamline_photo_comments
  for select to authenticated
  using (library = (select public.seamline_my_library()) and public.seamline_sees_album(library, album));
drop policy if exists seamline_photo_comments_insert on public.seamline_photo_comments;
create policy seamline_photo_comments_insert on public.seamline_photo_comments
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
  );
-- Your own comment, or any of them for the admin.
drop policy if exists seamline_photo_comments_delete on public.seamline_photo_comments;
create policy seamline_photo_comments_delete on public.seamline_photo_comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.seamline_is_admin()));

-- ---------- messages: read receipts for everyone in the chat ----------
-- Each person still writes only their own "read up to"; now the others in
-- the chat can see it too, for "Seen".
drop policy if exists seamline_chat_reads_see on public.seamline_chat_reads;
create policy seamline_chat_reads_see on public.seamline_chat_reads
  for select to authenticated
  using (exists (
    select 1 from public.seamline_chats c
    where c.id = chat and ((select auth.uid()) = any (c.members) or (select public.seamline_is_admin()))
  ));

-- ---------- live updates ----------
-- Messages, chats, read receipts, hearts and comments reach open apps the
-- moment they change. Each app only hears about rows it may read.
do $$
declare
  t text;
begin
  foreach t in array array['seamline_messages', 'seamline_chats', 'seamline_chat_reads', 'seamline_reactions', 'seamline_photo_comments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- profile photos ----------
-- Kept in each account's details as seamline_avatar (an address in photo
-- storage); handed out with everyone's names.
create or replace function public.seamline_library_people()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'avatar', p.avatar) order by lower(p.name)), '[]'::jsonb)
  from (
    select u.id,
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
        split_part(u.email, '@', 1)
      ) as name,
      case when m.user_id = m.library then 'admin' else m.role end as role,
      nullif(u.raw_user_meta_data ->> 'seamline_avatar', '') as avatar
    from public.seamline_members m
    join auth.users u on u.id = m.user_id
    where m.library = public.seamline_my_library()
  ) p;
$$;

create or replace function public.seamline_users()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  lib uuid := public.seamline_my_library();
begin
  if not public.seamline_is_admin() then
    raise exception 'Only the admin can see this.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', coalesce(nullif(u.raw_user_meta_data ->> 'seamline_name', ''), nullif(u.raw_user_meta_data ->> 'display_name', ''),
          nullif(u.raw_user_meta_data ->> 'full_name', '')),
        'avatar', nullif(u.raw_user_meta_data ->> 'seamline_avatar', ''),
        'status', case
          when m.user_id = m.library then 'admin'
          when m.role is not null then m.role
          when r.user_id is not null then 'waiting'
          else 'signed up' end,
        'confirmed', u.email_confirmed_at is not null,
        'joined', u.created_at,
        'last_seen', u.last_sign_in_at,
        'via', case when u.raw_user_meta_data ->> 'app' = 'seamline' then 'hugpix' else 'plait' end)
      order by case when m.user_id = m.library then 0 when m.role = 'member' then 1 when m.role = 'guest' then 2
        when r.user_id is not null then 3 else 4 end, u.created_at desc)
    from auth.users u
    left join public.seamline_members m on m.user_id = u.id and m.library = lib
    left join lateral (
      select q.user_id from public.seamline_requests q where q.user_id = u.id and q.library = lib limit 1
    ) r on true
    where m.user_id is not null
      or r.user_id is not null
      or u.raw_user_meta_data ->> 'app' = 'seamline'
      or coalesce(u.raw_user_meta_data ->> 'seamline_name', '') <> ''
  ), '[]'::jsonb);
end $$;

-- ---------- the admin's guest / member switch ----------
-- A guest sees every album and adds to them; a member can also edit, make
-- collages and links, and remove things. The admin is always the admin.
create or replace function public.seamline_set_role(person uuid, new_role text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  lib uuid := public.seamline_my_library();
begin
  if not public.seamline_is_admin() then
    raise exception 'Only the admin can do that.' using errcode = '42501';
  end if;
  if new_role not in ('member', 'guest') then
    raise exception 'A person is a member or a guest.' using errcode = '22023';
  end if;
  if person = lib then
    raise exception 'The admin stays the admin.' using errcode = '42501';
  end if;
  update public.seamline_members set role = new_role where user_id = person and library = lib;
  if not found then
    raise exception 'They are not in Hugpix yet. Approve them first.' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.seamline_set_role(uuid, text) from public, anon;
grant execute on function public.seamline_set_role(uuid, text) to authenticated;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true}'::jsonb;
$$;
