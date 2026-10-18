import { useMemo, useSyncExternalStore } from 'react'
import { getCloud, supabase, useCloud, userName } from './cloud'
import { addedAt, useStore } from './store'

// What's new: everything others have done lately, newest first, for the
// /news page and the count on its button. Photos added and albums made come
// from the albums on this device; reactions to my photos and comments come
// from the server (only from albums I can see). When I last looked is kept on
// the device, so what's new since then can be marked.

const SEEN = 'seamline:feedSeen'
const DAYS = 60

export const feedSeenAt = () => {
  try {
    return Number(localStorage.getItem(SEEN) || 0)
  } catch {
    return 0
  }
}

let social = { reactions: [], comments: [] }
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function markFeedSeen() {
  try {
    localStorage.setItem(SEEN, String(Date.now()))
  } catch {
    // Storage blocked: everything just stays marked new.
  }
  emit()
}

export async function refreshFeedSocial() {
  const cloud = getCloud()
  if (!supabase || !cloud.session || !cloud.features.social) return
  const since = new Date(Date.now() - DAYS * 864e5).toISOString()
  const columns = cloud.features.reactions ? 'album, photo, user_id, emoji, created_at' : 'album, photo, user_id, created_at'
  const [reactions, comments] = await Promise.all([
    supabase.from('seamline_reactions').select(columns).gte('created_at', since).order('created_at', { ascending: false }).limit(200),
    supabase.from('seamline_photo_comments').select('id, album, photo, user_id, body, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(200),
  ])
  social = { reactions: (reactions.data ?? []).map((r) => ({ emoji: '❤️', ...r })), comments: comments.data ?? [] }
  emit()
}

// Re-render when the server's part changes, or when I look at the feed.
export const useFeedSocial = () => useSyncExternalStore(subscribe, () => social)

// How much is new since I last looked, for the count on the way in.
export function useFeedCount() {
  const albums = useStore((s) => s.albums)
  const { session } = useCloud()
  const feedSocial = useFeedSocial()
  return useMemo(() => {
    const seen = feedSeenAt()
    return buildFeed({ albums, me: session?.user.id, myName: userName(session), social: feedSocial }).filter((i) => i.at > seen).length
  }, [albums, session, feedSocial])
}

// The feed: [{ key, kind, at, who, whoName, album, photos, emoji, text }],
// kind being 'added', 'album', 'reaction' or 'comment'. `me` and `myName`
// tell my own doings apart (entries from before people were told apart only
// carry a name).
export function buildFeed({ albums, me, myName, social }) {
  const since = Date.now() - DAYS * 864e5
  const items = []
  const byId = new Map(albums.map((a) => [a.id, a]))
  const mine = (by) => (typeof by === 'string' ? by === myName : by?.id === me)

  for (const album of albums) {
    if (album.createdBy && album.createdBy !== me && (album.createdAt ?? 0) > since) {
      items.push({ key: `album:${album.id}`, kind: 'album', at: album.createdAt, who: album.createdBy, album })
    }
    // Photos others added: one item per person, album and day.
    const groups = new Map()
    for (const [id, by] of Object.entries(album.addedBy ?? {})) {
      if (!by || mine(by) || !album.imageIds.includes(id)) continue
      const at = addedAt(id)
      if (at < since) continue
      const who = typeof by === 'string' ? null : by.id
      const key = `${who ?? by}|${new Date(at).toDateString()}`
      const group = groups.get(key) ?? { who, whoName: typeof by === 'string' ? by : by.name, photos: [], at: 0 }
      group.photos.push(id)
      group.at = Math.max(group.at, at)
      groups.set(key, group)
    }
    for (const [key, g] of groups) items.push({ key: `added:${album.id}:${key}`, kind: 'added', album, ...g })
  }

  // Reactions to photos I added.
  for (const r of social.reactions) {
    const album = byId.get(r.album)
    if (!album || r.user_id === me || !mine(album.addedBy?.[r.photo])) continue
    items.push({
      key: `reaction:${r.album}:${r.photo}:${r.user_id}`, kind: 'reaction', at: Date.parse(r.created_at), who: r.user_id, album,
      photos: [r.photo], emoji: r.emoji,
    })
  }
  // Comments by others, anywhere I can see.
  for (const c of social.comments) {
    const album = byId.get(c.album)
    if (!album || c.user_id === me) continue
    items.push({ key: `comment:${c.id}`, kind: 'comment', at: Date.parse(c.created_at), who: c.user_id, album, photos: [c.photo], text: c.body })
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 150)
}
