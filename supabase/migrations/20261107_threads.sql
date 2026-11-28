-- Hugpix, 2026-11-07: comments that talk to each other. Everything here only
-- adds; the app keeps it switched off until seamline_features() says "threads".
--
-- 1. A comment can answer another on the same photo (reply_to). Replies to a
--    reply hang under the first comment; deleting a comment takes its replies.
alter table public.seamline_photo_comments
  add column if not exists reply_to uuid references public.seamline_photo_comments (id) on delete cascade;

drop policy if exists seamline_photo_comments_insert on public.seamline_photo_comments;
create policy seamline_photo_comments_insert on public.seamline_photo_comments
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
    and (reply_to is null or exists (
      select 1 from public.seamline_photo_comments p
      where p.id = reply_to and p.library = seamline_photo_comments.library
        and p.album = seamline_photo_comments.album and p.photo = seamline_photo_comments.photo
    ))
  );

-- 2. A quick reaction to a comment: one each, from the same set as photos.
create table if not exists public.seamline_comment_reactions (
  comment uuid not null references public.seamline_photo_comments (id) on delete cascade,
  library uuid not null,
  album text not null,
  user_id uuid not null default auth.uid(),
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '👍', '🎉', '🤗', '🔥', '✨', '👏')),
  created_at timestamptz not null default now(),
  primary key (comment, user_id)
);
create index if not exists seamline_comment_reactions_by_album on public.seamline_comment_reactions (library, album);
alter table public.seamline_comment_reactions enable row level security;

drop policy if exists seamline_comment_reactions_select on public.seamline_comment_reactions;
create policy seamline_comment_reactions_select on public.seamline_comment_reactions
  for select to authenticated
  using (library = (select public.seamline_my_library()) and public.seamline_sees_album(library, album));
drop policy if exists seamline_comment_reactions_insert on public.seamline_comment_reactions;
create policy seamline_comment_reactions_insert on public.seamline_comment_reactions
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
    and exists (select 1 from public.seamline_photo_comments c where c.id = comment and c.library = seamline_comment_reactions.library and c.album = seamline_comment_reactions.album)
  );
drop policy if exists seamline_comment_reactions_update on public.seamline_comment_reactions;
create policy seamline_comment_reactions_update on public.seamline_comment_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists seamline_comment_reactions_delete on public.seamline_comment_reactions;
create policy seamline_comment_reactions_delete on public.seamline_comment_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Open albums hear about them as they happen, like comments and reactions.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seamline_comment_reactions') then
    alter publication supabase_realtime add table public.seamline_comment_reactions;
  end if;
end $$;

-- ---------- what this database supports ----------
-- The list as the database had it on 2026-11-07 (select seamline_features()),
-- plus "threads".
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true, "seen": true, "greetings": true, "memberInvites": true, "rename": true, "moreGreetings": true, "places": true, "covers": true, "quiet": true, "moreReactions": true, "threads": true}'::jsonb;
$$;
