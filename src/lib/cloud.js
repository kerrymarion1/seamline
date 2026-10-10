import { createClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'

// Everything online lives in one "library" that its members share: photos in
// Supabase Storage with a registry row each (seamline_photos), links to them
// (seamline_shares) reachable by anyone holding a link's random code, and the
// projects and albums themselves (seamline_docs, see sync.js).
const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY
const BUCKET = 'seamline'
const UPLOAD_EDGE = 2560 // long edge of uploaded copies
const UPLOAD_QUALITY = 0.88
export const STORAGE_LIMIT = 1024 ** 3 // free plan: 1 GB

export const supabase = URL_ && KEY ? createClient(URL_, KEY) : null

// ---------- sign-in state, kept outside React ----------

// `hearts` counts visitors' favourites: per photo across all links, and per link.
const NO_HEARTS = { byItem: {}, byShare: {} }
const AUTO_SYNC = 'seamline:autoSync'
// `autoSync` keeps albums online ahead of time so sharing one is only a link;
// `syncing` is { id, done, total } for the album being put online right now.
// `library` is the id everything is filed under; `photos` maps a photo's id to
// its online copy; `canSync` is false until the database has been set up for it.
let state = {
  configured: !!supabase, loading: !!supabase, session: null, uploader: false, shares: [], hearts: NO_HEARTS,
  library: null, photos: {}, canSync: false,
  recovering: false, // arrived from a password-reset email and must choose a new one
  autoSync: localStorage.getItem(AUTO_SYNC) !== 'off', syncing: null, syncError: null,
}
const listeners = new Set()
const set = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useCloud = () => useSyncExternalStore(subscribe, () => state)
export const getCloud = () => state
export const onCloud = subscribe

async function refresh(session) {
  if (!session) {
    return set({ loading: false, session: null, uploader: false, shares: [], hearts: NO_HEARTS, library: null, photos: {}, canSync: false })
  }
  set({ session })
  const [{ data: uploader }, { data: shares }, lib] = await Promise.all([
    supabase.rpc('seamline_is_uploader'),
    supabase.from('seamline_shares').select('*').order('created_at', { ascending: false }),
    supabase.rpc('seamline_my_library'),
  ])
  // Before the database knows about libraries, fall back to links only.
  const canSync = !lib.error && !!lib.data
  set({
    loading: false, uploader: !!uploader, shares: shares ?? [],
    library: canSync ? lib.data : session.user.id, canSync,
  })
  if (canSync) await refreshPhotos()
  await refreshHearts()
}

// Re-read which photos are online, adopting any that older links put there
// before the registry existed.
export async function refreshPhotos() {
  if (!supabase || !state.session || !state.canSync) return
  const { data } = await supabase.from('seamline_photos').select('*')
  if (!data) return
  const photos = Object.fromEntries(data.map((row) => [row.id, row]))
  const strays = new Map()
  for (const sh of state.shares) {
    if (sh.kind === 'carousel') continue
    for (const it of sh.items) if (!it.visitor && !photos[it.id] && !strays.has(it.id)) strays.set(it.id, it)
  }
  if (strays.size) {
    const rows = [...strays.values()].map(({ id, path, name, width, height, bytes }) => ({
      library: state.library, id, path, name, width, height, bytes,
    }))
    const { data: added } = await supabase.from('seamline_photos').upsert(rows).select()
    for (const row of added ?? []) photos[row.id] = row
  }
  set({ photos })
}

// Re-read the owner's links, for example to pick up photos visitors added.
export async function refreshShares() {
  if (!supabase || !state.session) return
  const { data } = await supabase.from('seamline_shares').select('*').order('created_at', { ascending: false })
  if (data) set({ shares: data })
}

// Re-read the favourites visitors have left on the owner's links.
export async function refreshHearts() {
  if (!supabase || !state.session) return
  const { data } = await supabase.from('seamline_favorites').select('share_id, item_id')
  const hearts = { byItem: {}, byShare: {} }
  for (const row of data ?? []) {
    hearts.byItem[row.item_id] = (hearts.byItem[row.item_id] ?? 0) + 1
    hearts.byShare[row.share_id] = (hearts.byShare[row.share_id] ?? 0) + 1
  }
  set({ hearts })
}

// "Keep me signed in" unticked: the sign-in lasts until the app is closed.
// The marker in sessionStorage disappears with the tab, which is how a fresh
// start is told apart from a reload.
const EPHEMERAL = 'seamline:ephemeral'
const THIS_VISIT = 'seamline:visit'
if (supabase && localStorage.getItem(EPHEMERAL) && !sessionStorage.getItem(THIS_VISIT)) {
  localStorage.removeItem(EPHEMERAL)
  supabase.auth.signOut()
}

if (supabase) {
  // Fires once with the stored session, then on every sign-in and sign-out.
  // Deferred: Supabase must not be called from inside this callback.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovering: true })
    setTimeout(() => refresh(session).catch(() => set({ loading: false })))
  })
}

