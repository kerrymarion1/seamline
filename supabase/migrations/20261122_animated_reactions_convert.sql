-- Part 2 of 3 (see 20261122_animated_reactions.sql): every reaction given so
-- far becomes its new kind, nothing deleted:
--   ❤️ love · 😂 laugh · 👍 like · 🎉 dance · 🤗 smile · 😮 smile
-- (😢 🔥 ✨ 👏 were never used.) Run only once the app that draws the seven
-- is live: the one before it would show these as words.

begin;

-- Every reaction given so far, as its new kind.
update public.seamline_reactions set emoji = case emoji
  when '❤️' then 'love' when '😂' then 'laugh' when '👍' then 'like' when '🎉' then 'dance' when '🤗' then 'smile' when '😮' then 'smile' end
where emoji in ('❤️', '😂', '👍', '🎉', '🤗', '😮');
update public.seamline_message_reactions set emoji = case emoji
  when '❤️' then 'love' when '😂' then 'laugh' when '👍' then 'like' when '🎉' then 'dance' when '🤗' then 'smile' when '😮' then 'smile' end
where emoji in ('❤️', '😂', '👍', '🎉', '🤗', '😮');
update public.seamline_comment_reactions set emoji = case emoji
  when '❤️' then 'love' when '😂' then 'laugh' when '👍' then 'like' when '🎉' then 'dance' when '🤗' then 'smile' when '😮' then 'smile' end
where emoji in ('❤️', '😂', '👍', '🎉', '🤗', '😮');

commit;
