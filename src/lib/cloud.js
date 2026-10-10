import { createClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'

// Shared links: photos uploaded to Supabase Storage and listed in the
// seamline_shares table, reachable by anyone holding the link's random code.
// Only the signed-in, allow-listed owner can create, change or remove them.
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
let state = { configured: !!supabase, loading: !!supabase, session: null, uploader: false, shares: [], hearts: NO_HEARTS }
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

async function refresh(session) {
  if (!session) return set({ loading: false, session: null, uploader: false, shares: [], hearts: NO_HEARTS })
  set({ session })
  const [{ data: uploader }, { data: shares }] = await Promise.all([
    supabase.rpc('seamline_is_uploader'),
    supabase.from('seamline_shares').select('*').order('created_at', { ascending: false }),
  ])
  set({ loading: false, uploader: !!uploader, shares: shares ?? [] })
  await refreshHearts()
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

if (supabase) {
  // Fires once with the stored session, then on every sign-in and sign-out.
  // Deferred: Supabase must not be called from inside this callback.
  supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => refresh(session).catch(() => set({ loading: false }))))
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message)
}

export const signOut = () => supabase.auth.signOut()

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

// Create a link, or bring an existing one in line with `images` (in order):
// new photos are uploaded, removed ones are deleted, the link stays the same.
export async function syncShare({ kind, sourceId, title, images }, onProgress = () => {}) {
  const uid = state.session.user.id
  // Read the link afresh: a visitor may have added photos since it was loaded.
  await refreshShares()
  const existing = findShare(state.shares, kind, sourceId)
  const fromVisitors = visitorItems(existing)
  const have = new Map((existing?.items ?? []).filter((it) => !it.visitor).map((it) => [it.id, it]))
  const todo = images.filter((img) => !have.has(img.id))
  const used = state.shares.reduce((n, s) => n + s.bytes, 0)

  const fresh = []
  try {
    return await run()
  } catch (err) {
    if (fresh.length) await supabase.storage.from(BUCKET).remove(fresh).catch(() => {})
    throw err
  }

  async function run() {
  let done = 0
  for (const image of todo) {
    onProgress(done++, todo.length)
    const copy = await uploadCopy(image)
    if (used + copy.blob.size > STORAGE_LIMIT) throw new Error('Storage is full. Stop sharing something first.')
    const path = `${uid}/${random(12)}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, copy.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (error) throw new Error(error.message)
    fresh.push(path)
    const base = (image.name ?? 'photo').replace(/\.[^.]+$/, '') || 'photo'
    have.set(image.id, { id: image.id, path, name: `${base}.jpg`, width: copy.width, height: copy.height, bytes: copy.blob.size })
  }

  const keep = new Set(images.map((i) => i.id))
  const gone = [...have.values()].filter((it) => !keep.has(it.id))
  // The owner's photos in their order, then whatever visitors have added.
  const items = [...images.map((i) => have.get(i.id)), ...fromVisitors]
  const row = {
    kind, source_id: sourceId, title, items,
    bytes: items.reduce((n, it) => n + it.bytes, 0),
    updated_at: new Date().toISOString(),
  }
  const query = existing
    ? supabase.from('seamline_shares').update(row).eq('id', existing.id)
    : supabase.from('seamline_shares').insert({ ...row, token: random(16) })
  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)
  if (gone.length) await supabase.storage.from(BUCKET).remove(gone.map((it) => it.path))

  set({ shares: existing ? state.shares.map((s) => (s.id === data.id ? data : s)) : [data, ...state.shares] })
  return data
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

// Remove a link and every photo uploaded for it.
export async function stopShare(share) {
  if (share.items.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(share.items.map((it) => it.path))
    if (error) throw new Error(error.message)
  }
  const { error } = await supabase.from('seamline_shares').delete().eq('id', share.id)
  if (error) throw new Error(error.message)
  set({ shares: state.shares.filter((s) => s.id !== share.id) })
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
