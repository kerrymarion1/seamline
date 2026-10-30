-- Hugpix: secret albums and messages. Apply after 20261017_users.sql.
--
-- Secret albums. An album whose data has "secret": true is seen only by the
-- accounts in its "members" list, and by the admin. Its photos' rows carry the
-- album's id (seamline_photos.album) and are hidden the same way, so nobody
-- else's app can show them, or clear them away as unused photos. The photo
-- files themselves keep their long unguessable addresses, as every photo does.
--
-- Messages. Chats between people in the same library, one to one or a few
-- together, with text and photos. The people in a chat see it, and so does
-- the admin. Each person's "read up to" time is kept for unread counts.

-- ---------- everyone in my library, for choosing people ----------
create or replace function public.seamline_library_people()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role) order by lower(p.name)), '[]'::jsonb)
  from (
    select u.id,
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
        split_part(u.email, '@', 1)
      ) as name,
      case when m.user_id = m.library then 'admin' else m.role end as role
    from public.seamline_members m
    join auth.users u on u.id = m.user_id
    where m.library = public.seamline_my_library()
  ) p;
$$;

-- ---------- secret albums ----------
-- Whether the signed-in person may see a document: anything not secret, a
-- secret album they are in, or anything at all for the admin.
create or replace function public.seamline_sees(doc jsonb)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(doc ->> 'secret', '') <> 'true'
    or coalesce(doc -> 'members', '[]'::jsonb) ? ((select auth.uid())::text)
    or public.seamline_is_admin();
$$;

drop policy if exists seamline_docs_member_select on public.seamline_docs;
create policy seamline_docs_member_select on public.seamline_docs
  for select to authenticated
  using (library = (select public.seamline_my_library()) and public.seamline_sees(data));

drop policy if exists seamline_docs_member_insert on public.seamline_docs;
create policy seamline_docs_member_insert on public.seamline_docs
  for insert to authenticated
  with check (library = (select public.seamline_my_library()) and public.seamline_sees(data));

-- Changing an album you can't see is refused, and so is a change that would
-- leave you outside it (only the admin may do that).
drop policy if exists seamline_docs_member_update on public.seamline_docs;
create policy seamline_docs_member_update on public.seamline_docs
  for update to authenticated
  using (library = (select public.seamline_my_library()) and public.seamline_sees(data))
  with check (library = (select public.seamline_my_library()) and public.seamline_sees(data));

drop policy if exists seamline_docs_member_delete on public.seamline_docs;
create policy seamline_docs_member_delete on public.seamline_docs
  for delete to authenticated
  using (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()) and public.seamline_sees(data));

-- Photos in a secret album. `album` is set when a photo goes online for one;
-- `added_by` lets the person uploading see their own rows before the album
-- itself has reached the server.
alter table public.seamline_photos add column if not exists album text;
alter table public.seamline_photos add column if not exists added_by uuid default auth.uid();