export async function signIn(email, password, remember = true) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message)
  if (remember) localStorage.removeItem(EPHEMERAL)
  else {
    localStorage.setItem(EPHEMERAL, '1')
    sessionStorage.setItem(THIS_VISIT, '1')
  }
}

// Email a link for choosing a new password. It comes back to Settings here.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/settings` })
  if (error) throw new Error(error.message)
}

export async function setNewPassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
  set({ recovering: false })
}

export function signOut() {
  localStorage.removeItem(EPHEMERAL)
  return supabase.auth.signOut()
}

// ---------- links ----------

const random = (bytes) => {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const shareUrl = (share) => `${window.location.origin}/s/${share.token}`
export const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
export const downloadUrl = (item) => `${publicUrl(item.path)}?download=${encodeURIComponent(item.name)}`

export const findShare = (shares, kind, sourceId) =>
  shares.find((s) => s.kind === kind && s.source_id === sourceId)

// True when the photos behind a link no longer match the local ones.
// Photos that visitors added are not part of that comparison.
export const visitorItems = (share) => (share?.items ?? []).filter((it) => it.visitor)
export const outOfDate = (share, imageIds) => {
  const own = share.items.filter((it) => !it.visitor)
  return own.length !== imageIds.length || own.some((it, i) => it.id !== imageIds[i])
}

// A JPEG copy sized for sharing. Originals on the device are never touched.
async function uploadCopy(image) {
  // Exported carousel frames are already finished JPEGs at their final size.
  if (image.ready) return { blob: image.blob, width: image.width, height: image.height }
  const img = new Image()
  img.src = image.url
  await img.decode()
  const k = Math.min(1, UPLOAD_EDGE / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * k)
  canvas.height = Math.round(image.height * k)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_QUALITY))
  const size = { width: canvas.width, height: canvas.height }
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('Could not prepare a photo for upload')
  return { blob, ...size }
}

// A photo's online copy: from the registry, or failing that from a link.
function onlineItem(imageId) {
  const row = state.photos[imageId]
  if (row) return { id: row.id, path: row.path, name: row.name, width: row.width, height: row.height, bytes: row.bytes }
  for (const sh of state.shares) {
    const it = sh.items.find((x) => x.id === imageId && !x.visitor)
    if (it) return it
  }
  return null
}
export const isOnline = (imageId) => !!onlineItem(imageId)

// A photo that can go into a link: it is on this device, or already online.
export const linkable = (imageIds, images) =>
  imageIds.map((id) => images[id] ?? (isOnline(id) ? { id } : null)).filter(Boolean)

// Storage paths that links other than `exceptShareId` still show.
const pathsInUse = (exceptShareId) =>
  new Set(state.shares.filter((sh) => sh.id !== exceptShareId).flatMap((sh) => sh.items.map((it) => it.path)))
// Paths the registry looks after; those are only deleted by its own clean-up.
const registered = () => new Set(Object.values(state.photos).map((row) => row.path))

// Bytes actually stored: a photo used in several places is only stored once.
export function storageUsed(shares = state.shares) {
  const seen = new Map()
  for (const row of Object.values(state.photos)) seen.set(row.path, row.bytes)
  for (const sh of shares) for (const it of sh.items) seen.set(it.path, it.bytes)
  return [...seen.values()].reduce((n, b) => n + b, 0)
}

