import { useState } from 'react'
import Icon from '../components/Icon'

// Photo source for the editor: the phone's own picker, or the pool of photos
// kept in an album. Tap photos to tick them, then add them in that order.
export default function PhotoPicker({ albums, images, emptySpots = 0, usedIds = [], onPhone, onAdd }) {
  const filled = albums.filter((a) => a.imageIds.some((id) => images[id]))
  const [albumId, setAlbumId] = useState(null)
  const [picked, setPicked] = useState([])
  const album = filled.find((a) => a.id === albumId) ?? filled[0]

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const add = () => {
    onAdd(picked)
    setPicked([])
  }

  // One tap to fill the layout: this album's photos that are not placed yet,
  // in album order, into the empty spots.
  const fresh = album ? album.imageIds.filter((id) => images[id] && !usedIds.includes(id)) : []
  const fillCount = Math.min(emptySpots, fresh.length)

  return (
    <>
      <div className="chips">
        <button className="chip source" onClick={onPhone}>
          <Icon name="photo" size={18} /> From phone
        </button>
        {filled.map((a) => (
          <button key={a.id} className={`chip ${a === album ? 'on' : ''}`} onClick={() => setAlbumId(a.id)}>
            {a.name}
          </button>
        ))}
      </div>
      {album && (
        <div className="photo-grid picker">
          {album.imageIds.filter((id) => images[id]).map((id) => {
            const n = picked.indexOf(id) + 1
            return (
              <button key={id} className={`photo ${n ? 'on' : ''}`} onClick={() => toggle(id)}>
                <img src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                {n > 0 && <b>{n}</b>}
              </button>
            )
          })}
        </div>
      )}
      {fillCount > 0 && !picked.length && (
        <button className="secondary block" onClick={() => onAdd(fresh.slice(0, fillCount))}>
          Fill {fillCount} empty spot{fillCount === 1 ? '' : 's'} from {album.name}
        </button>
      )}
      <button className="primary block" disabled={!picked.length} onClick={add}>
        {picked.length ? `Add ${picked.length} photo${picked.length > 1 ? 's' : ''}` : 'Choose photos'}
      </button>
    </>
  )
}
