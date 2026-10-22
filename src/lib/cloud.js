import { createClient } from '@supabase/supabase-js'
import { useMemo, useSyncExternalStore } from 'react'
import { thumbOf } from './images'
import { spotNames } from './places'
import { activeSeason, useActiveSeason } from './theme'

// Everything online lives in one "library" that its members share: photos in
// Supabase Storage with a registry row each (seamline_photos), links to them
// (seamline_shares) reachable by anyone holding a link's random code, and the
// projects and albums themselves (seamline_docs, see sync.js).
const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY
const BUCKET = 'seamline'
const UPLOAD_EDGE = 2560 // long edge of uploaded copies
const UPLOAD_QUALITY = 0.88
// Supabase Storage, free plan. Only photos put online before they moved to
// Cloudflare (and photos visitors add) live there now.
export const STORAGE_LIMIT = 1024 ** 3 // 1 GB
// Cloudflare R2, where photos, videos and finished collages go. The first
// 10 GB are free; beyond that it is about $0.015 per GB a month.
export const MEDIA_LIMIT = 100 * 1024 ** 3 // 100 GB
export const MEDIA_WARN = 90 * 1024 ** 3 // when Settings starts to warn

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
  admin: false, // may decide who adds photos and leaves notes on links
  guest: false, // an approved guest: sees every album and adds to them, changes nothing else
  requests: [], // for the admin: people asking to add photos through links
  pins: {}, // the library's pinned front-page photo per season: { [season]: { album, image } }
  // What the database supports beyond the basics (see supabase/migrations):
  // thumbs, notes, views, comments, push, people. Each stays off until its pieces exist there.
  features: {},
  comments: {}, // visitors' notes on the owner's links, by photo id
  activityLoaded: false, // true once hearts, comments and views have been read
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

// ---------- Hugpix's cover photos, shared by the whole library ----------
// Any number for each season ('everyday' outside them), in seamline_pins:
// everyone sees them, one each time the front page loads; members add and
// take away. Until the "covers" switch is on, the table holds one a season.
const pinSlot = () => activeSeason()?.id ?? 'everyday'
const stamp = () => new Date().toISOString()
// A cover is the photo, whichever album it was chosen from.
const covers = (season) => state.pins[season] ?? []
const setCovers = (season, list) => {
  const pins = { ...state.pins }
  if (list.length) pins[season] = list
  else delete pins[season]
  set({ pins })
}

export async function refreshPins() {
  if (!supabase || !state.canSync || !state.features.pins) return
  const columns = state.features.covers ? 'season, album, image, focus' : 'season, album, image'
  const { data } = await supabase.from('seamline_pins').select(columns).order('updated_at')
  if (!data) return
  const pins = {}
  for (const p of data) (pins[p.season] ??= []).push({ album: p.album, image: p.image, focus: p.focus ?? null })
  set({ pins })
}

// Make `image` (of `album`) a cover for the season showing now, framed at
// `focus` ([x, y] percentages, or null for the middle). One already a cover
// just takes the new framing. Where the database keeps one a season, it
// takes the old one's place.
export async function setPinned(album, image, focus = null) {
  const season = pinSlot()
  const here = covers(season)
  if (!state.features.covers) {
    const { error } = await supabase.from('seamline_pins').upsert({ library: state.library, season, album, image, updated_at: stamp() })
    if (error) throw new Error(error.message)
    setCovers(season, [{ album, image, focus: null }])
    return
  }
  const { error } = here.some((c) => c.image === image)
    ? await supabase.from('seamline_pins').update({ focus, updated_at: stamp() }).eq('library', state.library).eq('season', season).eq('image', image)
    : await supabase.from('seamline_pins').insert({ library: state.library, season, album, image, focus, updated_at: stamp() })
  if (error) throw new Error(error.message)
  setCovers(season, here.some((c) => c.image === image)
    ? here.map((c) => (c.image === image ? { ...c, focus } : c))
    : [...here, { album, image, focus }])
}

// Frame a cover afresh (see setPinned); nothing where it isn't one.
export async function setCoverFraming(image, focus) {
  const season = pinSlot()
  if (!state.features.covers || !covers(season).some((c) => c.image === image)) return
  const { error } = await supabase.from('seamline_pins').update({ focus, updated_at: stamp() }).eq('library', state.library).eq('season', season).eq('image', image)
  if (error) throw new Error(error.message)
  setCovers(season, covers(season).map((c) => (c.image === image ? { ...c, focus } : c)))
}

// Take `image` off the covers for the season showing now.
export async function unpin(image) {
  const season = pinSlot()
  const { error } = await supabase.from('seamline_pins').delete().eq('library', state.library).eq('season', season).eq('image', image)
  if (error) throw new Error(error.message)
  setCovers(season, covers(season).filter((c) => c.image !== image))
}

// The season's covers, [{ album, image, focus }], in the order they were added.
export function useCovers() {
  useActiveSeason() // the season decides which covers apply
  const key = useSyncExternalStore(subscribe, () => JSON.stringify(covers(pinSlot())))
  return useMemo(() => JSON.parse(key), [key])
}