// Put photos online that are not there yet, and note each in the registry.
// `images` are photos held on this device. Returns nothing; read the results
// back with onlineItem.
export async function ensurePhotos(images, onProgress = () => {}) {
  const todo = images.filter((img) => img.url && !onlineItem(img.id))
  let done = 0
  for (const image of todo) {
    onProgress(done++, todo.length)
    const copy = await uploadCopy(image)
    if (storageUsed() + copy.blob.size > STORAGE_LIMIT) throw new Error('Storage is full. Remove some photos or links first.')
    const path = `${state.library}/${random(12)}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, copy.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (error) throw new Error(error.message)
    const base = (image.name ?? 'photo').replace(/\.[^.]+$/, '') || 'photo'
    const row = { library: state.library, id: image.id, path, name: `${base}.jpg`, width: copy.width, height: copy.height, bytes: copy.blob.size }
    if (state.canSync) {
      const saved = await supabase.from('seamline_photos').upsert(row).select().single()
      if (saved.error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
        throw new Error(saved.error.message)
      }
    }
    set({ photos: { ...state.photos, [image.id]: row } })
  }
}

// Remove online copies nothing refers to any more. `usedIds` are the photos
// every project, album and template mentions. Recent uploads are left alone:
// the album or project that will mention them may not have synced yet.
export async function cleanPhotos(usedIds) {
  if (!state.canSync) return
  const linked = new Set(state.shares.flatMap((sh) => sh.items.map((it) => it.id)))
  const hourAgo = Date.now() - 3600e3
  const dead = Object.values(state.photos).filter(
    (row) => !usedIds.has(row.id) && !linked.has(row.id) && row.created_at && Date.parse(row.created_at) < hourAgo,
  )
  if (!dead.length) return
  await supabase.storage.from(BUCKET).remove(dead.map((row) => row.path))
  await supabase.from('seamline_photos').delete().eq('library', state.library).in('id', dead.map((row) => row.id))
  const photos = { ...state.photos }
  for (const row of dead) delete photos[row.id]
  set({ photos })
}

let queue = Promise.resolve()

// Create a link, or bring an existing one in line with `images` (in order).
// Photos that are already online, under this link or any other, are reused;
// only new ones are uploaded. Removed ones are deleted once no link shows them.
// Calls run one after another so two never work on the same link at once.
export function syncShare(target, onProgress = () => {}) {
  const run = queue.then(() => doSync(target, onProgress))
  queue = run.catch(() => {})
  return run
}

async function doSync({ kind, sourceId, title, images }, onProgress) {
  // Read the links afresh: a visitor may have added photos since they were loaded.
  await refreshShares()
  const existing = findShare(state.shares, kind, sourceId)
  const fromVisitors = visitorItems(existing)
  const before = (existing?.items ?? []).filter((it) => !it.visitor)

  // A carousel's frames are finished images that belong to this link alone;
  // anything else is a library photo, put online once and shared by every link.
  const frames = images.filter((img) => img.ready)
  await ensurePhotos(images.filter((img) => !img.ready), onProgress)

  const fresh = []
  try {
    const made = new Map()
    let done = 0
    for (const frame of frames) {
      onProgress(done++, frames.length)
      const path = `${state.library}/${random(12)}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(path, frame.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (error) throw new Error(error.message)
      fresh.push(path)
      made.set(frame.id, { id: frame.id, path, name: frame.name, width: frame.width, height: frame.height, bytes: frame.blob.size })
    }

    // In the order given, then whatever visitors have added.
    const items = [...images.map((img) => made.get(img.id) ?? onlineItem(img.id)).filter(Boolean), ...fromVisitors]
    const row = {
      kind, source_id: sourceId, title, items,
      bytes: items.reduce((n, it) => n + it.bytes, 0),
      updated_at: new Date().toISOString(),
    }
    const query = existing
      ? supabase.from('seamline_shares').update(row).eq('id', existing.id)
      : supabase.from('seamline_shares').insert({ ...row, token: random(16), owner: state.library })
    const { data, error } = await query.select().single()
    if (error) throw new Error(error.message)
    set({ shares: existing ? state.shares.map((sh) => (sh.id === data.id ? data : sh)) : [data, ...state.shares] })

    // Delete what this link dropped, unless something else still needs it.
    const kept = new Set(items.map((it) => it.path))
    const inUse = pathsInUse(data.id)
    const library = registered()
    const dead = before.map((it) => it.path).filter((path) => !kept.has(path) && !inUse.has(path) && !library.has(path))
    if (dead.length) await supabase.storage.from(BUCKET).remove(dead)
    return data
  } catch (err) {
    if (fresh.length) await supabase.storage.from(BUCKET).remove(fresh).catch(() => {})
    throw err
  }
}

