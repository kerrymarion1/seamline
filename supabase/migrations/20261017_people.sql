-- Seamline: only signed-in people may add photos or leave notes on a shared
-- link, and the library's admin decides who. Apply after 20261017_push.sql.
--
-- - Adding photos through a link: members of the library, and people the admin
--   has approved by email (seamline_people), once the link allows it.
-- - Leaving notes: anyone signed in.
-- - The admin can block anyone from either. Looking and hearting stay open.
-- - The admin is the member whose account the library is named after.
-- - The link PIN is gone; signing in replaces it.

-- ---------- links: a switch instead of a PIN ----------
alter table public.seamline_shares
  add column if not exists guest_uploads boolean not null default false;
-- Links that took photos with a PIN keep taking them, now from signed-in people.
update public.seamline_shares set guest_uploads = true where upload_pin is not null and not guest_uploads;
-- upload_pin, pin_failures and pin_locked_until are no longer read.

-- ---------- the admin ----------
create or replace function public.seamline_is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.seamline_members m
    where m.user_id = (select auth.uid()) and m.library = m.user_id
  );
$$;

-- ---------- who may do what ----------
-- One row per person the admin has said something about. Someone with no row
-- may leave notes, and may add photos only if they are a member.
create table if not exists public.seamline_people (
  library uuid not null,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%' and length(email) <= 254),
  uploads boolean not null default false, -- may add photos through links
  comments boolean not null default true, -- may leave notes
  added_at timestamptz not null default now(),
  primary key (library, email)
);
alter table public.seamline_people enable row level security;

drop policy if exists seamline_people_admin on public.seamline_people;
create policy seamline_people_admin on public.seamline_people
  for all to authenticated
  using (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()))
  with check (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));

-- What the signed-in caller may do on the links of library `lib`.
create or replace function public.seamline_rights(lib uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with me as (select (select auth.uid()) as id, lower((select auth.jwt()) ->> 'email') as email)
  select case
    when me.id is null then '{"signedIn": false, "upload": false, "comment": false}'::jsonb
    else jsonb_build_object(
      'signedIn', true,
      'upload', coalesce(
        (select p.uploads from public.seamline_people p where p.library = lib and p.email = me.email),
        exists (select 1 from public.seamline_members m where m.user_id = me.id and m.library = lib)
      ),
      'comment', coalesce(
        (select p.comments from public.seamline_people p where p.library = lib and p.email = me.email),
        true
      )
    )
  end
  from me;
$$;

-- The admin stops (false) or allows (true) someone who added a photo or left
-- a note, by their account; null leaves that right as it is.
create or replace function public.seamline_set_rights(person uuid, may_upload boolean, may_comment boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  lib uuid := public.seamline_my_library();
  who text;
begin
  if not public.seamline_is_admin() then
    raise exception 'Only the admin can do that.' using errcode = '42501';
  end if;
  select lower(u.email) into who from auth.users u where u.id = person;
  if who is null then
    return;
  end if;
  insert into public.seamline_people as p (library, email, uploads, comments)
  values (lib, who, coalesce(may_upload, false), coalesce(may_comment, true))
  on conflict (library, email) do update set
    uploads = coalesce(may_upload, p.uploads),
    comments = coalesce(may_comment, p.comments);
end;
$$;

-- ---------- notes carry the account that left them ----------
-- Added before the functions below, which read it.
alter table public.seamline_comments
  add column if not exists user_id uuid references auth.users (id) on delete set null;

-- ---------- the shared page ----------
-- A link's photos as visitors receive them: without `by`, who added each
-- one, which only the library sees.
create or replace function public.seamline_public_items(items jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select coalesce(jsonb_agg(e.it - 'by' order by e.n), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as e(it, n);
$$;

-- Whether a link takes photos now follows the switch, not the PIN.
create or replace function public.seamline_open_share(share_token text)
returns table(kind text, title text, items jsonb, updated_at timestamptz, allow_uploads boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select s.kind, s.title, public.seamline_public_items(s.items), s.updated_at, (s.guest_uploads and s.kind = 'album')
  from public.seamline_shares s
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now());
$$;

create or replace function public.seamline_get_share(share_token text)
returns table(kind text, title text, items jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select s.kind, s.title, public.seamline_public_items(s.items), s.updated_at
  from public.seamline_shares s
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now());
$$;

-- What the shared page needs beyond the photos: the album's note, what the
-- caller may do, and the notes they have left themselves. One person never
-- sees another's notes.
drop function if exists public.seamline_share_extras(text, text);
create or replace function public.seamline_share_extras(share_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'note', s.note,
    'rights', public.seamline_rights(s.owner),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'item_id', c.item_id, 'author', c.author, 'body', c.body, 'created_at', c.created_at
      ) order by c.created_at)
      from public.seamline_comments c
      where c.share_id = s.id and c.user_id = (select auth.uid())
    ), '[]'::jsonb)
  )
  from public.seamline_shares s
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now());
$$;

-- ---------- notes, from signed-in people only ----------
drop function if exists public.seamline_add_comment(text, text, text, text, text);
create or replace function public.seamline_add_comment(share_token text, item text, body text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  lib uuid;
  name text;
  row public.seamline_comments;
begin
  if uid is null then
    raise exception 'signed out' using errcode = '42501';
  end if;
  if body is null or length(btrim(body)) = 0 or length(body) > 600 then
    return null;
  end if;
  select s.id, s.owner into sid, lib
  from public.seamline_shares s
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now())
    and exists (select 1 from jsonb_array_elements(s.items) it where it->>'id' = item);
  if sid is null then
    return null;
  end if;
  if not (public.seamline_rights(lib) ->> 'comment')::boolean then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if (select count(*) from public.seamline_comments c where c.share_id = sid) >= 1000 then
    return null;
  end if;
  -- The name the app shows for this account (see userName in src/lib/cloud.js).
  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1)
  ) into name
  from auth.users u where u.id = uid;
  insert into public.seamline_comments (share_id, item_id, visitor, author, body, user_id)
  values (sid, item, uid::text, left(coalesce(name, ''), 60), btrim(body), uid)
  returning * into row;
  return jsonb_build_object(
    'id', row.id, 'item_id', row.item_id, 'author', row.author, 'body', row.body, 'created_at', row.created_at
  );
end;
$$;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true}'::jsonb;
$$;

revoke all on function public.seamline_is_admin() from public;
revoke all on function public.seamline_rights(uuid) from public;
revoke all on function public.seamline_set_rights(uuid, boolean, boolean) from public;
revoke all on function public.seamline_share_extras(text) from public;
revoke all on function public.seamline_add_comment(text, text, text) from public;
grant execute on function public.seamline_is_admin() to authenticated;
grant execute on function public.seamline_rights(uuid) to authenticated;
grant execute on function public.seamline_set_rights(uuid, boolean, boolean) to authenticated;
grant execute on function public.seamline_share_extras(text) to anon, authenticated;
grant execute on function public.seamline_add_comment(text, text, text) to authenticated;
