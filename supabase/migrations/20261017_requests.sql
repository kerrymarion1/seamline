-- Seamline: people ask to add photos from a shared album, and the admin
-- approves or declines in Settings, instead of typing their email in first.
-- Apply after 20261017_people.sql.

-- One open request per person per library.
create table if not exists public.seamline_requests (
  library uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  album text not null default '', -- the title of the link they asked from
  created_at timestamptz not null default now(),
  primary key (library, user_id)
);
alter table public.seamline_requests enable row level security;

-- Only the admin sees and clears requests. People ask through
-- seamline_request_uploads below, never by writing to the table.
drop policy if exists seamline_requests_admin_read on public.seamline_requests;
create policy seamline_requests_admin_read on public.seamline_requests
  for select to authenticated
  using (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));
drop policy if exists seamline_requests_admin_delete on public.seamline_requests;
create policy seamline_requests_admin_delete on public.seamline_requests
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and (select public.seamline_is_admin()));

-- The signed-in caller asks to add photos through a link. Returns
-- 'allowed' (they already may), 'asked' (a new request, so the admin is told),
-- 'pending' (they had asked already), 'closed' (the link does not take
-- photos) or 'signed out'. The function seamline-request-uploads calls this
-- and sends the admin a notification on 'asked'.
create or replace function public.seamline_request_uploads(share_token text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  lib uuid;
  link_title text;
  who_email text;
  who_name text;
begin
  if uid is null then
    return 'signed out';
  end if;
  select s.owner, s.title into lib, link_title
  from public.seamline_shares s
  where s.token = share_token
    and s.guest_uploads and s.kind = 'album'
    and (s.expires_at is null or s.expires_at > now());
  if lib is null then
    return 'closed';
  end if;
  if (public.seamline_rights(lib) ->> 'upload')::boolean then
    return 'allowed';
  end if;
  if (select count(*) from public.seamline_requests r where r.library = lib) >= 200 then
    return 'pending';
  end if;
  -- The name the app shows for this account (see userName in src/lib/cloud.js).
  select lower(u.email), coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1)
  ) into who_email, who_name
  from auth.users u where u.id = uid;
  insert into public.seamline_requests (library, user_id, email, name, album)
  values (lib, uid, who_email, left(coalesce(who_name, ''), 60), left(coalesce(link_title, ''), 80))
  on conflict (library, user_id) do nothing;
  if found then
    return 'asked';
  end if;
  return 'pending';
end;
$$;

-- The admin approves (they may add photos from now on) or declines (the
-- request goes; they can ask again).
create or replace function public.seamline_answer_request(person uuid, approve boolean)
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
  select r.email into who from public.seamline_requests r where r.library = lib and r.user_id = person;
  if who is null then
    return;
  end if;
  if approve then
    insert into public.seamline_people as p (library, email, uploads)
    values (lib, who, true)
    on conflict (library, email) do update set uploads = true;
  end if;
  delete from public.seamline_requests r where r.library = lib and r.user_id = person;
end;
$$;

-- The shared page also learns whether the caller has already asked.
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
    'requested', exists (
      select 1 from public.seamline_requests r
      where r.library = s.owner and r.user_id = (select auth.uid())
    ),
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

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true}'::jsonb;
$$;

revoke all on function public.seamline_request_uploads(text) from public;
revoke all on function public.seamline_answer_request(uuid, boolean) from public;
grant execute on function public.seamline_request_uploads(text) to authenticated;
grant execute on function public.seamline_answer_request(uuid, boolean) to authenticated;