// ---------- keeping albums online ahead of time ----------

export function setAutoSync(on) {
  localStorage.setItem(AUTO_SYNC, on ? 'on' : 'off')
  set({ autoSync: on })
}

let syncingNow = false
let syncAgain = null

// Put every album's photos online and keep them matching the phone, so that
// sharing an album or one of its photos never has to wait for an upload.
// Albums that exist only on another device are left alone.
export async function syncAlbums(albums, images) {
  if (!supabase || !state.session || !state.uploader || !state.autoSync) return
  if (syncingNow) {
    syncAgain = [albums, images]
    return
  }
  syncingNow = true
  try {
    for (const album of albums) {
      // Photos still downloading from another device are already online; an
      // album with a photo that is neither here nor online is left for later.
      const photos = linkable(album.imageIds, images)
      if (!photos.length || photos.length !== album.imageIds.length) continue
      const share = findShare(state.shares, 'album', album.id)
      if (share && share.title === album.name && !outOfDate(share, photos.map((ph) => ph.id))) continue
      set({ syncing: { id: album.id, done: 0, total: 0 }, syncError: null })
      await syncShare(
        { kind: 'album', sourceId: album.id, title: album.name, images: photos },
        (done, total) => set({ syncing: { id: album.id, done, total } }),
      )
    }
  } catch (err) {
    set({ syncError: err.message || 'Could not put the album online' })
  }
  set({ syncing: null })
  syncingNow = false
  if (syncAgain) {
    const next = syncAgain
    syncAgain = null
    syncAlbums(...next)
  }
}

// How long a link stays open. `days` of null means it never expires.
export const EXPIRY_CHOICES = [
  { label: 'Never', days: null },
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
]

export const isExpired = (share) => !!share.expires_at && new Date(share.expires_at) <= new Date()

// "Never expires", "Expires in 6 days" or "Expired".
export function expiryText(share) {
  if (!share.expires_at) return 'Never expires'
  const hours = (new Date(share.expires_at) - Date.now()) / 36e5
  if (hours <= 0) return 'Expired'
  if (hours < 24) return `Expires in ${Math.max(1, Math.round(hours))} h`
  return `Expires in ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'}`
}

// Set or clear a link's expiry, counted from now.
export async function setExpiry(share, days) {
  const expires_at = days ? new Date(Date.now() + days * 864e5).toISOString() : null
  const { data, error } = await supabase.from('seamline_shares').update({ expires_at }).eq('id', share.id).select().single()
  if (error) throw new Error(error.message)
  set({ shares: state.shares.map((s) => (s.id === data.id ? data : s)) })
}

// Give a link a new address. The old one stops working at once; the photos
// stay where they are, so nothing is uploaded again.
export async function replaceLink(share) {
  const { data, error } = await supabase.from('seamline_shares').update({ token: random(16) }).eq('id', share.id).select().single()
  if (error) throw new Error(error.message)
  set({ shares: state.shares.map((sh) => (sh.id === data.id ? data : sh)) })
}

