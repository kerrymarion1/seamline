-- Seamline: approved people become guests of the library. A guest opens the
-- app and sees every album, and may add photos and videos to them, but
-- cannot remove, rename or edit anything, make albums, collages or links, or
-- manage notes. The database holds them to that, whatever their app sends.
-- Apply after 20261017_requests.sql.
--
-- A guest is a row in seamline_members with role 'guest', so everything that
-- reads seamline_my_library() (the albums, the photo list, notifications)
-- simply works for them. Approval (seamline_people.uploads) adds and removes
-- that row.

alter table public.seamline_members
  add column if not exists role text not null default 'member' check (role in ('member', 'guest'));

create or replace function public.seamline_is_guest()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.seamline_members m where m.user_id = (select auth.uid()) and m.role = 'guest');
$$;

-- ---------- approval decides guest membership ----------
-- Approving someone for photos (by request, or "Add photos" in People) makes
-- their account a guest; turning it off or taking them off the list ends it.
-- Full members are never touched here.
create or replace function public.seamline_people_to_guests()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  who uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or not new.uploads) then
    select u.id into who from auth.users u where lower(u.email) = old.email;
    if who is not null then
      delete from public.seamline_members m where m.user_id = who and m.library = old.library and m.role = 'guest';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.uploads then
    select u.id into who from auth.users u where lower(u.email) = new.email;
    if who is not null then
      insert into public.seamline_members (user_id, library, role) values (who, new.library, 'guest')
      on conflict (user_id) do nothing;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists seamline_people_to_guests on public.seamline_people;
create trigger seamline_people_to_guests
  after insert or update or delete on public.seamline_people
  for each row execute function public.seamline_people_to_guests();

-- Someone approved by email before they had an account: the app calls this
-- when they sign in, and they become a guest then.
create or replace function public.seamline_claim_guest()
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  lib uuid;
begin
  if uid is null or exists (select 1 from public.seamline_members m where m.user_id = uid) then
    return false;
  end if;
  select p.library into lib from public.seamline_people p
  where p.email = lower((select auth.jwt()) ->> 'email') and p.uploads
  limit 1;
  if lib is null then
    return false;
  end if;
  insert into public.seamline_members (user_id, library, role) values (uid, lib, 'guest') on conflict (user_id) do nothing;
  return true;
end;
$$;

-- Everyone already approved and signed up becomes a guest now.
insert into public.seamline_members (user_id, library, role)
select u.id, p.library, 'guest'
from public.seamline_people p join auth.users u on lower(u.email) = p.email
where p.uploads
on conflict (user_id) do nothing;

-- ---------- what a guest's writes may do ----------
-- Albums: a guest's app saves a whole album, as every app does. Whatever it
-- sends, only the photos it adds are kept, put first and marked as theirs;
-- the rest of the album stays exactly as it was. Nothing else may be added,
-- changed or deleted.
create or replace function public.seamline_guest_docs()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  fresh jsonb;
  who jsonb;
begin
  if not public.seamline_is_guest() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- An upsert of an album that exists goes on to the UPDATE below.
    if exists (select 1 from public.seamline_docs d where d.library = new.library and d.kind = new.kind and d.id = new.id) then
      return new;
    end if;
    raise exception 'Guests can only add photos to albums that exist.' using errcode = '42501';
  end if;
  if old.kind <> 'album' or old.deleted then
    raise exception 'Guests can only add photos to albums.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(t.x order by t.n), '[]'::jsonb) into fresh
  from jsonb_array_elements_text(coalesce(new.data -> 'imageIds', '[]'::jsonb)) with ordinality as t(x, n)
  where not coalesce(old.data -> 'imageIds', '[]'::jsonb) ? t.x;
  if jsonb_array_length(fresh) = 0 then
    return null; -- nothing added: leave the album as it is
  end if;
  select jsonb_build_object('id', u.id, 'name', coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(u.email, '@', 1)
  )) into who
  from auth.users u where u.id = (select auth.uid());
  new.library := old.library;
  new.kind := old.kind;
  new.id := old.id;
  new.deleted := false;
  new.data := old.data || jsonb_build_object(
    'imageIds', fresh || coalesce(old.data -> 'imageIds', '[]'::jsonb),
    'addedBy', coalesce(old.data -> 'addedBy', '{}'::jsonb)
      || (select jsonb_object_agg(f.x, who) from jsonb_array_elements_text(fresh) as f(x)),
    'uploadedAt', (extract(epoch from now()) * 1000)::bigint,
    'updatedAt', (extract(epoch from new.updated_at) * 1000)::bigint
  );
  return new;
