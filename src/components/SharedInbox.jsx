import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { importMedia, isVideoFile } from '../lib/images'
import { clearShared, pendingShared } from '../lib/shared'
import { addImages, addToAlbum, createAlbum, useStore } from '../lib/store'
import Icon from './Icon'
import Sheet from './Sheet'

// Asks which album should receive photos and videos shared in from another app
// (for example Lightroom's Share button on Android).
export default function SharedInbox() {
  const albums = useStore((s) => s.albums)
  const [files, setFiles] = useState([])
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    const check = () => pendingShared().then(setFiles).catch(() => {})
    check()
    // A share can arrive while the app is already open in the background.
    const onVisible = () => !document.hidden && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const dismiss = () => {
    clearShared()
    setFiles([])
  }

  async function addTo(album) {
    const target = album ?? createAlbum('Shared photos')
    const records = []
    for (const [i, file] of files.entries()) {
      setProgress(`Importing ${i + 1} of ${files.length}`)
      try {
        records.push(await importMedia(file))
      } catch {
        // Skip anything that is not a readable photo or video.
      }
    }
    addImages(records)
    addToAlbum(target.id, records.map((r) => r.id))
    await clearShared()
    setProgress(null)
    setFiles([])
    navigate(`/album/${target.id}`)
  }

  const n = files.length
  const noun = files.every(isVideoFile) ? 'video' : files.some(isVideoFile) ? 'item' : 'photo'
  return (
    <Sheet open={n > 0} onClose={dismiss} title={`Add ${n} shared ${noun}${n === 1 ? '' : 's'}`} modal>
      {progress ? (
        <p className="hint centre">
          <i className="spinner inline" /> {progress}
        </p>
      ) : (
        <>
          <p className="hint">Choose the album to put them in.</p>
          <ul className="layer-list">
            {albums.map((a) => (
              <li key={a.id}>
                <button className="layer-pick album-pick" onClick={() => addTo(a)}>
                  <span className="layer-name">{a.name}</span>
                  <span className="hint">{a.imageIds.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="primary block" onClick={() => addTo(null)}>
            <Icon name="plus" size={20} /> New album
          </button>
        </>
      )}
    </Sheet>
  )
}
