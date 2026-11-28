-- Hugpix: deleting messages, and clearing a chat for yourself.
--
-- 1. Whoever sent a message could already delete it (seamline_messages_delete);
--    this keeps the chat list right afterwards. When a message goes, its
--    chat's last line becomes the newest one left (or none), and the chat
--    keeps its place in the list.
-- 2. "Delete chat" clears a chat for one person only: their row in
--    seamline_chat_reads notes when (cleared_at). Messages from before then
--    are hidden from them, and the chat leaves their list until someone
--    writes again. The others in it keep everything.

create or replace function public.seamline_message_removed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  latest record;
begin
  select m.created_at, m.body, m.sender into latest
  from public.seamline_messages m
  where m.chat = old.chat
  order by m.created_at desc
  limit 1;
  if found then
    update public.seamline_chats
    set last_at = latest.created_at,
        last_text = case when length(btrim(latest.body)) > 0 then left(latest.body, 140) else 'Sent a photo' end,
        last_by = latest.sender
    where id = old.chat;
  else
    update public.seamline_chats set last_text = null, last_by = null where id = old.chat;
  end if;
  return null;
end;
$$;

drop trigger if exists seamline_message_removed on public.seamline_messages;
create trigger seamline_message_removed
  after delete on public.seamline_messages
  for each row execute function public.seamline_message_removed();

alter table public.seamline_chat_reads add column if not exists cleared_at timestamptz;

-- The app clears chats only once the column is there.
create or replace function public.seamline_features()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select '{"thumbs": true, "notes": true, "views": true, "comments": true, "push": true, "people": true, "requests": true, "guests": true, "pins": true, "inviteDelete": true, "users": true, "secret": true, "messages": true, "social": true, "live": true, "roles": true, "avatars": true, "reactions": true, "clearing": true}'::jsonb;
$$;