// The cover for this visit: the covers take turns, one each time the page
// loads (a count kept on the device), or the only one. Null for none.
const TURN = 'seamline:coverTurn'
const turn = (() => {
  try {
    const n = (Number(localStorage.getItem(TURN)) || 0) + 1
    localStorage.setItem(TURN, String(n))
    return n
  } catch {
    return Math.floor(Math.random() * 1e6)
  }
})()
export function usePinned() {
  const covers = useCovers()
  return covers.length ? covers[turn % covers.length] : null
}

// The signed-in person, for stamping on what they add. Their id goes with
// the name so that a later change of name can find everything of theirs.
export const me = () => (state.session ? { id: state.session.user.id, name: userName(state.session) } : '')

// Save the name to show for this account. An empty name goes back to the default.
export async function setUserName(name) {
  const { data, error } = await supabase.auth.updateUser({ data: { seamline_name: name.trim() } })
  if (error) throw new Error(error.message)
  if (data?.user && state.session) set({ session: { ...state.session, user: data.user } })
}

// A profile photo: the middle square of `file`, up to 640 pixels across (so it
// stays sharp when tapped open big), put online and kept on the account
// (seamline_avatar). No file takes it off.
export async function setAvatar(file) {
  let url = ''
  if (file) {
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error('That file could not be read as a photo.')
    })
    const side = Math.min(bitmap.width, bitmap.height)
    const out = Math.min(640, side)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = out
    canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Could not prepare that photo.')
    url = await putMedia(blob, { ext: 'jpg', type: 'image/jpeg' })
  }
  const { data, error } = await supabase.auth.updateUser({ data: { seamline_avatar: url } })
  if (error) throw new Error(error.message)
  if (data?.user && state.session) set({ session: { ...state.session, user: data.user } })
}
export const avatarOf = (session) => session?.user?.user_metadata?.seamline_avatar || null

// The admin makes someone a member or a guest (see seamline_set_role).
export async function setRole(userId, role) {
  const { error } = await supabase.rpc('seamline_set_role', { person: userId, new_role: role })
  if (error) throw new Error(error.message)
}

