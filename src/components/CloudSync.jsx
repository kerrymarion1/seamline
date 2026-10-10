import { useEffect } from 'react'
import { syncAlbums, useCloud } from '../lib/cloud'
import { useStore } from '../lib/store'

// Runs quietly while the app is open: shortly after albums change, it puts
// any new photos online so that sharing later is only a matter of a link.
export default function CloudSync() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { session, uploader, loading, autoSync } = useCloud()

  useEffect(() => {
    if (!session || !uploader || loading || !autoSync) return
    const t = setTimeout(() => syncAlbums(albums, images), 1500)
    return () => clearTimeout(t)
  }, [albums, images, session, uploader, loading, autoSync])

  return null
}
