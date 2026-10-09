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

let state = { configured: !!supabase, loading: !!supabase, session: null, uploader: false, shares: [] }
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
  if (!session) return set({ loading: false, session: null, uploader: false, shares: [] })
  set({ session })
  const [{ data: uploader }, { data: shares }] = await Promise.all([
    supabase.rpc('seamline_is_uploader'),
    supabase.from('seamline_shares').select('*').order('created_at', { ascending: false }),
  ])
  set({ loading: false, uploader: !!uploader, shares: shares ?? [] })
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
export const outOfDate = (share, imageIds) =>
  share.items.length !== imageIds.length || share.items.some((it, i) => it.id !== imageIds[i])

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
  const existing = findShare(state.shares, kind, sourceId)
  const have = new Map((existing?.items ?? []).map((it) => [it.id, it]))
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
  const items = images.map((i) => have.get(i.id))
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
  const { data, error } = await supabase.rpc('seamline_get_share', { share_token: token })
  if (error) throw new Error('This link could not be loaded right now. Try again in a minute.')
  return data?.[0] ?? null
}
