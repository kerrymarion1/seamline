import { useSyncExternalStore } from 'react'
import { getCloud, supabase } from './cloud'
import { addedAt, isPersonTag } from './store'

// Photos gathered from every album: everyone tagged in them (a person's
// page), and the family's favourites (the most reacted to). Each comes as
// { id, album }, so a tap can open the photo in its own album.

// What to call a tag: a person in Hugpix by their name, anyone else as tagged.
export const tagName = (tag, people) => (isPersonTag(tag) ? people.find((p) => p.id === tag)?.name ?? 'Someone' : tag)

// Names tagged so far that aren't people in Hugpix, most used first: the
// suggestions when tagging.
export function taggedNames(albums) {
  const counts = new Map()
  for (const album of albums) {
    for (const tags of Object.values(album.tags ?? {})) {
      for (const tag of tags) if (!isPersonTag(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

// Every photo `tag` is in, newest first. A name matches whatever its case.
export function taggedPhotos(albums, images, tag) {
  const same = isPersonTag(tag) ? (t) => t === tag : (t) => t.toLowerCase() === tag.toLowerCase()
  const seen = new Set()
  const out = []
  for (const album of albums) {
    for (const [id, tags] of Object.entries(album.tags ?? {})) {
      if (!images[id] || seen.has(id) || !album.imageIds.includes(id) || !tags.some(same)) continue
      seen.add(id)
      out.push({ id, album })
    }
  }
  return out.sort((a, b) => addedAt(b.id) - addedAt(a.id))
}

// ---------- favourites ----------

// Reactions from the family, counted per photo ("album:photo"), read from the
// database (only from albums I can see) and kept here for every screen.
let counts = new Map()
let loadedAt = 0
const listeners = new Set()
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export async function refreshFavourites(force = false) {
  const cloud = getCloud()
  if (!supabase || !cloud.session || !cloud.features.social) return
  if (!force && Date.now() - loadedAt < 60000) return
  loadedAt = Date.now()
  const { data, error } = await supabase.from('seamline_reactions').select('album, photo').limit(10000)
  if (error) return
  const next = new Map()
  for (const r of data) next.set(`${r.album}:${r.photo}`, (next.get(`${r.album}:${r.photo}`) ?? 0) + 1)
  counts = next
  listeners.forEach((l) => l())
}

export const useReactionCounts = () => useSyncExternalStore(subscribe, () => counts)

// The favourites: every photo anyone has reacted to (visitors' hearts on
// shared links count too), the most loved first, then the newest.
export function favouritePhotos(albums, images, reactionCounts, visitorHearts = {}) {
  const seen = new Set()
  const out = []
  for (const album of albums) {
    for (const id of album.imageIds) {
      if (!images[id] || seen.has(id)) continue
      const score = (reactionCounts.get(`${album.id}:${id}`) ?? 0) + (visitorHearts[id] ?? 0)
      if (!score) continue
      seen.add(id)
      out.push({ id, album, score })
    }
  }
  return out.sort((a, b) => b.score - a.score || addedAt(b.id) - addedAt(a.id))
}