// What to call the signed-in person: the name on their account if it has
// one, otherwise the part of their email before the @.
export function userName(session) {
  const user = session?.user
  if (!user) return ''
  const meta = user.user_metadata ?? {}
  // The name chosen in Seamline's settings comes first; it is kept apart from
  // any name the account carries for other apps.
  const given = meta.seamline_name || meta.full_name || meta.name || meta.display_name
  if (given) return String(given).trim()
  const local = (user.email ?? '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+$/, '').trim()
  return local ? local.replace(/\b\w/g, (ch) => ch.toUpperCase()) : (user.email ?? '')
}
export const getCloud = () => state
export const onCloud = subscribe

// Whose membership was last confirmed on this device, so the app still opens
// for them when it cannot reach the server to ask again.
const MEMBER = 'seamline:member'

async function refresh(session, claimed = false) {
  if (!session) {
    return set({
      loading: false, session: null, uploader: false, admin: false, guest: false, requests: [], pins: {}, shares: [], hearts: NO_HEARTS,
      library: null, photos: {}, canSync: false, features: {}, comments: {},
    })
  }
  set({ session })
  const [{ data: isMember, error: memberError }, { data: shares }, lib, { data: features }, { data: me }] = await Promise.all([
    supabase.rpc('seamline_is_uploader'),
    supabase.from('seamline_shares').select('*').order('created_at', { ascending: false }),
    supabase.rpc('seamline_my_library'),
    supabase.rpc('seamline_features'),
    supabase.from('seamline_members').select('role').eq('user_id', session.user.id).maybeSingle(),
  ])
  // Invited by a member's link: joining now (see seamline_invite_claim).
  const invite = pendingInvite()
  if (!memberError && !isMember && !claimed && invite && features?.memberInvites) {
    const { data: joined } = await supabase.rpc('seamline_invite_claim', { p_token: invite })
    rememberInvite(null)
    if (joined) return refresh(session, true)
  }
  // Approved by email before this account existed: becoming a guest now
  // (see seamline_claim_guest), then reading everything again as one.
  if (!memberError && !isMember && !claimed && features?.guests) {
    const { data: nowGuest } = await supabase.rpc('seamline_claim_guest')
    if (nowGuest) return refresh(session, true)
  }
  let uploader = !!isMember
  if (memberError) uploader = localStorage.getItem(MEMBER) === session.user.id // offline: go by last time
  else if (uploader) localStorage.setItem(MEMBER, session.user.id)
  else localStorage.removeItem(MEMBER)
  // Before the database knows about libraries, fall back to links only.
  const canSync = !lib.error && !!lib.data
  set({
    loading: false, uploader, shares: shares ?? [],
    library: canSync ? lib.data : session.user.id, canSync, features: features ?? {},
    // The admin is the member the library is named after (see seamline_is_admin).
    admin: canSync && lib.data === session.user.id,
    // An approved guest sees the albums and adds to them, nothing more (see 20261017_guests.sql).
    guest: me?.role === 'guest',
  })
  if (canSync) await refreshPhotos()
  await refreshHearts()
  await refreshComments()
  await refreshRequests()
  await refreshPins()
  set({ activityLoaded: true })
}

// Re-read the notes visitors have left on photos in the owner's links.
export async function refreshComments() {
  if (!supabase || !state.session || !state.features.comments) return
  const { data } = await supabase
    .from('seamline_comments').select(`id, share_id, item_id, author, body, created_at${state.features.people ? ', user_id' : ''}`)
    .order('created_at')
  if (!data) return
  const comments = {}
  for (const row of data) (comments[row.item_id] ??= []).push(row)
  set({ comments })
}

export async function deleteComment(id) {
  const { error } = await supabase.from('seamline_comments').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await refreshComments()
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
// Make a new account with any email address. Accounts are shared with Plait,
// whose database only takes new ones that carry a valid invite code (see
// handle_new_user), so one is asked for here too. Supabase emails a link to
// confirm the address, which comes back to this page; until then there is no
// session. Resolves to 'sent', or 'exists' when the address already has an
// account (often a Plait one): Supabase then sends nothing and gives no
// error, only a user with no identities, so the page has to say so itself.
export async function signUp(name, email, password, code) {
  const who = name.trim()
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // `app` picks Seamline's version of the confirmation email (see the
      // "Confirm signup" template in Supabase, which checks .Data.app).
      data: { app: 'seamline', invite_code: code.trim(), ...(who ? { seamline_name: who, display_name: who } : null) },
      // Back here after confirming, with any invite still on it.
      emailRedirectTo: `${window.location.origin}${window.location.pathname}${pendingInvite() ? `?invite=${encodeURIComponent(pendingInvite())}` : ''}`,
    },
  })
  // The invite check fails inside the database, which Supabase reports only as this.
  if (error?.message === 'Database error saving new user') throw new Error("That invite code isn't valid.")
  if (error) throw new Error(error.message)
  return data?.user && data.user.identities?.length === 0 ? 'exists' : 'sent'
}

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
// Photos are in Supabase Storage and recorded by their path there. Videos are
// in Cloudflare R2 (see supabase/functions/seamline-media) and recorded by
// their full address, which is how the two are told apart.
const external = (path) => /^https?:\/\//.test(path)
export const publicUrl = (path) => (external(path) ? path : supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
// Fetch a stored photo or video's file. Photo storage only adds its
// cross-origin header when asked, and doesn't say the answer varies by it, so
// a copy the browser kept from showing the photo in an <img> has no such
// header, and a fetch that reused it would fail ("Failed to fetch"). Always
// asking afresh avoids that.
export const fetchMedia = (url) => fetch(url, { cache: 'no-store' })

// A video is stored marked as a download, so its plain address already saves it.
export const downloadUrl = (item) =>
  external(item.path) ? item.path : `${publicUrl(item.path)}?download=${encodeURIComponent(item.name)}`

const isVideo = (image) => image?.kind === 'video'

async function media(body) {
  const { data, error } = await supabase.functions.invoke('seamline-media', { body })
  if (error || data?.error) throw new Error(data?.error || 'Could not reach video storage')
  return data
}

// Send a file straight to video storage and return its address. `onFraction`
// hears how far along it is, from 0 to 1.
async function putMedia(blob, { ext, type, name }, onFraction = () => {}) {
  const { files } = await media({ action: 'sign', files: [{ ext }] })
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', files[0].url)
    xhr.setRequestHeader('Content-Type', type)
    xhr.setRequestHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (name) xhr.setRequestHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.\- ]+/g, '_')}"`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onFraction(e.loaded / e.total)
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('The video could not be uploaded')))
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection.'))
    xhr.send(blob)
  })
  return files[0].path
}

// Delete stored files, wherever each one lives.
async function removeStored(paths) {
  const there = paths.filter(external)
  const here = paths.filter((p) => !external(p))
  if (here.length) await supabase.storage.from(BUCKET).remove(here)
  if (there.length) await media({ action: 'delete', paths: there })
}

export const findShare = (shares, kind, sourceId) =>
  shares.find((s) => s.kind === kind && s.source_id === sourceId)

// True when the photos behind a link no longer match the local ones.
// Photos that visitors added are not part of that comparison.
export const visitorItems = (share) => (share?.items ?? []).filter((it) => it.visitor)
// `captions` (by photo id) and `note` count too, when they are given.
export const outOfDate = (share, imageIds, { captions = {}, note, place, places = {} } = {}) => {
  const own = share.items.filter((it) => !it.visitor)
  return (
    own.length !== imageIds.length ||
    own.some((it, i) => it.id !== imageIds[i] || (it.caption ?? '') !== (captions[it.id] ?? '') || (it.place ?? '') !== (places[it.id] ?? '')) ||
    (!!state.features.notes && note != null && (share.note ?? '') !== note) ||
    (!!state.features.places && place !== undefined && !samePlace(share.place, place))
  )
}
const samePlace = (a, b) => (a?.name ?? '') === (b?.name ?? '') && (a?.lat ?? null) === (b?.lat ?? null) && (a?.lng ?? null) === (b?.lng ?? null)

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
  if (row) {
    const item = { id: row.id, path: row.path, name: row.name, width: row.width, height: row.height, bytes: row.bytes }
    return row.kind === 'video' ? { ...item, kind: 'video', poster: row.poster, duration: row.duration } : item
  }
  for (const sh of state.shares) {
    const it = sh.items.find((x) => x.id === imageId && !x.visitor)
    if (it) return it
  }
  return null
}
export const isOnline = (imageId) => !!onlineItem(imageId)