end;
$$;

drop trigger if exists seamline_guest_docs on public.seamline_docs;
create trigger seamline_guest_docs
  before insert or update on public.seamline_docs
  for each row execute function public.seamline_guest_docs();

-- Removing anything is for full members only.
drop policy if exists seamline_docs_member_delete on public.seamline_docs;
create policy seamline_docs_member_delete on public.seamline_docs
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

-- Photos: a guest may record the photos they add, not change or remove any.
drop policy if exists seamline_photos_member_update on public.seamline_photos;
create policy seamline_photos_member_update on public.seamline_photos
  for update to authenticated
  using (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()))
  with check (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));
drop policy if exists seamline_photos_member_delete on public.seamline_photos;
create policy seamline_photos_member_delete on public.seamline_photos
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

-- Links are for full members only, all of it.
drop policy if exists seamline_shares_owner_select on public.seamline_shares;
create policy seamline_shares_owner_select on public.seamline_shares
  for select to authenticated
  using (owner = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));
drop policy if exists seamline_shares_owner_insert on public.seamline_shares;
create policy seamline_shares_owner_insert on public.seamline_shares
  for insert to authenticated
  with check (owner = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));
drop policy if exists seamline_shares_owner_update on public.seamline_shares;
create policy seamline_shares_owner_update on public.seamline_shares
  for update to authenticated
  using (owner = (select public.seamline_my_library()) and not (select public.seamline_is_guest()))
  with check (owner = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));
drop policy if exists seamline_shares_owner_delete on public.seamline_shares;
create policy seamline_shares_owner_delete on public.seamline_shares
  for delete to authenticated
  using (owner = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

-- Notes left on links are managed by full members only.
drop policy if exists seamline_comments_owner_delete on public.seamline_comments;
create policy seamline_comments_owner_delete on public.seamline_comments
  for delete to authenticated
  using (
    not (select public.seamline_is_guest())
    and exists (
      select 1 from public.seamline_shares s
      where s.id = seamline_comments.share_id and s.owner = (select public.seamline_my_library())
    )
  );

-- ---------- asking from the front door ----------
-- Someone signed in without access asks to be let in, without needing a
-- shared link. The request goes to the library whose admin's account it is
-- named after (there is one, for now) and is answered in People like any
-- other; approving makes them a guest. Returns 'allowed', 'asked' (new, so
-- the admin is told), 'pending', 'closed' or 'signed out'.
create or replace function public.seamline_request_access()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  lib uuid;
  who_email text;
  who_name text;
begin
  if uid is null then
    return 'signed out';
  end if;
  if exists (select 1 from public.seamline_members m where m.user_id = uid) then
    return 'allowed';
  end if;
  select m.library into lib from public.seamline_members m where m.user_id = m.library order by m.added_at limit 1;
  if lib is null then
    return 'closed';
  end if;
  if (select count(*) from public.seamline_requests r where r.library = lib) >= 200 then
    return 'pending';
  end if;
  select lower(u.email), coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(u.email, '@', 1)
  ) into who_email, who_name
  from auth.users u where u.id = uid;
  insert into public.seamline_requests (library, user_id, email, name, album)
  values (lib, uid, who_email, left(coalesce(who_name, ''), 60), '')
  on conflict (library, user_id) do nothing;
  if found then
    return 'asked';
  end if;
  return 'pending';
end;
$$;

-- Whether the caller is waiting on a request, so the front door can say so.
create or replace function public.seamline_my_request()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.seamline_requests r where r.user_id = (select auth.uid()));
$$;

revoke all on function public.seamline_request_access() from public;
revoke all on function public.seamline_my_request() from public;
grant execute on function public.seamline_request_access() to authenticated;
grant execute on function public.seamline_my_request() to authenticated;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true}'::jsonb;
$$;

revoke all on function public.seamline_is_guest() from public;
revoke all on function public.seamline_claim_guest() from public;
grant execute on function public.seamline_is_guest() to authenticated;
grant execute on function public.seamline_claim_guest() to authenticated;
