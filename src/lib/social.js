import { getCloud, supabase } from './cloud'

// Hearts and comments on the photos in an album, from the people in the
// library (seamline_reactions and seamline_photo_comments; see
// 20261018_social.sql). Visitors' favourites and notes on share links are
// kept apart, in cloud.js. Whoever added a photo hears about a heart or a
// comment on it, and so does anyone else who has commented on it.

const on = () => !!supabase && !!getCloud().features.social
const library = () => getCloud().library

// Everything for one album: { hearts: [{ photo, user_id }], comments: [...] }.
export async function fetchAlbumSocial(albumId) {
  if (!on()) return { hearts: [], comments: [] }
  const [hearts, comments] = await Promise.all([
    supabase.from('seamline_reactions').select('photo, user_id, created_at').eq('album', albumId),
    supabase.from('seamline_photo_comments').select('*').eq('album', albumId).order('created_at'),
  ])
  return { hearts: hearts.data ?? [], comments: comments.data ?? [] }
}

const tell = (body) => {
  if (getCloud().features.push) supabase.functions.invoke('seamline-notify', { body }).catch(() => {})
}

export async function setHeart(album, photo, hearted) {
  if (hearted) {
    const { error } = await supabase.from('seamline_reactions').insert({ library: library(), album: album.id, photo })
    if (error && error.code !== '23505') throw new Error(error.message) // 23505: hearted already
    if (!error) tell({ album: album.id, name: album.name, photo, heart: true })
  } else {
    const { error } = await supabase.from('seamline_reactions').delete()
      .eq('album', album.id).eq('photo', photo).eq('user_id', getCloud().session.user.id)
    if (error) throw new Error(error.message)
  }
}

export async function addPhotoComment(album, photo, text) {
  const body = text.trim()
  if (!body) return null
  const { data, error } = await supabase.from('seamline_photo_comments')
    .insert({ library: library(), album: album.id, photo, body: body.slice(0, 1000) })
    .select().single()
  if (error) throw new Error(error.message)
  tell({ album: album.id, name: album.name, photo, comment: body.slice(0, 140) })
  return data
}

export async function removePhotoComment(id) {
  const { error } = await supabase.from('seamline_photo_comments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// While an album is open, any heart or comment on it arrives at once.
export function watchAlbumSocial(albumId, onChange) {
  if (!on() || !getCloud().features.live) return () => {}
  const filter = `album=eq.${albumId}`
  const channel = supabase
    .channel(`album-${albumId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_reactions', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_photo_comments', filter }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