// Videos need the photo registry to record where they are; without it they
// stay on the device and are left out of links.
export const canLink = (image) => !isVideo(image) || state.canSync

// A photo or video that can go into a link: it is on this device, or already online.
export const linkable = (imageIds, images) =>
  imageIds.map((id) => (!canLink(images[id]) ? null : images[id] ?? (isOnline(id) ? { id } : null))).filter(Boolean)

// Storage paths that links other than `exceptShareId` still show.
const pathsInUse = (exceptShareId) =>
  new Set(state.shares.filter((sh) => sh.id !== exceptShareId).flatMap((sh) => sh.items.map((it) => it.path)))
// Paths the registry looks after; those are only deleted by its own clean-up.
const registered = () => new Set(Object.values(state.photos).map((row) => row.path))

// Bytes actually stored: a photo used in several places is only stored once.
// Videos are counted apart, as they are stored somewhere else.
function stored(shares, wanted) {
  const seen = new Map()
  for (const row of Object.values(state.photos)) seen.set(row.path, row.bytes)
  for (const sh of shares) for (const it of sh.items) seen.set(it.path, it.bytes)
  return [...seen].filter(([path]) => external(path) === wanted).reduce((n, [, b]) => n + Number(b), 0)
}
export const storageUsed = (shares = state.shares) => stored(shares, false)
export const mediaStorageUsed = (shares = state.shares) => stored(shares, true)

// Put a video online exactly as it is, with its still, and note it in the
// registry. `album` is a secret album's id when it goes online for one: its
// row then stays hidden from everyone outside that album.
async function ensureVideo(image, onFraction, album) {
  if (mediaStorageUsed() + image.blob.size > MEDIA_LIMIT) throw new Error('Storage is full (100 GB). Remove some photos or videos first.')
  const ext = image.name?.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? 'mp4'
  const stored = []
  try {
    stored.push(await putMedia(image.blob, { ext, type: image.blob.type || 'video/mp4', name: image.name }, onFraction))
    stored.push(await putMedia(image.previewBlob, { ext: 'jpg', type: 'image/jpeg' }))
    const row = {
      library: state.library, id: image.id, path: stored[0], poster: stored[1], kind: 'video', duration: image.duration ?? 0,
      name: image.name ?? 'video.mp4', width: image.width, height: image.height, bytes: image.blob.size + image.previewBlob.size,
      ...(album ? { album } : null),
    }
    const saved = await supabase.from('seamline_photos').upsert(row).select().single()
    if (saved.error) throw new Error(saved.error.message)
    set({ photos: { ...state.photos, [image.id]: saved.data } })
  } catch (err) {
    await removeStored(stored).catch(() => {})
    throw err
  }
}

// Put a small copy of a photo online beside the full one. Not being able to
// is no reason to fail the upload it belongs to.
async function putThumb(image, path) {
  try {
    const small = await thumbOf(image.previewBlob)
    const thumb = path.replace(/\.jpg$/, '.t.jpg')
    const { error } = await supabase.storage
      .from(BUCKET).upload(thumb, small, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true })
    return error ? { thumb: null, bytes: 0 } : { thumb, bytes: small.size }
  } catch {
    return { thumb: null, bytes: 0 }
  }
}

// Give photos that went online before small copies existed one each, a few at
// a time. `images` are the photos on this device, by id.
export async function ensureThumbs(images, limit = 25) {
  // Adding a small copy changes a photo's row, which only members may do.
  if (!supabase || !state.canSync || !state.features.thumbs || state.guest) return
  const todo = Object.values(state.photos)
    .filter((row) => !row.thumb && row.kind !== 'video' && !external(row.path) && images[row.id]?.blob)
    .slice(0, limit)
  for (const row of todo) {
    const { thumb, bytes } = await putThumb(images[row.id], row.path)
    if (!thumb) continue
    const saved = await supabase
      .from('seamline_photos').update({ thumb, bytes: Number(row.bytes) + bytes })
      .eq('library', state.library).eq('id', row.id).select().single()
    if (!saved.error) set({ photos: { ...state.photos, [row.id]: saved.data } })
  }
}

// Put a photo's online copy, and its small copy for other devices, in
// Cloudflare and note both in the registry (`album` as for ensureVideo).
async function ensurePhotoOnCloudflare(image, copy, name, album) {
  const small = state.features.thumbs ? await thumbOf(image.previewBlob) : null
  const bytes = copy.blob.size + (small?.size ?? 0)
  if (mediaStorageUsed() + bytes > MEDIA_LIMIT) throw new Error('Storage is full (100 GB). Remove some photos or videos first.')
  const stored = []
  try {
    stored.push(await putMedia(copy.blob, { ext: 'jpg', type: 'image/jpeg', name }))
    if (small) stored.push(await putMedia(small, { ext: 'jpg', type: 'image/jpeg' }))
    const row = {
      library: state.library, id: image.id, path: stored[0], name, width: copy.width, height: copy.height, bytes,
      ...(small ? { thumb: stored[1] } : null),
      ...(album ? { album } : null),
    }
    const saved = await supabase.from('seamline_photos').upsert(row).select().single()
    if (saved.error) throw new Error(saved.error.message)
    set({ photos: { ...state.photos, [image.id]: saved.data } })
  } catch (err) {
    await removeStored(stored).catch(() => {})
    throw err
  }
}

