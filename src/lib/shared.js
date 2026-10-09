// Photos sent to Seamline from another app's share sheet wait in this cache
// (written by public/share-target.js) until the app files them into an album.
const CACHE = 'shared-photos'

export async function pendingShared() {
  if (!('caches' in window) || !(await caches.has(CACHE))) return []
  const cache = await caches.open(CACHE)
  const files = []
  for (const request of await cache.keys()) {
    const response = await cache.match(request)
    if (!response) continue
    const blob = await response.blob()
    const name = decodeURIComponent(response.headers.get('X-File-Name') || 'photo.jpg')
    files.push(new File([blob], name, { type: blob.type }))
  }
  return files
}

export const clearShared = () => caches.delete(CACHE)
