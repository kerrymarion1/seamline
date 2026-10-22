-- Hugpix: albums and their photos reach open apps the moment another device
-- sends them (see components/CloudSync.jsx), so the front page's "happening
-- now" line and the albums themselves move as it happens. Each app only
-- hears about rows it may read. Nothing else changes.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seamline_docs') then
    alter publication supabase_realtime add table public.seamline_docs;
  end if;
end $$;
