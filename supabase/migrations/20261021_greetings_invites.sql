-- Hugpix: seasonal greetings (as in Plait) in messages and as reactions to
-- photos, invites from members with a link that needs no code, and the
-- admin renaming people.
--
-- ---------- 1 and 2. Seasonal greetings (src/components/Greetings.jsx) ----------
-- A message can carry a greeting (effect), with words or a photo, or on its
-- own; the chat list then reads "Sent a greeting". A photo's reaction can
-- be a greeting as well as one of the six emoji.


-- 1. Messages.
alter table public.seamline_messages add column if not exists effect text;
alter table public.seamline_messages drop constraint if exists seamline_messages_effect_check;
alter table public.seamline_messages add constraint seamline_messages_effect_check check (
  effect is null or effect in (
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift',
    'ghost', 'bats', 'pumpkin', 'spider',
    'turkey', 'leaves', 'pie', 'squirrel'
  )
);
alter table public.seamline_messages drop constraint if exists seamline_messages_check;
alter table public.seamline_messages add constraint seamline_messages_check
  check (length(btrim(body)) > 0 or photo is not null or effect is not null);

-- The chat list's last line: the words, else "Sent a photo", else "Sent a greeting".
create or replace function public.seamline_message_posted()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.seamline_chats
  set last_at = new.created_at,
      last_text = case
        when length(btrim(new.body)) > 0 then left(new.body, 140)
        when new.photo is not null then 'Sent a photo'
        else 'Sent a greeting'
      end,
      last_by = new.sender
  where id = new.chat;
  return null;
end;
$$;

create or replace function public.seamline_message_removed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  latest record;
begin
  select m.created_at, m.body, m.photo, m.sender into latest
  from public.seamline_messages m
  where m.chat = old.chat
  order by m.created_at desc
  limit 1;
  if found then
    update public.seamline_chats
    set last_at = latest.created_at,
        last_text = case
          when length(btrim(latest.body)) > 0 then left(latest.body, 140)
          when latest.photo is not null then 'Sent a photo'
          else 'Sent a greeting'
        end,
        last_by = latest.sender
    where id = old.chat;
  else
    update public.seamline_chats set last_text = null, last_by = null where id = old.chat;
  end if;
  return null;
end;
$$;

-- 2. Photo reactions.
alter table public.seamline_reactions drop constraint if exists seamline_reactions_emoji;
alter table public.seamline_reactions add constraint seamline_reactions_emoji check (
  emoji in (
    '❤️', '😂', '😮', '😢', '👍', '🎉',
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift',
    'ghost', 'bats', 'pumpkin', 'spider',
    'turkey', 'leaves', 'pie', 'squirrel'
  )
);


-- ---------- 3. Invites from members, with a link that needs no code ----------
-- Any member (not a guest) can make an invite. Each is one link, good once
-- and for 30 days. Behind it is a one-use code in Plait's list (fdc.invite_code),
-- so the new account is made without anyone typing a code. Whoever uses it
-- joins the inviter's library as a guest straight away (the admin can make
-- them a member in Settings). Someone who already has an account (Plait)
-- just signs in, and joins the same way.

create table if not exists public.seamline_invites (
  token text primary key,
  library uuid not null,
  invited_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid,
  used_at timestamptz
);
alter table public.seamline_invites enable row level security;

-- People see the invites they made; the admin sees all of the library's.
-- Nobody writes to it directly: only through the functions below.
drop policy if exists seamline_invites_select on public.seamline_invites;
create policy seamline_invites_select on public.seamline_invites
  for select to authenticated
  using (
    library = (select public.seamline_my_library())
    and (invited_by = (select auth.uid()) or (select public.seamline_is_admin()))
  );

-- A new invite: its token, which is also its one-use code.
create or replace function public.seamline_invite_create()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  lib uuid;
  what text;
  token text;
  who text;
begin
  select m.library, m.role into lib, what from public.seamline_members m where m.user_id = uid;
  if lib is null then
    raise exception 'Only people in Hugpix can send invites.' using errcode = '42501';
  end if;
  if what = 'guest' and lib <> uid then
    raise exception 'Guests can''t send invites. Ask the admin to make you a member.' using errcode = '42501';
  end if;
  token := 'hug-' || substr(md5(gen_random_uuid()::text), 1, 12);
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''), split_part(u.email, '@', 1))
    into who from auth.users u where u.id = uid;
  insert into fdc.invite_code (code, note, max_uses) values (token, 'Hugpix invite from ' || coalesce(who, 'a member'), 1);
  insert into public.seamline_invites (token, library, invited_by) values (token, lib, uid);
  return token;
end;
$$;

-- What a signed-out invite page may know: whether the link is still good,
-- and the first name of whoever sent it. Null when it isn't.
create or replace function public.seamline_invite_peek(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object('from', split_part(
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''), split_part(u.email, '@', 1)), ' ', 1))
  from public.seamline_invites i
  join auth.users u on u.id = i.invited_by
  where i.token = lower(btrim(p_token)) and i.used_by is null and i.expires_at > now();
$$;

-- Joining with an invite, once signed in. False when it can't be used (or
-- this person is already in a library).
create or replace function public.seamline_invite_claim(p_token text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  inv public.seamline_invites%rowtype;
begin
  if uid is null or exists (select 1 from public.seamline_members m where m.user_id = uid) then
    return false;
  end if;
  select * into inv from public.seamline_invites i
  where i.token = lower(btrim(p_token)) and i.expires_at > now() and (i.used_by is null or i.used_by = uid)
  for update;
  if not found then
    return false;
  end if;
  insert into public.seamline_members (user_id, library, role) values (uid, inv.library, 'guest') on conflict (user_id) do nothing;
  update public.seamline_invites set used_by = uid, used_at = now() where token = inv.token;
  -- Used: its code can't make another account.
  update fdc.invite_code set active = false where code = inv.token;
  return true;
end;
$$;

-- ---------- 4. The admin renaming people ----------
-- The name everyone sees for someone (their Hugpix name), changed by the
-- admin, for people in the admin's library.
create or replace function public.seamline_set_member_name(p_user uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v text := left(btrim(coalesce(p_name, '')), 60);
begin
  if not public.seamline_is_admin() then
    return jsonb_build_object('error', 'Only the admin can rename people.');
  end if;
  if v = '' then
    return jsonb_build_object('error', 'Give them a name.');
  end if;
  if not exists (
    select 1 from public.seamline_members m where m.user_id = p_user and m.library = public.seamline_my_library()
  ) then
    return jsonb_build_object('error', 'They are not in Hugpix.');
  end if;
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('seamline_name', v)
  where id = p_user;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.seamline_invite_create() from public, anon;
revoke all on function public.seamline_invite_claim(text) from public, anon;
revoke all on function public.seamline_set_member_name(uuid, text) from public, anon;
revoke all on function public.seamline_invite_peek(text) from public;
grant execute on function public.seamline_invite_create() to authenticated;
grant execute on function public.seamline_invite_claim(text) to authenticated;
grant execute on function public.seamline_set_member_name(uuid, text) to authenticated;
grant execute on function public.seamline_invite_peek(text) to anon, authenticated;

-- ---------- 5. What this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true}'::jsonb;
$$;
