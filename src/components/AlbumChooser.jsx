import { AlbumName, focusStyle, photosOf } from './HomeLayouts'
import Icon from './Icon'
import Sheet from './Sheet'
import { countText } from '../lib/images'
import { lastUpload, useStore } from '../lib/store'

// Choosing an album: for photos going into another album, or for the camera
// from the front page. The newest first, or `first` (the one used last time)
// at the top; `exclude` is left out (the album already open).
export default function AlbumChooser({ open, onClose, title, note, exclude, first, onPick }) {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const list = albums
    .filter((a) => a.id !== exclude)
    .sort((a, b) => (b.id === first) - (a.id === first) || lastUpload(b) - lastUpload(a))
  return (
    <Sheet open={open} onClose={onClose} title={title} modal>
      {note && <p className="note">{note}</p>}
      {list.length === 0 ? (
        <p className="hint">There are no other albums yet.</p>
      ) : (
        <ul className="layer-list">
          {list.map((a) => {
            const shown = photosOf(a, images)
            return (
              <li key={a.id}>
                <button className="layer-pick album-pick add-to" onClick={() => onPick(a)}>
                  {shown[0] ? (
                    <span className="add-to-pic"><img src={images[shown[0]].previewUrl} style={focusStyle(a, shown[0])} alt="" draggable={false} /></span>
                  ) : (
                    <span className="add-to-blank"><Icon name="photo" size={18} /></span>
                  )}
                  <span className="layer-name"><AlbumName album={a} /></span>
                  <span className="hint">{shown.length ? countText(shown.map((id) => images[id])) : 'Empty'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
