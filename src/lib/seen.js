import { getCloud, supabase } from './cloud'

// "Seen by": who has seen each photo and when (seamline_photo_views, see
// 20261021_seen.sql). A photo counts as seen once it has been open in the
// viewer for about a second (see Album.jsx); the first time is kept, and the
// last. Only people who can see the album can see who has seen its photos.

const ready = () => {
  const cloud = getCloud()
  return !!supabase && !!cloud.session && !!cloud.library && !!cloud.features.seen
}

// Every view of the photos in one album: [{ photo, user_id, first_seen, last_seen }].
export async function fetchSeen(albumId) {
  if (!ready()) return []
  const { data, error } = await supabase
    .from('seamline_photo_views')
    .select('photo, user_id, first_seen, last_seen')
    .eq('library', getCloud().library)
    .eq('album', albumId)
  if (error) return []
  return data
}

// I have seen this photo: the row, as it stands now (null if it couldn't be noted).
export async function markSeen(albumId, photo) {
  if (!ready()) return null
  const cloud = getCloud()
  const { data, error } = await supabase
    .from('seamline_photo_views')
    .upsert(
      { library: cloud.library, album: albumId, photo, user_id: cloud.session.user.id, last_seen: new Date().toISOString() },
      { onConflict: 'library,album,photo,user_id' },
    )
    .select('photo, user_id, first_seen, last_seen')
    .single()
  return error ? null : data
}

// "today 2:14 PM", "yesterday 9:03 AM", "Oct 17, 2:14 PM", "Oct 17, 2025, 2:14 PM".
export function seenTime(at) {
  const d = new Date(at)
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `today ${time}`
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return `yesterday ${time}`
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
  return `${day}, ${time}`
}
