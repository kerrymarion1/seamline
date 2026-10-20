import { cleanPhotos, ensurePhotos, ensureThumbs, fetchMedia, getCloud, publicUrl, refreshPhotos, releasePhotos, supabase } from './cloud'
import { previewOf } from './images'
import { addImages, applyRemote, clearTombstone, getState, historyProjects, tombstones } from './store'

// Keeps projects, albums and templates the same on every signed-in device.
// Each is one row in seamline_docs. A cycle pulls what changed elsewhere, then
// pushes what changed here; when both sides changed the same thing, the one
// saved most recently wins. Photos travel separately: a project or album only
// names them by id, and each device downloads the online copies it lacks.

const LISTS = { project: 'projects', album: 'albums', preset: 'presets' }
const stampOf = (doc) => doc.updatedAt ?? doc.createdAt ?? 0

// Per library, on this device: when each thing was last in step with the
// server, and how far through the server's changes we have read.
const keyFor = (name) => `seamline:${name}:${getCloud().library}`
const read = (name, fallback) => JSON.parse(localStorage.getItem(keyFor(name)) ?? 'null') ?? fallback
const write = (name, value) => localStorage.setItem(keyFor(name), JSON.stringify(value))

let status = { state: 'idle', error: null, lastSync: null, fetching: null }
const listeners = new Set()
const setStatus = (patch) => {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const onSyncStatus = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getSyncStatus = () => status

// Ids of every photo a project, album or template refers to.
export function photoIdsOf(doc) {
  const ids = [...(doc.imageIds ?? [])]
  for (const l of doc.layers ?? []) if (l.imageId) ids.push(l.imageId)
  for (const c of doc.cells ?? []) if (c.imageId) ids.push(c.imageId)
  if (doc.background?.imageId) ids.push(doc.background.imageId)
  return ids
}

async function pull(synced) {
  const since = read('cursor', null)
  let query = supabase.from('seamline_docs').select('*').order('synced_at', { ascending: true })
  if (since) query = query.gt('synced_at', since)
  const { data, error } = await query
  if (error) throw new Error(error.message)

  const local = getState()
  const tombs = tombstones()
  const docs = []
  const removed = []
  for (const row of data) {
    const key = `${row.kind}:${row.id}`
    const theirs = Date.parse(row.updated_at)
    const mine = local[LISTS[row.kind]]?.find((x) => x.id === row.id)
    const tomb = tombs.find((t) => t.kind === row.kind && t.id === row.id)
    if (tomb && tomb.at > theirs) continue // deleted here more recently; the push will say so
    if (row.deleted) {
      if (mine && theirs < stampOf(mine)) continue // edited here since it was deleted there
      if (mine) removed.push({ kind: row.kind, id: row.id })
    } else {
      if (mine && theirs <= stampOf(mine)) continue // ours is as new or newer
      docs.push({ kind: row.kind, doc: row.data })
    }
    synced[key] = theirs
    if (tomb) clearTombstone(row.kind, row.id)
  }
  applyRemote({ docs, removed })
  if (data.length) write('cursor', data.at(-1).synced_at)
}

// Secret albums this device holds that the server no longer shows us: we
// were taken out of them. They leave this device without being deleted
// anywhere else. Ones made here and not yet sent are left alone.
async function dropHidden(synced) {
  if (!getCloud().features.secret) return
  const held = getState().albums.filter((a) => a.secret && synced[`album:${a.id}`])
  if (!held.length) return
  const { data, error } = await supabase
    .from('seamline_docs').select('id').eq('kind', 'album').eq('deleted', false).eq('data->>secret', 'true')
  if (error) return
  const visible = new Set(data.map((row) => row.id))
  const gone = held.filter((a) => !visible.has(a.id))
  if (!gone.length) return
  applyRemote({ removed: gone.map((a) => ({ kind: 'album', id: a.id })) })
  for (const a of gone) delete synced[`album:${a.id}`]
}

async function push(synced) {
  const { library, guest } = getCloud()
  const local = getState()
  const rows = []
  for (const [kind, list] of Object.entries(LISTS)) {
    // A guest only adds to albums and makes their own; the database keeps
    // nothing else they send, so nothing else is sent.
    if (guest && kind !== 'album') continue
    for (const doc of local[list]) {
      const stamp = stampOf(doc)
      if (stamp <= (synced[`${kind}:${doc.id}`] ?? 0)) continue
      // Its photos must be online before another device is told about it. A
      // secret album's are marked as its own, so only its people see them;
      // photos used anywhere else are everyone's again.
      const secret = kind === 'album' && doc.secret ? doc.id : null
      const ids = photoIdsOf(doc)
      await ensurePhotos(ids.map((id) => local.images[id]).filter(Boolean), undefined, { album: secret })
      if (!secret) await releasePhotos(ids)
      rows.push({ library, kind, id: doc.id, data: doc, deleted: false, updated_at: new Date(stamp).toISOString(), stamp })
    }
  }
  // A guest can delete only albums they made; the database ignores the rest.
  const tombs = guest ? tombstones().filter((t) => t.kind === 'album') : tombstones()
  for (const t of tombs) {
    rows.push({ library, kind: t.kind, id: t.id, data: {}, deleted: true, updated_at: new Date(t.at).toISOString(), stamp: t.at })
  }
  if (!rows.length) return
  const send = (list) => supabase.from('seamline_docs').upsert(list.map(({ stamp, ...row }) => row))
  let sent = rows
  const { error } = await send(rows)
  if (error) {
    // One refused change (a secret album we were just taken out of) must not
    // hold up the rest: send them one by one and keep what goes through.
    sent = []
    for (const row of rows) if (!(await send([row])).error) sent.push(row)
    if (!sent.length) throw new Error(error.message)
  }
  for (const row of sent) synced[`${row.kind}:${row.id}`] = row.stamp
  for (const row of sent) if (row.deleted) clearTombstone(row.kind, row.id)
}

// Fetch the full file of photos this device only holds a small copy of, and
// keep it. Resolves true when every one of `ids` is here in full.
const fetching = new Map()
export async function ensureLocal(ids) {
  const waiting = (id) => {
    const img = getState().images[id]
    return !!img && !img.blob && img.kind !== 'video' && !!img.remote
  }
  const one = async (id) => {
    const old = getState().images[id]
    try {
      const res = await fetchMedia(old.remote)
      if (!res.ok) return
      const blob = new Blob([await res.blob()], { type: 'image/jpeg' })
      const previewBlob = await previewOf(blob)
      addImages([{
        id, name: old.name, width: old.width, height: old.height, blob, previewBlob,
        url: URL.createObjectURL(blob), previewUrl: URL.createObjectURL(previewBlob),
        ...(old.edited ? { edited: old.edited } : null),
      }])
      // Give anything still showing the small copy a moment to switch over.
      setTimeout(() => URL.revokeObjectURL(old.previewUrl), 5000)
    } catch {
      // Offline: it stays a small copy for now.
    }
  }
  for (const id of ids.filter(waiting)) {
    if (!fetching.has(id)) fetching.set(id, one(id).finally(() => fetching.delete(id)))
    await fetching.get(id)
  }
  return !ids.some(waiting)
}

// Download online copies of photos this device refers to but does not hold.
// A photo used in a collage or template comes in full, since it is needed to
// build the image. A photo that is only in an album comes as a small copy,
// and its full file is fetched when it is opened or put into a collage.
async function fetchMissing() {
  const local = getState()
  const { photos } = getCloud()
  const inCollage = new Set([...local.projects, ...local.presets].flatMap(photoIdsOf))
  const wanted = new Set()
  for (const list of Object.values(LISTS)) for (const doc of local[list]) for (const id of photoIdsOf(doc)) wanted.add(id)
  // A photo cropped or turned on another device since this one fetched it
  // comes again (its album notes when; see replaceOnline in cloud.js).
  const editedAt = new Map()
  for (const album of local.albums) {
    for (const [id, at] of Object.entries(album.edited ?? {})) editedAt.set(id, Math.max(editedAt.get(id) ?? 0, at))
  }
  const stale = (id) => !!local.images[id] && (local.images[id].edited ?? 0) < (editedAt.get(id) ?? 0)
  const todo = [...wanted].filter((id) => (!local.images[id] || stale(id)) && photos[id])
  for (const [i, id] of todo.entries()) {
    setStatus({ fetching: { done: i, total: todo.length } })
    const row = photos[id]
    const edited = editedAt.get(id) ? { edited: editedAt.get(id) } : null
    const before = local.images[id]
    // Anything still showing the old picture gets a moment to switch over.
    const release = () => before && setTimeout(() => {
      URL.revokeObjectURL(before.previewUrl)
      if (before.blob) URL.revokeObjectURL(before.url)
    }, 5000)
    try {
      if (row.kind === 'video') {
        // Only the still is downloaded; the video plays from its online copy.
        const still = await fetchMedia(publicUrl(row.poster))
        if (!still.ok) continue
        const previewBlob = await still.blob()
        addImages([{
          id, kind: 'video', remote: publicUrl(row.path), name: row.name, width: row.width, height: row.height,
          duration: row.duration, blob: null, previewBlob,
          url: publicUrl(row.path), previewUrl: URL.createObjectURL(previewBlob),
        }])
        continue
      }
      if (row.thumb && !inCollage.has(id)) {
        const small = await fetchMedia(publicUrl(row.thumb))
        if (!small.ok) continue
        const previewBlob = await small.blob()
        addImages([{
          id, remote: publicUrl(row.path), name: row.name, width: row.width, height: row.height, blob: null, previewBlob,
          url: publicUrl(row.path), previewUrl: URL.createObjectURL(previewBlob), ...edited,
        }])
        release()
        continue
      }
      const res = await fetchMedia(publicUrl(row.path))
      if (!res.ok) continue
      const blob = new Blob([await res.blob()], { type: 'image/jpeg' })
      const previewBlob = await previewOf(blob)
      addImages([{
        id, name: row.name, width: row.width, height: row.height, blob, previewBlob,
        url: URL.createObjectURL(blob), previewUrl: URL.createObjectURL(previewBlob), ...edited,
      }])
      release()
    } catch {
      // Offline or a broken file: try again on the next cycle.
    }
  }
  setStatus({ fetching: null })
  // A photo that arrived small and has since gone into a collage.
  await ensureLocal([...inCollage])
}

let running = false
let again = false

// One full cycle. Safe to call often: a call during a cycle queues one more.
export async function syncNow() {
  const cloud = getCloud()
  if (!supabase || !cloud.session || !cloud.canSync || !cloud.uploader) return
  if (running) {
    again = true
    return
  }
  running = true
  setStatus({ state: 'syncing', error: null })
  try {
    const synced = read('synced', {})
    await refreshPhotos()
    await pull(synced)
    await dropHidden(synced)
    await push(synced)
    write('synced', synced)
    await fetchMissing()
    await ensureThumbs(getState().images)
    const used = new Set()
    const local = getState()
    for (const doc of [...local.projects, ...local.albums, ...local.presets, ...historyProjects()]) {
      for (const id of photoIdsOf(doc)) used.add(id)
    }
    await cleanPhotos(used, new Set(local.albums.map((a) => a.id)))
    setStatus({ state: 'idle', lastSync: Date.now() })
  } catch (err) {
    setStatus({ state: 'idle', error: err.message || 'Could not sync' })
  }
  running = false
  if (again) {
    again = false
    syncNow()
  }
}
