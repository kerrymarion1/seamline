-- Shorter share links: new ones are 8 letters and numbers (62^8, about 218
-- trillion), not 22 characters (src/lib/cloud.js linkCode). Links already
-- sent keep their addresses.
alter table public.seamline_shares
  drop constraint seamline_shares_token_check,
  add constraint seamline_shares_token_check check (length(token) >= 8);
