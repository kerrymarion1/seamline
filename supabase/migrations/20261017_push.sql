-- Seamline: notifications on members' phones and computers when someone adds
-- photos. Everything here only adds; nothing existing is changed. The app
-- keeps notifications switched off until seamline_features() says "push".

-- One row per device that has turned notifications on. The endpoint and keys
-- come from the browser's push service; the functions seamline-notify and
-- seamline-visitor-upload read them (with the service role) to send.
create table if not exists public.seamline_push (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  library uuid not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists seamline_push_library on public.seamline_push (library);
alter table public.seamline_push enable row level security;

-- A member manages only their own devices, and only for their own library.
drop policy if exists seamline_push_own on public.seamline_push;
create policy seamline_push_own on public.seamline_push
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and library = (select public.seamline_my_library()));

-- ---------- what this database supports ----------
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true}'::jsonb;
$$;
