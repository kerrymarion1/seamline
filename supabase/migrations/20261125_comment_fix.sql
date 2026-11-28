-- Hugpix, 2026-11-25: no comment could be saved since 2026-11-07
-- (20261107_threads.sql). Its insert rule looked inside
-- seamline_photo_comments itself to check a reply's parent, which Postgres
-- refuses ("infinite recursion detected in policy"), and it compared the
-- parent with itself (p.id = p.reply_to). The parent check now runs in a
-- helper that reads the table directly.

create or replace function public.seamline_comment_parent_ok(parent uuid, lib uuid, alb text, ph text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.seamline_photo_comments p
    where p.id = parent and p.library = lib and p.album = alb and p.photo = ph
  );
$$;
revoke all on function public.seamline_comment_parent_ok(uuid, uuid, text, text) from public, anon;
grant execute on function public.seamline_comment_parent_ok(uuid, uuid, text, text) to authenticated;

drop policy if exists seamline_photo_comments_insert on public.seamline_photo_comments;
create policy seamline_photo_comments_insert on public.seamline_photo_comments
  for insert to authenticated
  with check (
    library = (select public.seamline_my_library()) and user_id = (select auth.uid())
    and public.seamline_sees_album(library, album)
    and (reply_to is null or public.seamline_comment_parent_ok(reply_to, library, album, photo))
  );
