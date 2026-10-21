import { getCloud, supabase } from './cloud'
import { isVideo } from './images'

// Notifications on this device when someone else in the library adds photos
// or videos. Turning them on stores this device's push address in
// seamline_push; the functions seamline-notify (members) and
// seamline-visitor-upload (visitors) send to every address but the uploader's.
// The service worker shows them (public/push.js).

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

// The browser wants the key as raw bytes.
function bytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const registration = () => navigator.serviceWorker.ready

// Where this device stands:
// 'unavailable' the database or this copy of the app is not set up for it,
// 'install'     an iPhone or iPad, where Seamline must be on the Home Screen first,
// 'unsupported' this browser cannot receive them,
// 'blocked'     notifications were refused for this site in the browser's settings,
// 'on' or 'off'.
export async function pushStatus() {
  const cloud = getCloud()
  if (!KEY || !supabase || !cloud.canSync || !cloud.features.push) return 'unavailable'
  // The dev server has no service worker, so nothing could receive them there.
  if (import.meta.env.DEV) return 'unsupported'
  if (ios && !installed) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function turnOnPush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed.')
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(KEY) }))
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase
    .from('seamline_push')
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, library: getCloud().library, user_id: getCloud().session.user.id })
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw new Error(error.message)
  }
}

// Also used on signing out, so a device nobody is signed in to stays quiet.
export async function turnOffPush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  if (!sub) return
  await supabase?.from('seamline_push').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// A secret album's news is for its own people only; the server is told who
// they are, as a new album may not have reached it yet.
const audience = (album) => (album.secret ? { members: album.members ?? [] } : null)

// Someone here just made `album`: tell the others. Fire and forget.
export function announceAlbum(album) {
  const cloud = getCloud()
  if (!supabase || !cloud.canSync || !cloud.features.push) return
  supabase.functions
    .invoke('seamline-notify', { body: { album: album.id, name: album.name, made: true, ...audience(album) } })
    .catch(() => {})
}

// Someone here just added `records` to `album`: tell the others. Fire and
// forget; a failure only means no notification.
// People just added to a private album: tell them it was shared with them.
export function announceShared(album, people) {
  const cloud = getCloud()
  if (!supabase || !cloud.canSync || !cloud.features.push || !people.length) return
  supabase.functions
    .invoke('seamline-notify', { body: { album: album.id, name: album.name, shared: people } })
    .catch(() => {})
}
export function announceUpload(album, records) {
  const cloud = getCloud()
  if (!supabase || !cloud.canSync || !cloud.features.push || !records.length) return
  const videos = records.filter(isVideo).length
  supabase.functions
    .invoke('seamline-notify', { body: { album: album.id, name: album.name, photos: records.length - videos, videos, ...audience(album) } })
    .catch(() => {})
}