// Put photos and videos online that are not there yet, and note each in the
// registry. `images` are held on this device. Returns nothing; read the
// results back with onlineItem. `onProgress` also hears, as a third value,
// how far through a large upload it is (0 to 1). `album` is a secret album's
// id when the photos go online for one (see ensureVideo).
export async function ensurePhotos(images, onProgress = () => {}, { album = null } = {}) {
  const todo = images.filter((img) => img.blob && canLink(img) && !onlineItem(img.id))
  let done = 0
  for (const image of todo) {
    onProgress(done++, todo.length, isVideo(image) ? 0 : undefined)
    if (isVideo(image)) {
      await ensureVideo(image, (fraction) => onProgress(done - 1, todo.length, fraction), album)
      continue
    }
    const copy = await uploadCopy(image)
    const base = (image.name ?? 'photo').replace(/\.[^.]+$/, '') || 'photo'
    if (state.canSync) {
      await ensurePhotoOnCloudflare(image, copy, `${base}.jpg`, album)
      continue
    }
    // Without the photo registry there is nowhere to record a Cloudflare
    // address, so photos stay in Supabase Storage as before.
    if (storageUsed() + copy.blob.size > STORAGE_LIMIT) throw new Error('Storage is full. Remove some photos or links first.')
    const path = `${state.library}/${random(12)}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, copy.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (error) throw new Error(error.message)
    const row = { library: state.library, id: image.id, path, name: `${base}.jpg`, width: copy.width, height: copy.height, bytes: copy.blob.size }
    set({ photos: { ...state.photos, [image.id]: row } })
  }
}

// A photo already online whose picture has changed (cropped or turned): put
// the new picture online in its place, under the same id, and remove the old
// files unless a link still shows them. Its reactions, comments and tags stay
// with it. A photo not online yet needs nothing: it goes up as it is now.
export async function replaceOnline(image) {
  const old = state.photos[image.id]
  if (!old || !state.canSync) return
  const copy = await uploadCopy(image)
  const small = state.features.thumbs ? await thumbOf(image.previewBlob) : null
  const stored = []
  try {
    stored.push(await putMedia(copy.blob, { ext: 'jpg', type: 'image/jpeg', name: old.name }))
    if (small) stored.push(await putMedia(small, { ext: 'jpg', type: 'image/jpeg' }))
    const saved = await supabase
      .from('seamline_photos')
      .update({ path: stored[0], thumb: small ? stored[1] : null, width: copy.width, height: copy.height, bytes: copy.blob.size + (small?.size ?? 0) })
      .eq('library', state.library).eq('id', image.id).select().single()
    if (saved.error) throw new Error(saved.error.message)
    set({ photos: { ...state.photos, [image.id]: saved.data } })
  } catch (err) {
    await removeStored(stored).catch(() => {})
    throw err
  }
  const shown = pathsInUse()
  const gone = [old.path, old.thumb].filter((p) => p && !shown.has(p))
  if (gone.length) await removeStored(gone).catch(() => {})
}

// Remove online copies nothing refers to any more. `usedIds` are the photos
// every project, album and template mentions. Recent uploads are left alone:
// the album or project that will mention them may not have synced yet.
// `heldAlbums` are the albums on this device: a secret album's photos are
// only judged by a device that holds that album, or once it is deleted.
export async function cleanPhotos(usedIds, heldAlbums = new Set()) {
  // A guest never removes anything (and the database would refuse).
  if (!state.canSync || state.guest) return
  const linked = new Set(state.shares.flatMap((sh) => sh.items.map((it) => it.id)))
  const hourAgo = Date.now() - 3600e3
  let dead = Object.values(state.photos).filter(
    (row) => !usedIds.has(row.id) && !linked.has(row.id) && row.created_at && Date.parse(row.created_at) < hourAgo,
  )
  const elsewhere = [...new Set(dead.filter((row) => row.album && !heldAlbums.has(row.album)).map((row) => row.album))]
  if (elsewhere.length) {
    const { data } = await supabase.from('seamline_docs').select('id').eq('kind', 'album').eq('deleted', true).in('id', elsewhere)
    const deleted = new Set((data ?? []).map((row) => row.id))
    dead = dead.filter((row) => !row.album || heldAlbums.has(row.album) || deleted.has(row.album))
  }
  if (!dead.length) return
  await removeStored(dead.flatMap((row) => [row.path, row.poster, row.thumb].filter(Boolean)))
  await supabase.from('seamline_photos').delete().eq('library', state.library).in('id', dead.map((row) => row.id))
  const photos = { ...state.photos }
  for (const row of dead) delete photos[row.id]
  set({ photos })
}

// "Putting photos online, 2 of 5", or for a video, which reports how far
// through it is, "Putting a video online, 2 of 5 (40%)".
export const progressText = (done, total, fraction) =>
  fraction == null
    ? `Putting photos online, ${done + 1} of ${total}`
    : `Putting a video online, ${done + 1} of ${total} (${Math.round(fraction * 100)}%)`

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

// `captions` and `places` (names, by photo id) ride along on each photo;
// `note` and `place` ({ name, lat, lng }, or null for nowhere) are the album's.
async function doSync({ kind, sourceId, title, images, captions = {}, note, place, places = {} }, onProgress) {
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
      let path
      if (state.canSync) {
        path = await putMedia(frame.blob, { ext: 'jpg', type: 'image/jpeg', name: frame.name })
      } else {
        path = `${state.library}/${random(12)}.jpg`
        const { error } = await supabase.storage.from(BUCKET).upload(path, frame.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
        if (error) throw new Error(error.message)
      }
      fresh.push(path)
      made.set(frame.id, { id: frame.id, path, name: frame.name, width: frame.width, height: frame.height, bytes: frame.blob.size })
    }

    // In the order given, then whatever visitors have added.
    const own = images.map((img) => {
      const item = made.get(img.id) ?? onlineItem(img.id)
      if (!item) return null
      // A photo already online may come from another link, with that link's words on it.
      const { caption: _c, place: _p, ...bare } = item
      return {
        ...bare,
        ...(captions[img.id] ? { caption: captions[img.id] } : null),
        ...(places[img.id] ? { place: places[img.id] } : null),
      }
    })
    const items = [...own.filter(Boolean), ...fromVisitors]
    const row = {
      kind, source_id: sourceId, title, items,
      ...(state.features.notes && note != null ? { note } : null),
      ...(state.features.places && place !== undefined ? { place } : null),
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
    if (dead.length) await removeStored(dead)
    return data
  } catch (err) {
    if (fresh.length) await removeStored(fresh).catch(() => {})
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
  // Links are a member's; a guest's photos reach everyone through the album sync instead.
  if (!supabase || !state.session || !state.uploader || !state.autoSync || state.guest) return
  if (syncingNow) {
    syncAgain = [albums, images]
    return
  }
  syncingNow = true
  try {
    for (const album of albums) {
      // A secret album never gets a link: links are seen by every member.
      if (album.secret) continue
      // Photos still downloading from another device are already online; an
      // album with a photo that is neither here nor online is left for later.
      const wanted = album.imageIds.filter((id) => canLink(images[id]))
      const photos = linkable(wanted, images)
      if (!photos.length || photos.length !== wanted.length) continue
      const share = findShare(state.shares, 'album', album.id)
      const extras = { captions: album.captions ?? {}, note: album.note ?? '', place: album.place ?? null, places: spotNames(album) }
      if (share && share.title === album.name && !outOfDate(share, photos.map((ph) => ph.id), extras)) continue
      set({ syncing: { id: album.id, done: 0, total: 0 }, syncError: null })
      await syncShare(
        { kind: 'album', sourceId: album.id, title: album.name, images: photos, ...extras },
        (done, total, fraction) => set({ syncing: { id: album.id, done, total, fraction } }),
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

// "Not opened yet", "1 view · last opened 2 h ago".
export function viewsText(share) {
  if (!share.views) return 'Not opened yet'
  const m = Math.round((Date.now() - new Date(share.last_viewed_at)) / 60000)
  const when = m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 60 * 24 ? `${Math.round(m / 60)} h ago`
    : new Date(share.last_viewed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `${share.views} view${share.views === 1 ? '' : 's'} · last opened ${when}`
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
    await removeStored(dead)
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

// ---------- views, notes and comments, from the visitor's side ----------

// Count one opening of a link: once per visit, and never the owner's own.
export async function markViewed(token) {
  const key = `seamline:viewed:${token}`
  if (!supabase || sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1') // before anything slow, so two calls cannot both count
  const { data } = await supabase.auth.getSession()
  if (data?.session) return
  await supabase.rpc('seamline_mark_view', { share_token: token })
}

// The album's note, what the person looking may do ({ signedIn, upload,
// comment }) and the notes they have left themselves, or null where the
// database does not have them yet.
export async function fetchShareExtras(token) {
  const { data, error } = await supabase.rpc('seamline_share_extras', { share_token: token })
  return error ? null : data
}

// Shared links opened on this device, newest first, so someone who is not a
// member can find their way back to them from the front door.
const OPENED = 'seamline:openedLinks'
export function openedLinks() {
  try {
    return JSON.parse(localStorage.getItem(OPENED) ?? '[]')
  } catch {
    return []
  }
}
export function rememberLink(token, title) {
  const rest = openedLinks().filter((l) => l.token !== token)
  try {
    localStorage.setItem(OPENED, JSON.stringify([{ token, title: title || 'Shared photos' }, ...rest].slice(0, 12)))
  } catch {
    // Storage full or blocked: the front door just won't list it.
  }
}

// Notes are left under the signed-in account's own name.
export async function addComment(token, itemId, body) {
  const { data, error } = await supabase.rpc('seamline_add_comment', { share_token: token, item: itemId, body })
  if (error?.message === 'blocked') throw new Error('You can no longer leave notes on this album.')
  if (error?.message === 'signed out') throw new Error('Sign in to leave a note.')
  if (error || !data) throw new Error('Could not send that note. Try again.')
  return data
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

// ---------- photos added through links ----------

async function saveShare(share, patch) {
  const { data, error } = await supabase.from('seamline_shares').update(patch).eq('id', share.id).select().single()
  if (error) throw new Error(error.message)
  set({ shares: state.shares.map((s) => (s.id === data.id ? data : s)) })
  return data
}

// Let members and approved people add photos through this link, once signed in.
export const setGuestUploads = (share, on) => saveShare(share, { guest_uploads: on })

// Delete one photo a visitor added.
export async function removeVisitorItem(share, item) {
  await removeStored([item.path])
  const items = share.items.filter((it) => it.id !== item.id)
  return saveShare(share, { items, bytes: items.reduce((n, it) => n + it.bytes, 0) })
}

// After a visitor's photo has been copied into the owner's album, record it
// under the album photo's id so it is no longer treated as a visitor's.
export const adoptVisitorItems = (share, idMap) =>
  saveShare(share, {
    items: share.items.map((it) => (idMap[it.id] ? { ...it, id: idMap[it.id], visitor: undefined } : it)),
  })

// What the shared page calls to add one photo, as the signed-in person.
export async function visitorUpload(token, file) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in to add photos.')
  const form = new FormData()
  form.append('token', token)
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
  let res
  try {
    res = await fetch(`${URL_}/functions/v1/seamline-visitor-upload`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` }, body: form,
    })
  } catch {
    throw new Error('Could not reach the album. Check your connection.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || 'The photo could not be added.')
    err.refused = res.status === 401 || res.status === 403
    throw err
  }
  return body.item ?? null
}

