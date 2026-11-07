-- Hugpix: more ways to react, to photos and to messages. Apply after
-- 20261018_social.sql.
--
-- A reaction is one of six: ❤️ 😂 😮 😢 👍 🎉. Each person has at most one
-- on a photo, and one on a message, and can change it or take it back.
-- Hearts already given become ❤️.

-- ---------- photos ----------
alter table public.seamline_reactions add column if not exists emoji text not null default '❤️';
alter table public.seamline_reactions drop constraint if exists seamline_reactions_emoji;
alter table public.seamline_reactions add constraint seamline_reactions_emoji
  check (emoji in ('❤️', '😂', '😮', '😢', '👍', '🎉'));

-- Changing your reaction is an update of your own row.
drop policy if exists seamline_reactions_update on public.seamline_reactions;
create policy seamline_reactions_update on public.seamline_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.seamline_sees_album(library, album));

-- ---------- messages ----------
create table if not exists public.seamline_message_reactions (
  message uuid not null references public.seamline_messages (id) on delete cascade,
  chat uuid not null references public.seamline_chats (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '👍', '🎉')),
  created_at timestamptz not null default now(),
  primary key (message, user_id)
);
create index if not exists seamline_message_reactions_by_chat on public.seamline_message_reactions (chat);
alter table public.seamline_message_reactions enable row level security;

-- Seen by the people in the chat (and the admin); given only by them, on a
-- message in that chat.
drop policy if exists seamline_message_reactions_select on public.seamline_message_reactions;
create policy seamline_message_reactions_select on public.seamline_message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.seamline_chats c
    where c.id = chat and c.library = (select public.seamline_my_library())
      and ((select auth.uid()) = any (c.members) or (select public.seamline_is_admin()))
  ));
drop policy if exists seamline_message_reactions_insert on public.seamline_message_reactions;
create policy seamline_message_reactions_insert on public.seamline_message_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.seamline_chats c where c.id = chat and (select auth.uid()) = any (c.members))
    and exists (select 1 from public.seamline_messages m where m.id = message and m.chat = chat)
  );
drop policy if exists seamline_message_reactions_update on public.seamline_message_reactions;
create policy seamline_message_reactions_update on public.seamline_message_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists seamline_message_reactions_delete on public.seamline_message_reactions;
create policy seamline_message_reactions_delete on public.seamline_message_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seamline_message_reactions'
  ) then
    alter publication supabase_realtime add table public.seamline_message_reactions;
  end if;
end $$;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true}'::jsonb;
$$;
