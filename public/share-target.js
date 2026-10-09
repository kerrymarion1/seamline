// Loaded into the service worker. Android posts photos here when Seamline is
// picked from another app's share sheet (see share_target in the manifest).
// The photos are parked in a cache for the page to collect, then the app opens.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const files = form.getAll('photos').filter((f) => f instanceof File && f.type.startsWith('image/'))
        const cache = await caches.open('shared-photos')
        const stamp = Date.now()
        await Promise.all(
          files.map((file, i) =>
            cache.put(
              `/shared-photos/${stamp}-${i}`,
              new Response(file, {
                headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) },
              }),
            ),
          ),
        )
      } catch (err) {
        console.error('Could not receive shared photos', err)
      }
      return Response.redirect('/albums', 303)
    })(),
  )
})
