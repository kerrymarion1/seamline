import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import LinkSheet from '../components/LinkSheet'
import PhotoPager from '../components/PhotoPager'
import {
  adoptVisitorItems, canLink, deleteComment, findShare, me, progressText, publicUrl, refreshComments, refreshHearts,
  refreshShares, removeVisitorItem, stopShare, useCloud, visitorItems,
} from '../lib/cloud'
import Sheet from '../components/Sheet'
import { clock, importFile, importMedia, isVideo } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { downloadFile, imageFile, saveToPhone } from '../lib/share'
import {
  addImages, addToAlbum, deleteAlbum, uploaderName, moveInAlbum, removeFromAlbum, renameAlbum, setAlbumNote, setCaption, sortAlbum,
  useAlbum, useStore,
} from '../lib/store'

const SORTS = [
  { id: 'newest', name: 'Newest first', hint: 'The most recently added at the top' },
  { id: 'oldest', name: 'Oldest first', hint: 'In the order they were added' },
  { id: 'name', name: 'By name', hint: 'File names, A to Z' },
]

// One album: a pool of photos kept in the app, ready to drop into any project
// or save back to the phone. It can hold videos too; those only live here.
export default function Album({ albumId }) {
  const album = useAlbum(albumId)
  const images = useStore((s) => s.images)
  const { hearts, comments, features, shares, syncing, syncError } = useCloud()
  const fileInput = useRef(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState([])
  const [moving, setMoving] = useState(false) // waiting for a tap on where the picked photos go
  const [favourites, setFavourites] = useState(false) // show only what visitors have hearted
  const [sorting, setSorting] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [notice, setNotice] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(null) // { kind, sourceId, title, imageIds, captions, note }

  useEffect(() => {
    if (!album) navigate('/albums', { replace: true })
  }, [album])

  // Pick up any favourites and notes visitors have left since the app was opened.
  useEffect(() => {
    refreshHearts()
    refreshShares()
    refreshComments()
  }, [])

  useEffect(() => {
    if (!notice || notice.busy) return
    const t = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(t)
  }, [notice])

  if (!album) return null
  const ids = album.imageIds.filter((id) => images[id])
  const liked = ids.filter((id) => hearts.byItem[id] > 0)
  const onlyLiked = favourites && liked.length > 0
  const shown = onlyLiked ? liked : ids
  // What a link can show: everything, or only the photos where videos cannot go online.
  const photoIds = ids.filter((id) => canLink(images[id]))
  const viewed = images[viewing]
  const captions = album.captions ?? {}
  const addedBy = album.addedBy ?? {}
  const said = comments[viewing] ?? []

  async function addPhotos(files) {
    if (!files.length) return
    const records = []
    let failed = 0
    for (const [i, file] of files.entries()) {
      setNotice({ busy: true, text: `Importing ${i + 1} of ${files.length}` })
      try {
        records.push(await importMedia(file))
      } catch {
        failed++
      }
    }
    addImages(records)
    addToAlbum(album.id, records.map((r) => r.id), me())
    setNotice(failed ? { text: `${failed} file${failed > 1 ? 's' : ''} could not be read` } : null)
  }

  // A photo's file: the one on this device, or its online copy where this
  // device only holds a small one.
  async function fileOf(image) {
    if (image.blob) return imageFile(image)
    const res = await fetch(image.remote)
    if (!res.ok) throw new Error('A photo could not be downloaded')
    const base = (image.name ?? 'photo').replace(/\.[^.]+$/, '') || 'photo'
    return new File([await res.blob()], `${base}.jpg`, { type: 'image/jpeg' })
  }

  async function save(imageIds) {
    setBusy(true)
    try {
      // Videos are too large to zip in memory; each is saved as its own file.
      const chosen = imageIds.map((id) => images[id])
      const stills = []
      for (const img of chosen.filter((x) => !isVideo(x))) stills.push(await fileOf(img))
      if (stills.length) await saveToPhone(stills, album.name)
      for (const clip of chosen.filter(isVideo)) {
        if (clip.blob) downloadFile(imageFile(clip))
        else window.open(clip.remote, '_blank') // not kept on this device: fetch the online copy
      }
      setNotice({ text: stills.length > 1 ? 'Saved as a zip in Downloads' : 'Saved to Downloads' })
    } catch (e) {
      setNotice({ text: e.message || 'Could not save the photos' })
    }
    setBusy(false)
  }

  // Sharing always means a link to a page showing the photos, never the files.
  const linkPhoto = () =>
    setLinking({
      kind: 'photo', sourceId: viewing, title: (viewed.name ?? 'Photo').replace(/\.[^.]+$/, ''), imageIds: [viewing], captions,
    })
  const canLinkViewed = canLink(viewed)
  // A few chosen photos get a page of their own, separate from the album's.
  const linkPicked = () => {
    const chosen = photoIds.filter((id) => picked.includes(id))
    let hash = 5381
    for (const ch of chosen.join()) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0
    setLinking({
      kind: 'album',
      sourceId: `${album.id}:${hash.toString(36)}`,
      title: `${album.name} · ${chosen.length} photo${chosen.length === 1 ? '' : 's'}`,
      imageIds: chosen,
      captions,
    })
  }

  // Photos visitors added through this album's link wait here until kept or removed.
  const share = findShare(shares, 'album', album.id)
  const added = visitorItems(share)

  async function keepAdded() {
    setBusy(true)
    try {
      const idMap = {}
      for (const [i, item] of added.entries()) {
        setNotice({ busy: true, text: `Saving ${i + 1} of ${added.length}` })
        const res = await fetch(publicUrl(item.path))
        if (!res.ok) throw new Error('A photo could not be downloaded')
        const record = await importFile(new File([await res.blob()], item.name, { type: 'image/jpeg' }))
        addImages([record])
        addToAlbum(album.id, [record.id], 'A visitor')
        idMap[item.id] = record.id
      }
      await adoptVisitorItems(share, idMap)
      setNotice({ text: `Added ${added.length} to this album` })
    } catch (e) {
      setNotice({ text: e.message || 'Could not save those photos' })
    }
    setBusy(false)
  }

  const dropAdded = (item) => removeVisitorItem(share, item).catch((e) => setNotice({ text: e.message }))

  const stopSelecting = () => {
    setSelecting(false)
    setMoving(false)
    setPicked([])
  }
  // Put the picked photos in front of `before` ('start', or nothing for the end).
  const moveTo = (before) => {
    moveInAlbum(album.id, picked, before)
    setNotice({ text: `Moved ${picked.length} photo${picked.length === 1 ? '' : 's'}` })
    stopSelecting()
  }
  const tileOf = (id) => document.querySelector(`.photo[data-id="${id}"]`)
  // The photo grows out of its tile, and shrinks back into whichever tile is showing when closed.
  const open = (id) => morph(() => setViewing(id), { from: () => tileOf(id) })
  const close = () => morph(() => setViewing(null), { to: () => tileOf(viewing) })
  const tap = (id) => {
    if (moving) return picked.includes(id) ? undefined : moveTo(id)
    if (!selecting) return open(id)
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  const allPicked = shown.length > 0 && shown.every((id) => picked.includes(id))
  const remove = (imageIds) => {
    removeFromAlbum(album.id, imageIds)
    stopSelecting()
    setViewing(null)
  }
  const sort = (mode) => {
    sortAlbum(album.id, mode)
    setSorting(false)
  }

  return (
    <div className="screen album">
      <header className="topbar">
        <button
          className="icon-btn"
          // The album shrinks back into its card on the front page.
          onClick={() =>
            morph(() => navigate('/albums', { animate: false }), {
              name: 'album',
              from: () => document.querySelector('.screen.album'),
              to: () => document.querySelector(`[data-album="${album.id}"]`),
            })
          }
          aria-label="Back to albums"
        >
          <Icon name="back" />
        </button>
        <input
          className="title-input"
          value={album.name}
          onChange={(e) => renameAlbum(album.id, e.target.value)}
          onBlur={(e) => !e.target.value.trim() && renameAlbum(album.id, 'Untitled album')}
          aria-label="Album name"
        />
        {selecting && !moving && (
          <button className="pill-btn" onClick={() => setPicked(allPicked ? [] : shown)}>{allPicked ? 'None' : 'All'}</button>
        )}
        {ids.length > 0 && (
          <button className="pill-btn" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
        {photoIds.length > 0 && !selecting && (
          <button
            className="icon-btn"
            onClick={() =>
              setLinking({ kind: 'album', sourceId: album.id, title: album.name, imageIds: photoIds, captions, note: album.note ?? '' })
            }
            aria-label="Share album link"
          >
            <Icon name="link" size={20} />
          </button>
        )}
        {!selecting && (
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete album">
            <Icon name="trash" size={20} />
          </button>
        )}
      </header>

      {ids.length === 0 && added.length === 0 ? (
        <div className="empty">
          <h2>An empty pool</h2>
          <p>Add photos here once and reuse them in any collage. Videos can be kept here too.</p>
          <button className="primary" onClick={() => fileInput.current.click()}>
            <Icon name="plus" size={20} /> Add photos or videos
          </button>
        </div>
      ) : (
        <main className="album-body">
          {syncing?.id === album.id && (
            <p className="sync-note">
              <i className="spinner inline" />
              {syncing.total ? progressText(syncing.done, syncing.total, syncing.fraction) : 'Checking what is online'}
            </p>
          )}
          {syncError && !syncing && <p className="sync-note error">Could not put this album online: {syncError}</p>}
          {moving && <p className="sync-note">Tap the photo these should go in front of, or choose below.</p>}
          {features.notes && !selecting && (
            <input
              className="album-note"
              value={album.note ?? ''}
              onChange={(e) => setAlbumNote(album.id, e.target.value)}
              placeholder="Add a note for the shared page"
              maxLength={300}
              enterKeyHint="done"
              aria-label="Album note"
            />
          )}
          {!selecting && ids.length > 1 && (
            <div className="album-bar">
              {liked.length > 0 && (
                <>
                  <button className={`chip small ${onlyLiked ? '' : 'on'}`} onClick={() => setFavourites(false)}>All {ids.length}</button>
                  <button className={`chip small ${onlyLiked ? 'on' : ''}`} onClick={() => setFavourites(true)}>
                    <Icon name="heart" size={14} /> Favourites {liked.length}
                  </button>
                </>
              )}
              <button className="chip small sort-btn" onClick={() => setSorting(true)}>
                <Icon name="sort" size={16} /> Sort
              </button>
            </div>
          )}
          {added.length > 0 && (
            <section className="visitor-box">
              <div className="row">
                <div className="label">{added.length} added by visitors</div>
                <button className="pill-btn" disabled={busy} onClick={keepAdded}>Keep in album</button>
              </div>
              <div className="visitor-strip">
                {added.map((item) => (
                  <div key={item.id} className="visitor-thumb">
                    <img src={publicUrl(item.path)} alt={item.name} loading="lazy" draggable={false} />
                    <button onClick={() => dropAdded(item)} aria-label={`Remove ${item.name}`}><Icon name="close" size={14} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="photo-grid">
            {shown.map((id, i) => {
              const on = picked.includes(id)
              return (
                <button key={id} data-id={id} className={`photo ${on ? 'on' : ''}`} style={{ '--i': Math.min(i, 17) }} onClick={() => tap(id)}>
                  <img className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                  {selecting && <b>{on && <Icon name="check" size={14} />}</b>}
                  {isVideo(images[id]) && (
                    <span className="clip"><Icon name="play" size={13} /> {clock(images[id].duration)}</span>
                  )}
                  {hearts.byItem[id] > 0 && (
                    <span className="hearts"><Icon name="heart" size={13} /> {hearts.byItem[id]}</span>
                  )}
                  {(addedBy[id] || comments[id]?.length > 0) && (
                    <span className="tile-tags">
                      {addedBy[id] && <span className="by">{uploaderName(addedBy[id])}</span>}
                      {comments[id]?.length > 0 && <span className="said"><Icon name="comment" size={13} /> {comments[id].length}</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </main>
      )}

      {ids.length > 0 && !selecting && (
        <button className="primary fab" onClick={() => fileInput.current.click()}>
          <Icon name="plus" size={20} /> Add photos or videos
        </button>
      )}
      {selecting && (
        <nav className="toolbar">
          {moving ? (
            <div className="tools show">
              <button className="tool" onClick={() => moveTo('start')}>
                <Icon name="back" />
                <span>To the start</span>
              </button>
              <button className="tool" onClick={() => moveTo(null)}>
                <Icon name="forward" />
                <span>To the end</span>
              </button>
              <button className="tool" onClick={() => setMoving(false)}>
                <Icon name="close" />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            <div className="tools show">
              <button className="tool" disabled={!picked.some((id) => photoIds.includes(id))} onClick={linkPicked}>
                <Icon name="link" />
                <span>Share link</span>
              </button>
              <button className="tool" disabled={!picked.length || busy} onClick={() => save(picked)}>
                <Icon name="download" />
                <span>Save {picked.length || ''}</span>
              </button>
              {/* Moving only makes sense with the whole album in view. */}
              <button className="tool" disabled={!picked.length || picked.length === ids.length || onlyLiked} onClick={() => setMoving(true)}>
                <Icon name="move" />
                <span>Move</span>
              </button>
              <button className="tool danger" disabled={!picked.length} onClick={() => remove(picked)}>
                <Icon name="trash" />
                <span>Remove</span>
              </button>
            </div>
          )}
        </nav>
      )}

      {viewed && (
        <div className="viewer">
          <header className="topbar">
            <button className="icon-btn" onClick={close} aria-label="Close photo">
              <Icon name="close" />
            </button>
            <div className="preview-title">
              {viewed.width} × {viewed.height}{isVideo(viewed) && ` · ${clock(viewed.duration)}`}
              {hearts.byItem[viewing] > 0 && <span className="hearts inline"><Icon name="heart" size={13} /> {hearts.byItem[viewing]}</span>}
            </div>
            <button className="icon-btn" onClick={() => remove([viewing])} aria-label="Remove from album">
              <Icon name="trash" size={20} />
            </button>
          </header>
          <PhotoPager
            slides={shown.map((id) => ({ key: id, src: images[id].url, poster: images[id].previewUrl, video: isVideo(images[id]) }))}
            index={shown.indexOf(viewing)}
            onIndex={(i) => setViewing(shown[i])}
          />
          <div className="viewer-notes">
            {addedBy[viewing] && <p className="note centre">Added by {uploaderName(addedBy[viewing])}</p>}
            {said.length > 0 && (
              <ul className="comment-list">
                {said.map((c) => (
                  <li key={c.id}>
                    <p><b>{c.author || 'A visitor'}</b> {c.body}</p>
                    <button
                      className="icon-btn"
                      onClick={() => deleteComment(c.id).catch((e) => setNotice({ text: e.message }))}
                      aria-label="Delete this note"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              className="caption-input"
              value={captions[viewing] ?? ''}
              onChange={(e) => setCaption(album.id, viewing, e.target.value)}
              placeholder="Add a caption"
              maxLength={200}
              enterKeyHint="done"
              aria-label="Caption"
            />
          </div>
          <footer className="preview-actions">
            {!canLinkViewed ? (
              <button className="primary block" disabled={busy} onClick={() => save([viewing])}>
                <Icon name="download" size={20} /> Save to phone
              </button>
            ) : (
              <>
                <button className="primary block" onClick={linkPhoto}>
                  <Icon name="link" size={20} /> Share link
                </button>
                <button className="text-btn" disabled={busy} onClick={() => save([viewing])}>Save to phone</button>
              </>
            )}
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

      <Sheet open={sorting} onClose={() => setSorting(false)} title="Sort this album" modal>
        <p className="hint">The order is kept, and it is the order people see on the shared page.</p>
        <ul className="layer-list">
          {SORTS.map((s) => (
            <li key={s.id}>
              <button className="layer-pick album-pick" onClick={() => sort(s.id)}>
                <span className="layer-name">{s.name}</span>
                <span className="hint">{s.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="note">To place photos by hand, tap Select, choose them, then Move.</p>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete album?" modal>
        <p className="hint">
          “{album.name}” and its {ids.length} photo{ids.length === 1 ? '' : 's'} will be removed from the app.
          Photos already used in a project stay in that project.{share ? ' Its shared link will stop working.' : ''}
        </p>
        <button
          className="primary block danger"
          onClick={() => {
            // Its link goes with it; photos other links still show are kept online.
            if (share) stopShare(share).catch(() => {})
            deleteAlbum(album.id)
          }}
        >
          Delete
        </button>
      </Sheet>

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
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
