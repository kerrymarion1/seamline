import { useEffect, useState } from 'react'
import { AlbumName } from './HomeLayouts'
import Sheet from './Sheet'
import { isVideo } from '../lib/images'
import { useStore } from '../lib/store'

// Choosing photos from the albums: an album at a time, tapped in order (the
// number shows the order). With `max` 1 a tap just picks that one. `onPick`
// gets the ids chosen and the images they are in. `action(n)` is the button's
// words for n chosen; `secretNote` shows when the album is a secret one.
export default function AlbumPhotoPicker({ open, onClose, onPick, max = 10, title, action, secretNote }) {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const [albumId, setAlbumId] = useState(null)
  const [picked, setPicked] = useState([])
  useEffect(() => {
    if (!open) setPicked([])
  }, [open])
  const isPhoto = (id) => images[id] && !isVideo(images[id])
  const withPhotos = albums.filter((a) => a.imageIds.some(isPhoto))
  const album = withPhotos.find((a) => a.id === albumId) ?? withPhotos[0]
  const ids = album ? album.imageIds.filter(isPhoto) : []
  const toggle = (id) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id)
      if (max === 1) return [id]
      return p.length < max ? [...p, id] : p
    })
  return (
    <Sheet open={open} onClose={onClose} title={title} modal>
      {withPhotos.length === 0 ? (
        <p className="hint">There are no photos in the albums yet.</p>
      ) : (
        <>
          <div className="chips">
            {withPhotos.map((a) => (
              <button key={a.id} className={`chip small ${a === album ? 'on' : ''}`} onClick={() => setAlbumId(a.id)}>
                <AlbumName album={a} />
              </button>
            ))}
          </div>
          <div className="pick-grid">
            {ids.map((id) => {
              const n = picked.indexOf(id)
              return (
                <button key={id} className={`pick-photo ${n >= 0 ? 'on' : ''}`} onClick={() => toggle(id)} aria-pressed={n >= 0}>
                  <img src={images[id].previewUrl} alt="" loading="lazy" draggable={false} />
                  {n >= 0 && max > 1 && <b>{n + 1}</b>}
                </button>
              )
            })}
          </div>
          {secretNote && album?.secret && picked.length > 0 && <p className="note">{secretNote}</p>}
          <button className="primary block" disabled={!picked.length} onClick={() => onPick(picked, images)}>
            {action(picked.length)}
          </button>
        </>
      )}
    </Sheet>
  )
}
