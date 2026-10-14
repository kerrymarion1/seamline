import { useEffect } from 'react'
import { syncAlbums, useCloud, userName } from '../lib/cloud'
import { renameUploader, useStore } from '../lib/store'
import { syncNow } from '../lib/sync'

// Runs quietly while the app is open. Shortly after anything changes it puts
// new photos online and sends the change to the other signed-in devices; it
// also checks for their changes every minute and whenever the app comes back
// to the front.
export default function CloudSync() {
  const projects = useStore((s) => s.projects)
  const albums = useStore((s) => s.albums)
  const presets = useStore((s) => s.presets)
  const images = useStore((s) => s.images)
  const { session, uploader, loading, autoSync, canSync } = useCloud()
  const on = !!session && uploader && !loading

  // A name changed on another device reaches this one with the account; make
  // sure everything this person has added here carries it.
  const name = userName(session)
  useEffect(() => {
    if (on) renameUploader(session.user.id, name)
    // Only when the person or their name changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, session?.user.id, name])

  useEffect(() => {
    if (!on || !canSync) return
    const t = setTimeout(syncNow, 2500)
    return () => clearTimeout(t)
  }, [projects, albums, presets, on, canSync])

  useEffect(() => {
    if (!on || !canSync) return
    const tick = setInterval(syncNow, 60000)
    const onVisible = () => !document.hidden && syncNow()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [on, canSync])

  useEffect(() => {
    if (!on || !autoSync) return
    const t = setTimeout(() => syncAlbums(albums, images), 1500)
    return () => clearTimeout(t)
  }, [albums, images, on, autoSync])

  return null
}