// Remove a link, and delete its photos unless something else still needs them.
export async function stopShare(share) {
  const inUse = pathsInUse(share.id)
  const library = registered()
  const dead = share.items.map((it) => it.path).filter((path) => !inUse.has(path) && !library.has(path))
  if (dead.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(dead)
    if (error) throw new Error(error.message)
  }
  const { error } = await supabase.from('seamline_shares').delete().eq('id', share.id)
  if (error) throw new Error(error.message)
  set({ shares: state.shares.filter((sh) => sh.id !== share.id) })
}

// What a visitor sees: looked up by the link's code, no sign-in needed.
export async function fetchShare(token) {
  if (!supabase) throw new Error('Sharing is not set up on this copy of the app.')
  const { data, error } = await supabase.rpc('seamline_open_share', { share_token: token })
  if (error) throw new Error('This link could not be loaded right now. Try again in a minute.')
  return data?.[0] ?? null
}

// ---------- favourites, from the visitor's side ----------

// An anonymous id for this browser, so a visitor's hearts are their own.
export function visitorId() {
  const KEY = 'seamline:visitor'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = random(12)
    localStorage.setItem(KEY, id)
  }
  return id
}

export async function fetchMyFavorites(token) {
  const { data } = await supabase.rpc('seamline_my_favorites', { share_token: token, visitor_id: visitorId() })
  return (data ?? []).map((r) => r.item_id)
}

export async function setFavorite(token, itemId, liked) {
  const { error } = await supabase.rpc('seamline_set_favorite', {
    share_token: token, item: itemId, visitor_id: visitorId(), liked,
  })
  if (error) throw new Error('Could not save that favourite. Try again.')
}

// ---------- photos added by visitors ----------

const LAST_PIN = 'seamline:uploadPin'
export const rememberedPin = () => localStorage.getItem(LAST_PIN) ?? ''

async function saveShare(share, patch) {
  const { data, error } = await supabase.from('seamline_shares').update(patch).eq('id', share.id).select().single()
  if (error) throw new Error(error.message)
  set({ shares: state.shares.map((s) => (s.id === data.id ? data : s)) })
  return data
}

// Turn visitor uploads on (with a 4 to 8 digit PIN) or off (null) for a link.
export async function setUploadPin(share, pin) {
  if (pin !== null && !/^[0-9]{4,8}$/.test(pin)) throw new Error('The PIN must be 4 to 8 digits.')
  if (pin) localStorage.setItem(LAST_PIN, pin)
  return saveShare(share, { upload_pin: pin, pin_failures: 0, pin_locked_until: null })
}

// Delete one photo a visitor added.
export async function removeVisitorItem(share, item) {
  await supabase.storage.from(BUCKET).remove([item.path])
  const items = share.items.filter((it) => it.id !== item.id)
  return saveShare(share, { items, bytes: items.reduce((n, it) => n + it.bytes, 0) })
}

// After a visitor's photo has been copied into the owner's album, record it
// under the album photo's id so it is no longer treated as a visitor's.
export const adoptVisitorItems = (share, idMap) =>
  saveShare(share, {
    items: share.items.map((it) => (idMap[it.id] ? { ...it, id: idMap[it.id], visitor: undefined } : it)),
  })

// What the visitor's page calls. With no file it only checks the PIN.
export async function visitorUpload(token, pin, file) {
  const form = new FormData()
  form.append('token', token)
  form.append('pin', pin)
  if (file) {
    const url = URL.createObjectURL(file)
    try {
      const probe = new Image()
      probe.src = url
      await probe.decode()
      const copy = await uploadCopy({ url, width: probe.naturalWidth, height: probe.naturalHeight })
      const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
      form.append('file', new File([copy.blob], `${base}.jpg`, { type: 'image/jpeg' }))
      form.append('width', copy.width)
      form.append('height', copy.height)
    } catch {
      throw new Error('That file could not be read as a photo.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  let res
  try {
    res = await fetch(`${URL_}/functions/v1/seamline-visitor-upload`, { method: 'POST', headers: { apikey: KEY }, body: form })
  } catch {
    throw new Error('Could not reach the album. Check your connection.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || 'The photo could not be added.')
    err.wrongPin = res.status === 401 || res.status === 429
    throw err
  }
  return body.item ?? null
}
