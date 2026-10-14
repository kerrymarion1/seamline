-- Seamline: thumbnails for photos on demand, album notes, view counts and
-- visitor comments. Everything here only adds; nothing existing is changed.
-- The app asks seamline_features() what the database supports and keeps each
-- of these switched off until this has been applied.

-- ---------- photos on demand ----------
-- A small copy of each photo, so another device can show an album without
-- downloading every full-size file.
alter table public.seamline_photos
  add column if not exists thumb text;

-- ---------- album notes and view counts ----------
alter table public.seamline_shares
  add column if not exists note text not null default '',
  add column if not exists views integer not null default 0,
  add column if not exists last_viewed_at timestamptz;

-- Called by the shared page when a visitor opens a link.
create or replace function public.seamline_mark_view(share_token text)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.seamline_shares s
  set views = s.views + 1, last_viewed_at = now()
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now());
$$;

-- ---------- comments from visitors ----------
create table if not exists public.seamline_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.seamline_shares (id) on delete cascade,
  item_id text not null,
  visitor text not null,
  author text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists seamline_comments_share on public.seamline_comments (share_id);
alter table public.seamline_comments enable row level security;

-- The owner's library reads and removes comments left on its links. Visitors
-- never touch the table directly; they go through the functions below.
drop policy if exists seamline_comments_owner_select on public.seamline_comments;
create policy seamline_comments_owner_select on public.seamline_comments
  for select to authenticated
  using (exists (
    select 1 from public.seamline_shares s
    where s.id = seamline_comments.share_id and s.owner = (select public.seamline_my_library())
  ));
drop policy if exists seamline_comments_owner_delete on public.seamline_comments;
create policy seamline_comments_owner_delete on public.seamline_comments
  for delete to authenticated
  using (exists (
    select 1 from public.seamline_shares s
    where s.id = seamline_comments.share_id and s.owner = (select public.seamline_my_library())
  ));

-- A visitor leaves a note on one photo of a link they hold the code for.
create or replace function public.seamline_add_comment(
  share_token text, item text, visitor_id text, author text, body text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  sid uuid;
  row public.seamline_comments;
begin
  if visitor_id is null or length(visitor_id) < 8 or length(visitor_id) > 64 then
    return null;
  end if;
  if body is null or length(btrim(body)) = 0 or length(body) > 600 then
    return null;
  end if;
  select s.id into sid
  from public.seamline_shares s
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now())
    and exists (select 1 from jsonb_array_elements(s.items) it where it->>'id' = item);
  if sid is null then
    return null;
  end if;
  if (select count(*) from public.seamline_comments c where c.share_id = sid) >= 1000 then
    return null;
  end if;
  insert into public.seamline_comments (share_id, item_id, visitor, author, body)
  values (sid, item, visitor_id, left(coalesce(btrim(author), ''), 60), btrim(body))
  returning * into row;
  return jsonb_build_object(
    'id', row.id, 'item_id', row.item_id, 'author', row.author, 'body', row.body, 'created_at', row.created_at
  );
end;
$$;

-- What the shared page needs beyond the photos: the album's note, and the
-- comments this visitor has left. One visitor never sees another's comments.
create or replace function public.seamline_share_extras(share_token text, visitor_id text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'note', s.note,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'item_id', c.item_id, 'author', c.author, 'body', c.body, 'created_at', c.created_at
      ) order by c.created_at)
      from public.seamline_comments c
      where c.share_id = s.id and c.visitor = visitor_id
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
  select '{"thumbs": true, "notes": true, "views": true, "comments": true}'::jsonb;
$$;

revoke all on function public.seamline_mark_view(text) from public;
revoke all on function public.seamline_add_comment(text, text, text, text, text) from public;
revoke all on function public.seamline_share_extras(text, text) from public;
revoke all on function public.seamline_features() from public;
grant execute on function public.seamline_mark_view(text) to anon, authenticated;
grant execute on function public.seamline_add_comment(text, text, text, text, text) to anon, authenticated;
grant execute on function public.seamline_share_extras(text, text) to anon, authenticated;
grant execute on function public.seamline_features() to anon, authenticated;
