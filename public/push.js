// Loaded into the service worker. Shows a notification sent by the functions
// seamline-notify and seamline-visitor-upload ("Cebu · Maria added 6 photos",
// a message, a heart or a comment), and opens its page when it is tapped.
self.addEventListener('push', (event) => {
  let note = {}
  try {
    note = event.data ? event.data.json() : {}
  } catch {
    note = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(note.title || 'Hugpix', {
      body: note.body || 'Something new was added',
      icon: '/icons/icon-192.png',
      tag: note.tag,
      renotify: !!note.tag,
      // Two short buzzes, so it is felt even with the sound off (Android).
      vibrate: [180, 90, 180],
      data: { url: note.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      // Use the app if it is already open: bring it forward and have it go to
      // the album without reloading. Otherwise open it there.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const app = open.find((c) => new URL(c.url).origin === self.location.origin)
      if (app) {
        await app.focus()
        // The address and its ?photo= (a heart or comment on one photo).
        const { pathname, search } = new URL(url)
        app.postMessage({ type: 'seamline:open', url: pathname + search })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