create or replace function public.seamline_sees_album(lib uuid, album_id text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.seamline_is_admin() or exists (
    select 1 from public.seamline_docs d
    where d.library = lib and d.kind = 'album' and d.id = album_id and public.seamline_sees(d.data)
  );
$$;

drop policy if exists seamline_photos_member_select on public.seamline_photos;
create policy seamline_photos_member_select on public.seamline_photos
  for select to authenticated
  using (
    library = (select public.seamline_my_library())
    and (album is null or added_by = (select auth.uid()) or public.seamline_sees_album(library, album))
  );

drop policy if exists seamline_photos_member_insert on public.seamline_photos;
create policy seamline_photos_member_insert on public.seamline_photos
  for insert to authenticated
  with check (library = (select public.seamline_my_library()) and (added_by is null or added_by = (select auth.uid())));

drop policy if exists seamline_photos_member_update on public.seamline_photos;
create policy seamline_photos_member_update on public.seamline_photos
  for update to authenticated
  using (
    library = (select public.seamline_my_library()) and not (select public.seamline_is_guest())
    and (album is null or added_by = (select auth.uid()) or public.seamline_sees_album(library, album))
  )
  with check (library = (select public.seamline_my_library()) and not (select public.seamline_is_guest()));

drop policy if exists seamline_photos_member_delete on public.seamline_photos;
create policy seamline_photos_member_delete on public.seamline_photos
  for delete to authenticated
  using (
    library = (select public.seamline_my_library()) and not (select public.seamline_is_guest())
    and (album is null or added_by = (select auth.uid()) or public.seamline_sees_album(library, album))
  );

-- ---------- messages ----------
create table if not exists public.seamline_chats (
  id uuid primary key default gen_random_uuid(),
  library uuid not null,
  members uuid[] not null check (cardinality(members) between 2 and 30),
  title text check (length(title) <= 60),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  last_text text,
  last_by uuid
);
create index if not exists seamline_chats_recent on public.seamline_chats (library, last_at desc);
alter table public.seamline_chats enable row level security;

create table if not exists public.seamline_messages (
  id uuid primary key default gen_random_uuid(),
  chat uuid not null references public.seamline_chats (id) on delete cascade,
  sender uuid not null default auth.uid(),
  body text not null default '' check (length(body) <= 4000),
  photo jsonb, -- { path, thumb, width, height }
  created_at timestamptz not null default now(),
  check (length(btrim(body)) > 0 or photo is not null)
);
create index if not exists seamline_messages_by_chat on public.seamline_messages (chat, created_at);
alter table public.seamline_messages enable row level security;

create table if not exists public.seamline_chat_reads (
  chat uuid not null references public.seamline_chats (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (chat, user_id)
);
alter table public.seamline_chat_reads enable row level security;

-- Everyone in a chat must be in the caller's library.
create or replace function public.seamline_all_in_library(people uuid[])
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not exists (
    select 1 from unnest(people) as p(id)
    where not exists (
      select 1 from public.seamline_members m where m.user_id = p.id and m.library = public.seamline_my_library()
    )
  );
$$;

drop policy if exists seamline_chats_select on public.seamline_chats;
create policy seamline_chats_select on public.seamline_chats
  for select to authenticated
  using (
    library = (select public.seamline_my_library())
    and ((select auth.uid()) = any (members) or (select public.seamline_is_admin()))
  );
drop policy if exists seamline_chats_insert on public.seamline_chats;
create policy seamline_chats_insert on public.seamline_chats
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and created_by = (select auth.uid())
    and (select auth.uid()) = any (members) and public.seamline_all_in_library(members)
  );
-- People in a chat may rename it or add people; they stay in it themselves.
drop policy if exists seamline_chats_update on public.seamline_chats;
create policy seamline_chats_update on public.seamline_chats
  for update to authenticated
  using (library = (select public.seamline_my_library()) and (select auth.uid()) = any (members))
  with check (
    library = (select public.seamline_my_library()) and (select auth.uid()) = any (members)
    and public.seamline_all_in_library(members)
  );

drop policy if exists seamline_messages_select on public.seamline_messages;
create policy seamline_messages_select on public.seamline_messages
  for select to authenticated
  using (exists (
    select 1 from public.seamline_chats c
    where c.id = chat and c.library = (select public.seamline_my_library())
      and ((select auth.uid()) = any (c.members) or (select public.seamline_is_admin()))
  ));
drop policy if exists seamline_messages_insert on public.seamline_messages;
create policy seamline_messages_insert on public.seamline_messages
  for insert to authenticated
  with check (
    sender = (select auth.uid())
    and exists (select 1 from public.seamline_chats c where c.id = chat and (select auth.uid()) = any (c.members))
  );
drop policy if exists seamline_messages_delete on public.seamline_messages;
create policy seamline_messages_delete on public.seamline_messages
  for delete to authenticated
  using (sender = (select auth.uid()));

drop policy if exists seamline_chat_reads_own on public.seamline_chat_reads;
create policy seamline_chat_reads_own on public.seamline_chat_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A new message moves its chat to the top and leaves a line for the list.
create or replace function public.seamline_message_posted()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.seamline_chats
  set last_at = new.created_at,
      last_text = case when length(btrim(new.body)) > 0 then left(new.body, 140) else 'Sent a photo' end,
      last_by = new.sender
  where id = new.chat;
  return null;
end;
$$;
drop trigger if exists seamline_message_posted on public.seamline_messages;
create trigger seamline_message_posted
  after insert on public.seamline_messages
  for each row execute function public.seamline_message_posted();

revoke all on function public.seamline_library_people() from public, anon;
revoke all on function public.seamline_sees(jsonb) from public, anon;
revoke all on function public.seamline_sees_album(uuid, text) from public, anon;
revoke all on function public.seamline_all_in_library(uuid[]) from public, anon;
grant execute on function public.seamline_library_people() to authenticated;
grant execute on function public.seamline_sees(jsonb) to authenticated;
grant execute on function public.seamline_sees_album(uuid, text) to authenticated;
grant execute on function public.seamline_all_in_library(uuid[]) to authenticated;

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true}'::jsonb;
$$;
