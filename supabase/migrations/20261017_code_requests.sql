-- Hugpix: people asking for an invite code from the welcome page, one row
-- per address. Only the seamline-code-request function writes it (with the
-- service role), and it emails Kerry as it does; the row is what keeps that
-- to one email per address a day and thirty a day in all. Nobody reads or
-- writes it through the API: row level security is on with no policies.
-- Apply after 20261017_invite_delete.sql.

create table if not exists public.seamline_code_requests (
  email text primary key check (length(email) between 3 and 254),
  name text check (length(name) <= 60),
  note text check (length(note) <= 300),
  asked_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.seamline_code_requests enable row level security;
create index if not exists seamline_code_requests_asked on public.seamline_code_requests (asked_at);
