-- Hugpix: the seasonal greetings as reactions to messages too, as they already
-- are to album photos (see 20261021_more_greetings.sql for the same list on
-- seamline_reactions). Only the check on the reaction changes.
alter table public.seamline_message_reactions drop constraint if exists seamline_message_reactions_emoji_check;
alter table public.seamline_message_reactions add constraint seamline_message_reactions_emoji_check check (
  emoji in (
    '❤️', '😂', '😮', '😢', '👍', '🎉',
    'flurry', 'gingerbread', 'penguin', 'snowman', 'gift', 'sleigh',
    'reindeer', 'tree', 'ghost', 'bats', 'pumpkin', 'spider',
    'witch', 'cat', 'candy', 'turkey', 'leaves', 'pie',
    'squirrel', 'harvest', 'scarecrow', 'acorns', 'midnight', 'champagne',
    'confetti', 'goldworks', 'fireworks', 'flag', 'eagle', 'sparkler'
  )
);
