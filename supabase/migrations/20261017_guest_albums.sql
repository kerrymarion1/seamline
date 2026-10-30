-- Seamline: guests may make albums of their own. Apply after 20261017_guests.sql.
--
-- An album a guest makes is marked with their account (data.createdBy, set
-- here, whatever their app sends) and is theirs to rename, reorder, remove
-- photos from or delete. Every other album stays add-only for them, as
-- before, and collages and templates stay members' only.

create or replace function public.seamline_guest_docs()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid := auth.uid();
  fresh jsonb;
  who jsonb;
begin
  if not public.seamline_is_guest() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An upsert of something that exists goes on to the UPDATE below.
    if exists (select 1 from public.seamline_docs d where d.library = new.library and d.kind = new.kind and d.id = new.id) then
      return new;
    end if;
    if new.kind <> 'album' then
      raise exception 'Guests can only make albums.' using errcode = '42501';
    end if;
    new.data := new.data || jsonb_build_object('createdBy', me::text);
    return new;
  end if;

  -- Their own album: anything goes, and it stays theirs.
  if old.kind = 'album' and old.data ->> 'createdBy' = me::text then
    new.library := old.library;
    new.kind := old.kind;
    new.id := old.id;
    new.data := new.data || jsonb_build_object('createdBy', me::text);
    return new;
  end if;

  -- Anyone else's: only the photos they add are kept, marked as theirs.
  if old.kind <> 'album' or old.deleted then
    raise exception 'Guests can only add photos to albums.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(t.x order by t.n), '[]'::jsonb) into fresh
  from jsonb_array_elements_text(coalesce(new.data -> 'imageIds', '[]'::jsonb)) with ordinality as t(x, n)
  where not coalesce(old.data -> 'imageIds', '[]'::jsonb) ? t.x;
  if jsonb_array_length(fresh) = 0 then
    return null; -- nothing added: leave the album as it is
  end if;
  select jsonb_build_object('id', u.id, 'name', coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'seamline_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(u.email, '@', 1)
  )) into who
  from auth.users u where u.id = me;
  new.library := old.library;
  new.kind := old.kind;
  new.id := old.id;
  new.deleted := false;
  new.data := old.data || jsonb_build_object(
    'imageIds', fresh || coalesce(old.data -> 'imageIds', '[]'::jsonb),
    'addedBy', coalesce(old.data -> 'addedBy', '{}'::jsonb)
      || (select jsonb_object_agg(f.x, who) from jsonb_array_elements_text(fresh) as f(x)),
    'uploadedAt', (extract(epoch from now()) * 1000)::bigint,
    'updatedAt', (extract(epoch from new.updated_at) * 1000)::bigint
  );
  return new;
end;
$$;
