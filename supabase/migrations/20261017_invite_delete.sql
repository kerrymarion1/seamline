-- Hugpix: the admin can delete an invite code outright from Settings →
-- Invite codes, next to Plait's admin_invite_add and admin_invite_set_active.
-- Accounts already made with the code are unaffected: handle_new_user checks
-- it only while an account is being made. Apply after 20261017_pins.sql.

create or replace function public.admin_invite_delete(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'fdc'
as $$
begin
  perform public.assert_admin();
  delete from fdc.invite_code where code = lower(trim(p_code));
  if not found then return jsonb_build_object('error', 'No such code.'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.admin_invite_delete(text) from public, anon;
grant execute on function public.admin_invite_delete(text) to authenticated;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true}'::jsonb;
$$;