// ---------- who may add photos and leave notes: the admin's list ----------
// Someone not on it may leave notes once signed in, and may add photos only if
// they are a member (see seamline_rights).

// Everyone in my library, { id, name, role }, by name: for choosing who is in
// a secret album or a chat (see seamline_library_people).
// Null when it can't be asked yet (signed out, or the library not read yet).
export async function fetchLibraryPeople() {
  if (!supabase || !state.session || !state.features.messages) return null
  const { data, error } = await supabase.rpc('seamline_library_people')
  if (error) throw new Error(error.message)
  return data ?? []
}

// Photos that went online for a secret album and are now also used outside
// it: everyone may see them again (see sync.js). Members only; a guest's
// change would be refused, and the photo then stays the album's.
export async function releasePhotos(ids) {
  const tagged = ids.filter((id) => state.photos[id]?.album)
  if (!tagged.length || state.guest) return
  const { data } = await supabase.from('seamline_photos').update({ album: null })
    .eq('library', state.library).in('id', tagged).select()
  if (data?.length) set({ photos: { ...state.photos, ...Object.fromEntries(data.map((row) => [row.id, row])) } })
}

// A photo sent in a message: a sized copy and a small one, put online beside
// the albums' but not in their registry, so tidying albums never removes it.
export async function uploadMessagePhoto(image) {
  const copy = await uploadCopy(image)
  const path = await putMedia(copy.blob, { ext: 'jpg', type: 'image/jpeg' })
  let thumb = null
  try {
    thumb = await putMedia(await thumbOf(image.previewBlob), { ext: 'jpg', type: 'image/jpeg' })
  } catch {
    // The full copy serves as its own small one.
  }
  return { path, thumb, width: copy.width, height: copy.height }
}

