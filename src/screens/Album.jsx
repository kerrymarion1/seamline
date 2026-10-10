import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import LinkSheet from '../components/LinkSheet'
import { refreshHearts, useCloud } from '../lib/cloud'
import Sheet from '../components/Sheet'
import { importFile } from '../lib/images'
import { imageFile, saveToPhone } from '../lib/share'
import {
  addImages, addToAlbum, deleteAlbum, removeFromAlbum, renameAlbum, useAlbum, useStore,
} from '../lib/store'

// One album: a pool of photos kept in the app, ready to drop into any project
// or save back to the phone.
export default function Album({ albumId }) {
  const album = useAlbum(albumId)
  const images = useStore((s) => s.images)
  const { hearts } = useCloud()
  const fileInput = useRef(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState([])
  const [viewing, setViewing] = useState(null)
  const [notice, setNotice] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(null) // { kind, sourceId, title, imageIds }

  useEffect(() => {
    if (!album) navigate('/albums', { replace: true })
  }, [album])

  // Pick up any favourites visitors have left since the app was opened.
  useEffect(() => {
    refreshHearts()
  }, [])

  useEffect(() => {
    if (!notice || notice.busy) return
    const t = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(t)
  }, [notice])

  if (!album) return null
  const ids = album.imageIds.filter((id) => images[id])
  const viewed = images[viewing]

  async function addPhotos(files) {
    if (!files.length) return
    const records = []
    let failed = 0
    for (const [i, file] of files.entries()) {
      setNotice({ busy: true, text: `Importing ${i + 1} of ${files.length}` })
      try {
        records.push(await importFile(file))
      } catch {
        failed++
      }
    }
    addImages(records)
    addToAlbum(album.id, records.map((r) => r.id))
    setNotice(failed ? { text: `${failed} photo${failed > 1 ? 's' : ''} could not be read` } : null)
  }

  const filesOf = (imageIds) => imageIds.map((id) => imageFile(images[id]))

  async function save(imageIds) {
    setBusy(true)
    try {
      await saveToPhone(filesOf(imageIds), album.name)
      setNotice({ text: imageIds.length > 1 ? 'Saved as a zip in Downloads' : 'Saved to Downloads' })
    } catch (e) {
      setNotice({ text: e.message || 'Could not save the photos' })
    }
    setBusy(false)
  }

  // Sharing always means a link to a page showing the photos, never the files.
  const linkPhoto = () =>
    setLinking({ kind: 'photo', sourceId: viewing, title: (viewed.name ?? 'Photo').replace(/\.[^.]+$/, ''), imageIds: [viewing] })
  // A few chosen photos get a page of their own, separate from the album's.
  const linkPicked = () => {
    const chosen = ids.filter((id) => picked.includes(id))
    let hash = 5381
    for (const ch of chosen.join()) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0
    setLinking({
      kind: 'album',
      sourceId: `${album.id}:${hash.toString(36)}`,
      title: `${album.name} · ${chosen.length} photo${chosen.length === 1 ? '' : 's'}`,
      imageIds: chosen,
    })
  }

  const stopSelecting = () => {
    setSelecting(false)
    setPicked([])
  }
  const tap = (id) => {
    if (!selecting) return setViewing(id)
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  const remove = (imageIds) => {
    removeFromAlbum(album.id, imageIds)
    stopSelecting()
    setViewing(null)
  }

  return (
    <div className="screen album">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/albums')} aria-label="Back to albums">
          <Icon name="back" />
        </button>
        <input
          className="title-input"
          value={album.name}
          onChange={(e) => renameAlbum(album.id, e.target.value)}
          onBlur={(e) => !e.target.value.trim() && renameAlbum(album.id, 'Untitled album')}
          aria-label="Album name"
        />
        {ids.length > 0 && (
          <button className="pill-btn" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
        {ids.length > 0 && !selecting && (
          <button
            className="icon-btn"
            onClick={() => setLinking({ kind: 'album', sourceId: album.id, title: album.name, imageIds: ids })}
            aria-label="Share album link"
          >
            <Icon name="link" size={20} />
          </button>
        )}
        <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete album">
          <Icon name="trash" size={20} />
        </button>
      </header>

      {ids.length === 0 ? (
        <div className="empty">
          <h2>An empty pool</h2>
          <p>Add photos here once and reuse them in any carousel or collage.</p>
          <button className="primary" onClick={() => fileInput.current.click()}>
            <Icon name="plus" size={20} /> Add photos
          </button>
        </div>
      ) : (
        <main className="album-body">
          <div className="photo-grid">
            {ids.map((id) => {
              const on = picked.includes(id)
              return (
                <button key={id} className={`photo ${on ? 'on' : ''}`} onClick={() => tap(id)}>
                  <img src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                  {selecting && <b>{on && <Icon name="check" size={14} />}</b>}
                  {hearts.byItem[id] > 0 && (
                    <span className="hearts"><Icon name="heart" size={13} /> {hearts.byItem[id]}</span>
                  )}
                </button>
              )
            })}
          </div>
        </main>
      )}

      {ids.length > 0 && !selecting && (
        <button className="primary fab" onClick={() => fileInput.current.click()}>
          <Icon name="plus" size={20} /> Add photos
        </button>
      )}
      {selecting && (
        <nav className="toolbar">
          <div className="tools show">
            <button className="tool" disabled={!picked.length} onClick={linkPicked}>
              <Icon name="link" />
              <span>Share link</span>
            </button>
            <button className="tool" disabled={!picked.length || busy} onClick={() => save(picked)}>
              <Icon name="download" />
              <span>Save {picked.length || ''}</span>
            </button>
            <button className="tool danger" disabled={!picked.length} onClick={() => remove(picked)}>
              <Icon name="trash" />
              <span>Remove</span>
            </button>
          </div>
        </nav>
      )}

      {viewed && (
        <div className="viewer">
          <header className="topbar">
            <button className="icon-btn" onClick={() => setViewing(null)} aria-label="Close photo">
              <Icon name="close" />
            </button>
            <div className="preview-title">
              {viewed.width} × {viewed.height}
              {hearts.byItem[viewing] > 0 && <span className="hearts inline"><Icon name="heart" size={13} /> {hearts.byItem[viewing]}</span>}
            </div>
            <button className="icon-btn" onClick={() => remove([viewing])} aria-label="Remove from album">
              <Icon name="trash" size={20} />
            </button>
          </header>
          <div className="viewer-body">
            <img src={viewed.url} alt="" draggable={false} />
          </div>
          <footer className="preview-actions">
            <button className="primary block" onClick={linkPhoto}>
              <Icon name="link" size={20} /> Share link
            </button>
            <button className="text-btn" disabled={busy} onClick={() => save([viewing])}>Save to phone</button>
          </footer>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice.busy && <i className="spinner" />}
          {notice.text}
        </div>
      )}

      <LinkSheet target={linking} onClose={() => setLinking(null)} />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete album?" modal>
        <p className="hint">
          “{album.name}” and its {ids.length} photo{ids.length === 1 ? '' : 's'} will be removed from the app.
          Photos already used in a project stay in that project.
        </p>
        <button className="primary block danger" onClick={() => deleteAlbum(album.id)}>Delete</button>
      </Sheet>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...e.target.files]
          e.target.value = ''
          addPhotos(files)
        }}
      />
    </div>
  )
}
