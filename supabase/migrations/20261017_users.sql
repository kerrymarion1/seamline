-- Hugpix: the admin's list of everyone on Hugpix, for Settings → Users.
-- That is the library's members and guests, anyone waiting on a request, and
-- anyone who made their account through Hugpix (app 'seamline') or has a
-- Hugpix screen name, even if they never asked to come in. Plait accounts
-- that have never touched Hugpix are left out. Only the admin may call it.
-- Apply after 20261017_code_requests.sql.

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

revoke all on function public.seamline_users() from public, anon;
grant execute on function public.seamline_users() to authenticated;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true}'::jsonb;
$$;