// Everyone on Hugpix, for the admin: members, guests, people waiting and
// people who signed up but haven't asked in (see seamline_users).
export async function fetchUsers() {
  const { data, error } = await supabase.rpc('seamline_users')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchPeople() {
  const { data, error } = await supabase.from('seamline_people').select('email, uploads, comments, added_at').order('added_at')
  if (error) throw new Error(error.message)
  return data
}

// Put someone on the list, or change what they may do. `rights` holds
// `uploads` and/or `comments`; what is left out stays as it was.
export async function savePerson(email, rights) {
  const clean = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('That does not look like an email address.')
  const { error } = await supabase.from('seamline_people').upsert({ library: state.library, email: clean, ...rights })
  if (error) throw new Error(error.message)
}

export async function removePerson(email) {
  const { error } = await supabase.from('seamline_people').delete().eq('library', state.library).eq('email', email)
  if (error) throw new Error(error.message)
}

// People asking to add photos through a link, oldest first. Only the admin sees them.
export async function refreshRequests() {
  if (!supabase || !state.admin || !state.features.requests) return
  const { data } = await supabase.from('seamline_requests').select('user_id, email, name, album, created_at').order('created_at')
  if (data) set({ requests: data })
}

// The admin lets them add photos from now on, or declines (they may ask again).
export async function answerRequest(userId, approve) {
  const { error } = await supabase.rpc('seamline_answer_request', { person: userId, approve })
  if (error) throw new Error(error.message)
  set({ requests: state.requests.filter((r) => r.user_id !== userId) })
}

// The shared page: the signed-in person asks to add photos through this link.
// Goes through seamline-request-uploads, which also tells the admin; if that
// can't be reached, the request is still made, without the notification.
// Resolves to 'allowed' (they already may), 'pending' or 'closed'.
export async function requestUploads(token) {
  const sent = await supabase.functions.invoke('seamline-request-uploads', { body: { token } })
  if (!sent.error && sent.data?.status) return sent.data.status
  const { data, error } = await supabase.rpc('seamline_request_uploads', { share_token: token })
  if (error) throw new Error('Could not send that request. Try again.')
  return data === 'asked' ? 'pending' : data
}

// The front door: someone signed in without access asks to be let in, with no
// link (see seamline_request_access). Resolves to 'allowed', 'pending' or 'closed'.
export async function requestAccess() {
  const sent = await supabase.functions.invoke('seamline-request-uploads', { body: { access: true } })
  if (!sent.error && sent.data?.status) return sent.data.status
  const { data, error } = await supabase.rpc('seamline_request_access')
  if (error) throw new Error('Could not send that request. Try again.')
  return data === 'asked' ? 'pending' : data
}

// Read the account again, so someone just approved is let in without a reload.
export async function recheckAccess() {
  if (state.session) await refresh(state.session)
}

// Whether this account is already waiting on a request.
export async function hasOpenRequest() {
  const { data } = await supabase.rpc('seamline_my_request')
  return !!data
}

// Stop (false) or allow (true) whoever added a photo or left a note, by their
// account, without needing their email address.
export async function setRights(userId, { uploads = null, comments = null }) {
  const { error } = await supabase.rpc('seamline_set_rights', { person: userId, may_upload: uploads, may_comment: comments })
  if (error) throw new Error(error.message)
}

// ---------- invite codes for new accounts ----------
// Every new account needs one (see signUp). The codes are Plait's, since the
// accounts are shared: these call Plait's admin functions, which only a Plait
// admin may use, and a code made here works for a Plait sign-up too.

const inviteError = (message) => new Error(message === 'not authorized' ? 'Only the admin can make invite codes.' : message)

export async function fetchInvites() {
  const { data, error } = await supabase.rpc('admin_invites')
  if (error) throw inviteError(error.message)
  return data ?? []
}

// `maxUses` null lets any number of people use it.
export async function addInvite(code, note, maxUses) {
  const { data, error } = await supabase.rpc('admin_invite_add', { p_code: code, p_note: note || null, p_max_uses: maxUses })
  if (error || data?.error) throw inviteError(data?.error ?? error.message)
}

export async function setInviteActive(code, active) {
  const { data, error } = await supabase.rpc('admin_invite_set_active', { p_code: code, p_active: active })
  if (error || data?.error) throw inviteError(data?.error ?? error.message)
}

// Gone for good; accounts already made with it stay (see 20261017_invite_delete.sql).
export async function deleteInvite(code) {
  const { data, error } = await supabase.rpc('admin_invite_delete', { p_code: code })
  if (error || data?.error) throw inviteError(data?.error ?? error.message)
}

// Opens the sign-up with the code already filled in (see SignIn).
export const inviteUrl = (code) => `${window.location.origin}/?invite=${encodeURIComponent(code)}`

// ---------- invites from members (see 20261021_greetings_invites.sql) ----------
// A member's invite is a one-use link: its token is also a one-use code, so
// the new account is made without typing one, and once signed in the person
// joins this library (seamline_invite_claim). The token from a link is kept
// on the device until then, past the email confirmation and any sign-in.
const INVITE = 'seamline:invite'
export const pendingInvite = () => {
  try {
    return localStorage.getItem(INVITE)
  } catch {
    return null
  }
}
export function rememberInvite(token) {
  try {
    if (token) localStorage.setItem(INVITE, token)
    else localStorage.removeItem(INVITE)
  } catch {
    // Storage blocked: the link itself still carries it.
  }
}
{
  const fromLink = new URLSearchParams(window.location.search).get('invite')
  if (fromLink) rememberInvite(fromLink.trim().toLowerCase())
}

// A new invite link of my own.
export async function createInvite() {
  const { data, error } = await supabase.rpc('seamline_invite_create')
  if (error) throw new Error(error.message)
  return { token: data, url: inviteUrl(data) }
}

// Signed out: who sent this invite ({ from }), or null if it's no good (or
// is one of the admin's codes, which still asks for the code as before).
export async function peekInvite(token) {
  if (!supabase || !token) return null
  const { data, error } = await supabase.rpc('seamline_invite_peek', { p_token: token })
  return error ? null : data ?? null
}

// The invites I have sent, newest first.
export async function fetchMyInvites() {
  const { data, error } = await supabase
    .from('seamline_invites')
    .select('token, created_at, expires_at, used_by, used_at')
    .eq('invited_by', state.session.user.id)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return data
}

// The admin renames someone: the name everyone sees for them.
export async function renameMember(userId, name) {
  const { data, error } = await supabase.rpc('seamline_set_member_name', { p_user: userId, p_name: name })
  if (error || data?.error) throw new Error(data?.error ?? error.message)
}

// Someone with no code asks for one from the welcome page; Kerry is emailed
// (see seamline-code-request). Signed out, so it carries only the public key.
export async function requestCode({ name, email, note }) {
  let res
  try {
    res = await fetch(`${URL_}/functions/v1/seamline-code-request`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), note: note.trim() }),
    })
  } catch {
    throw new Error('Could not send that. Check your connection.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Could not send that. Try again later.')
}
