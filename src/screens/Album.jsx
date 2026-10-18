import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Avatar from '../components/Avatar'
import LinkSheet from '../components/LinkSheet'
import PeoplePicker from '../components/PeoplePicker'
import PhotoPager from '../components/PhotoPager'
import { reactedText, ReactionRow } from '../components/Reactions'
import {
  adoptVisitorItems, canLink, deleteComment, fetchMedia, findShare, me, progressText, publicUrl, refreshComments,
  refreshHearts, refreshShares, removeVisitorItem, setPinned, setRights, stopShare, useCloud, usePinned, visitorItems,
} from '../lib/cloud'
import Sheet from '../components/Sheet'
import { clock, countText, importFile, importMedia, isVideo } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { personIn, usePeople } from '../lib/people'
import { announceUpload } from '../lib/push'
import { addPhotoComment, fetchAlbumSocial, removePhotoComment, setReaction, watchAlbumSocial } from '../lib/social'
import { syncNow } from '../lib/sync'
import { SEASONS, useActiveSeason } from '../lib/theme'
import { downloadFile, imageFile, saveToPhone } from '../lib/share'
import {
  addImages, addToAlbum, deleteAlbum, uploaderName, moveInAlbum, removeFromAlbum, renameAlbum, setAlbumNote, setAlbumPeople, setCaption,
  sortAlbum, useAlbum, useStore,
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
  // A guest sees every album and adds to it; links are a member's. Albums the
  // guest made are theirs to change; on everyone else's they are `limited`.
  const { hearts, comments, features, shares, syncing, syncError, admin, guest, session } = useCloud()
  const limited = guest && album?.createdBy !== session?.user.id
  // The photo pinned to lead the front page, for the season showing now.
  const pin = usePinned()
  const season = useActiveSeason()
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
  const [pending, setPending] = useState([]) // chosen, waiting for "Add"
  // Who sees this album: everyone, or (secret) only the people chosen.
  const [choosingPeople, setChoosingPeople] = useState(false)
  const people = usePeople()
  const [secretOn, setSecretOn] = useState(false)
  const [chosen, setChosen] = useState([])

  // Hearts and comments from the family, live while the album is open.
  const [social, setSocial] = useState({ hearts: [], comments: [] })
  const [saying, setSaying] = useState('')
  useEffect(() => {
    if (!features.social) return
    let live = true
    const load = () => fetchAlbumSocial(albumId).then((s) => live && setSocial(s)).catch(() => {})
    load()
    const stop = watchAlbumSocial(albumId, load)
    const t = setInterval(() => !document.hidden && load(), 30000)
    return () => {
      live = false
      stop()
      clearInterval(t)
    }
  }, [albumId, features.social])

  // Opened from a notification about one photo (?photo=): show that photo.
  const askedPhoto = useRef(new URLSearchParams(window.location.search).get('photo'))
  useEffect(() => {
    const photo = askedPhoto.current
    if (!photo || !album?.imageIds.includes(photo) || !images[photo]) return
    askedPhoto.current = null
    setViewing(photo)
    window.history.replaceState(null, '', window.location.pathname)
  }, [album, images])

  // An album that was here and is gone (deleted) goes back to the albums at
  // once. One not on this device yet, such as one just made elsewhere and
  // opened from a notification, gets a sync and a few seconds to arrive.
  const seen = useRef(!!album)
  useEffect(() => {
    if (album) {
      seen.current = true
      return
    }
    if (seen.current) return navigate('/albums', { replace: true })
    syncNow()
    const t = setTimeout(() => navigate('/albums', { replace: true }), 10000)
    return () => clearTimeout(t)
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

  if (!album) {
    return seen.current ? null : (
      <div className="screen">
        <p className="hint centre"><i className="spinner inline" /> Getting this album</p>
      </div>
    )
  }
  const ids = album.imageIds.filter((id) => images[id])
  // The family's hearts (who) and comments, by photo.
  const famHearts = {}
  for (const h of social.hearts) (famHearts[h.photo] ??= []).push(h.user_id)
  const famNotes = {}
  for (const c of social.comments) (famNotes[c.photo] ??= []).push(c)
  const heartCount = (id) => (hearts.byItem[id] ?? 0) + (famHearts[id]?.length ?? 0)
  const noteCount = (id) => (comments[id]?.length ?? 0) + (famNotes[id]?.length ?? 0)
  const liked = ids.filter((id) => heartCount(id) > 0)
  const onlyLiked = favourites && liked.length > 0
  const shown = onlyLiked ? liked : ids
  // What a link can show: everything, or only the photos where videos cannot go online.
  const photoIds = ids.filter((id) => canLink(images[id]))
  const viewed = images[viewing]
  const captions = album.captions ?? {}
  const addedBy = album.addedBy ?? {}
  const said = comments[viewing] ?? []
  // A secret album never gets a link or the front-page pin: both would show
  // its photos to everyone.
  const secret = !!album.secret
  const myId = session?.user.id
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Someone'
  const openPeople = () => {
    setSecretOn(secret)
    setChosen(album.members ?? (myId ? [myId] : []))
    setChoosingPeople(true)
  }
  const savePeople = () => {
    // You stay in it yourself; only the admin can be outside a secret album.
    const members = secretOn ? [...new Set([...(admin || !myId ? [] : [myId]), ...chosen])] : null
    setAlbumPeople(album.id, members)
    // A link would show it to anyone: going secret switches it off.
    if (members && share) stopShare(share).catch(() => {})
    setChoosingPeople(false)
    setNotice({
      text: members ? `Secret: only ${members.length === 1 ? 'you' : `these ${members.length} people`} can see it` : 'Everyone can see this album now',
    })
  }

  // The family's reactions and comments on the photo being looked at.
  const reactedHere = social.hearts.filter((h) => h.photo === viewing)
  const firstOf = (id) => (id === myId ? 'You' : (personIn(people, id)?.name ?? 'Someone').split(' ')[0])
  const react = (emoji) => {
    const photo = viewing
    setSocial((s) => ({
      ...s,
      hearts: [...s.hearts.filter((h) => !(h.photo === photo && h.user_id === myId)), ...(emoji ? [{ photo, user_id: myId, emoji }] : [])],
    }))
    setReaction(album, photo, emoji).catch((e) => {
      setNotice({ text: e.message })
      fetchAlbumSocial(album.id).then(setSocial).catch(() => {})
    })
  }
  const postComment = async (e) => {
    e.preventDefault()
    const text = saying
    if (!text.trim()) return
    setSaying('')
    try {
      const added = await addPhotoComment(album, viewing, text)
      if (added) setSocial((s) => (s.comments.some((c) => c.id === added.id) ? s : { ...s, comments: [...s.comments, added] }))
    } catch (err) {
      setSaying(text)
      setNotice({ text: err.message })
    }
  }
  const dropComment = (c) =>
    removePhotoComment(c.id)
      .then(() => setSocial((s) => ({ ...s, comments: s.comments.filter((x) => x.id !== c.id) })))
      .catch((e) => setNotice({ text: e.message }))

  // Chosen photos and videos wait in a sheet first, where any can be taken
  // off or more chosen; only "Add" puts them in the album.
  async function choosePhotos(files) {
    if (!files.length) return
    const records = []
    let failed = 0
    for (const [i, file] of files.entries()) {
      setNotice({ busy: true, text: `Getting ${i + 1} of ${files.length} ready` })
      try {
        records.push(await importMedia(file))
      } catch {
        failed++
      }
    }
    setPending((p) => [...p, ...records])
    setNotice(failed ? { text: `${failed} file${failed > 1 ? 's' : ''} could not be read` } : null)
  }
  const dropPending = (records) =>
    records.forEach((r) => {
      URL.revokeObjectURL(r.url)
      if (r.previewUrl !== r.url) URL.revokeObjectURL(r.previewUrl)
    })
  const unpick = (record) => {
    dropPending([record])
    setPending((p) => p.filter((r) => r !== record))
  }
  const cancelPending = () => {
    dropPending(pending)
    setPending([])
  }
  const submitPending = () => {
    addImages(pending)
    addToAlbum(album.id, pending.map((r) => r.id), me())
    announceUpload(album, pending)
    setNotice({ text: `Added ${countText(pending)} to ${album.name}` })
    setPending([])
  }

  // A photo's file: the one on this device, or its online copy where this
  // device only holds a small one.
  async function fileOf(image) {
    if (image.blob) return imageFile(image)
    const res = await fetchMedia(image.remote)
    if (!res.ok) throw new Error('A photo could not be downloaded')
    const base = (image.name ?? 'photo').replace(/\.[^.]+$/, '') || 'photo'
    return new File([await res.blob()], `${base}.jpg`, { type: 'image/jpeg' })
  }

  async function save(imageIds) {
    setBusy(true)
    setNotice({ busy: true, text: imageIds.length > 1 ? `Saving ${imageIds.length}` : 'Saving' })
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
      // Phones put it in the Downloads folder (Files app, or Downloads in the gallery).
      setNotice({ text: stills.length > 1 ? 'Saved as a zip in your Downloads folder' : 'Saved to your Downloads folder' })
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
  const canLinkViewed = !guest && !secret && canLink(viewed)
  const pinnedHere = pin?.album === album.id && pin?.image === viewing
  const seasonName = SEASONS.find((s) => s.id === season)?.name
  // The pin is the whole library's: everyone's front page follows it.
  const canPin = !guest && !secret && features.pins
  const togglePin = () =>
    (pinnedHere ? setPinned(null) : setPinned(album.id, viewing))
      .then(() =>
        setNotice({
          text: pinnedHere
            ? 'Unpinned. The newest album leads again, for everyone.'
            : `Pinned to everyone's front page${seasonName ? ` for ${seasonName}` : ''}`,
        }))
      .catch((e) => setNotice({ text: e.message }))
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
        const res = await fetchMedia(publicUrl(item.path))
        if (!res.ok) throw new Error('A photo could not be downloaded')
        const record = await importFile(new File([await res.blob()], item.name, { type: 'image/jpeg' }))
        addImages([record])
        addToAlbum(album.id, [record.id], item.by ?? 'A visitor')
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
  // Who the waiting photos are from, once each.
  const adders = [...new Map(added.filter((it) => it.by?.id).map((it) => [it.by.id, it.by])).values()]

  // The admin stops someone adding photos, or leaving notes, on every link.
  const block = (person, rights, done) =>
    setRights(person.id, rights)
      .then(() => setNotice({ text: done }))
      .catch((e) => setNotice({ text: e.message }))

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
          readOnly={limited}
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
        {!selecting && !limited && features.secret && (
          <button className={`icon-btn ${secret ? 'active' : ''}`} onClick={openPeople} aria-label="Who can see this album">
            <Icon name="lock" size={20} />
          </button>
        )}
        {photoIds.length > 0 && !selecting && !guest && !secret && (
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
        {!selecting && !limited && (
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete album">
            <Icon name="trash" size={20} />
          </button>
        )}
      </header>

      {secret && (
        <button className="secret-bar" onClick={limited ? undefined : openPeople} disabled={limited}>
          <Icon name="lock" size={14} />
          <span>
            Secret · {(album.members ?? []).map((id) => (id === myId ? 'you' : nameOf(id).split(' ')[0])).join(', ')}
          </span>
        </button>
      )}

      {ids.length === 0 && added.length === 0 ? (
        <div className="empty">
          <h2>An empty pool</h2>
          <p>Add photos and videos here for everyone to see.</p>
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
          {features.notes && !selecting && guest && album.note && <p className="album-note">{album.note}</p>}
          {features.notes && !selecting && !guest && (
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
              {!limited && (
                <button className="chip small sort-btn" onClick={() => setSorting(true)}>
                  <Icon name="sort" size={16} /> Sort
                </button>
              )}
            </div>
          )}
          {added.length > 0 && (
            <section className="visitor-box">
              <div className="row">
                <div>
                  <div className="label">{added.length} added through the link</div>
                  {adders.length > 0 && <div className="hint">by {adders.map((p) => p.name).join(', ')}</div>}
                </div>
                <button className="pill-btn" disabled={busy} onClick={keepAdded}>Keep in album</button>
              </div>
              {admin && adders.length > 0 && (
                <div className="chips">
                  {adders.map((p) => (
                    <button
                      key={p.id}
                      className="chip small"
                      onClick={() => block(p, { uploads: false }, `${p.name} can no longer add photos`)}
                    >
                      Stop {p.name.split(' ')[0]} adding
                    </button>
                  ))}
                </div>
              )}
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
                  {heartCount(id) > 0 && (
                    <span className="hearts"><Icon name="heart" size={13} /> {heartCount(id)}</span>
                  )}
                  {(addedBy[id] || noteCount(id) > 0) && (
                    <span className="tile-tags">
                      {addedBy[id] && <span className="by">{uploaderName(addedBy[id])}</span>}
                      {noteCount(id) > 0 && <span className="said"><Icon name="comment" size={13} /> {noteCount(id)}</span>}
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
              {!guest && !secret && (
                <button className="tool" disabled={!picked.some((id) => photoIds.includes(id))} onClick={linkPicked}>
                  <Icon name="link" />
                  <span>Share link</span>
                </button>
              )}
              <button className="tool" disabled={!picked.length || busy} onClick={() => save(picked)}>
                <Icon name="download" />
                <span>Save {picked.length || ''}</span>
              </button>
              {!limited && (
                <>
                  {/* Moving only makes sense with the whole album in view. */}
                  <button className="tool" disabled={!picked.length || picked.length === ids.length || onlyLiked} onClick={() => setMoving(true)}>
                    <Icon name="move" />
                    <span>Move</span>
                  </button>
                  <button className="tool danger" disabled={!picked.length} onClick={() => remove(picked)}>
                    <Icon name="trash" />
                    <span>Remove</span>
                  </button>
                </>
              )}
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
            {limited ? (
              <span className="topbar-spacer" />
            ) : (
              <button className="icon-btn" onClick={() => remove([viewing])} aria-label="Remove from album">
                <Icon name="trash" size={20} />
              </button>
            )}
          </header>
          <PhotoPager
            slides={shown.map((id) => ({ key: id, src: images[id].url, poster: images[id].previewUrl, video: isVideo(images[id]) }))}
            index={shown.indexOf(viewing)}
            onIndex={(i) => setViewing(shown[i])}
          />
          <div className="viewer-notes">
            {addedBy[viewing] && <p className="note centre">Added by {uploaderName(addedBy[viewing])}</p>}
            {features.social && (
              <div className="family-react">
                <ReactionRow reactions={reactedHere} me={myId} onPick={react} />
                {reactedHere.length > 0 && <span className="note">{reactedText(reactedHere, myId, firstOf)} reacted</span>}
              </div>
            )}
            {famNotes[viewing]?.length > 0 && (
              <ul className="comment-list family">
                {famNotes[viewing].map((c) => (
                  <li key={c.id}>
                    <Avatar person={personIn(people, c.user_id)} size={26} />
                    <p><b>{firstOf(c.user_id)}</b> {c.body}</p>
                    {(c.user_id === myId || admin) && (
                      <button className="icon-btn" onClick={() => dropComment(c)} aria-label="Delete this comment">
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {features.social && (
              <form className="comment-form" onSubmit={postComment}>
                <input
                  className="caption-input" value={saying} onChange={(e) => setSaying(e.target.value)}
                  placeholder="Add a comment" maxLength={1000} enterKeyHint="send" aria-label="Comment"
                />
              </form>
            )}
            {said.length > 0 && <p className="note">From the shared link</p>}
            {said.length > 0 && (
              <ul className="comment-list">
                {said.map((c) => (
                  <li key={c.id}>
                    <p><b>{c.author || 'A visitor'}</b> {c.body}</p>
                    {admin && c.user_id && (
                      <button
                        className="pill-btn"
                        onClick={() => block({ id: c.user_id }, { comments: false }, `${c.author || 'They'} can no longer leave notes`)}
                      >
                        Block
                      </button>
                    )}
                    {!guest && (
                      <button
                        className="icon-btn"
                        onClick={() => deleteComment(c.id).catch((e) => setNotice({ text: e.message }))}
                        aria-label="Delete this note"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {limited ? (
              captions[viewing] && <p className="caption">{captions[viewing]}</p>
            ) : (
              <input
                className="caption-input"
                value={captions[viewing] ?? ''}
                onChange={(e) => setCaption(album.id, viewing, e.target.value)}
                placeholder="Add a caption"
                maxLength={200}
                enterKeyHint="done"
                aria-label="Caption"
              />
            )}
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
            {/* Lead everyone's front page with this photo, for the season showing now. */}
            {canPin && (
              <button className="text-btn" onClick={togglePin}>
                {pinnedHere ? 'Unpin from the front page' : `Pin to the front page${seasonName ? ` for ${seasonName}` : ''}`}
              </button>
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

      <Sheet open={pending.length > 0} onClose={cancelPending} title={`Add to ${album.name}`} modal>
        <div className="pending-grid">
          {pending.map((r) => (
            <span key={r.id} className="pending-thumb">
              <img src={r.previewUrl} alt="" draggable={false} />
              {isVideo(r) && <span className="clip"><Icon name="play" size={12} /> {clock(r.duration)}</span>}
              <button onClick={() => unpick(r)} aria-label="Take this one off"><Icon name="close" size={14} /></button>
            </span>
          ))}
          <button className="pending-more" onClick={() => fileInput.current.click()} aria-label="Choose more">
            <Icon name="plus" size={22} />
          </button>
        </div>
        {secret && <p className="note">This album is secret: only its people will see these.</p>}
        <button className="primary block" onClick={submitPending}>
          Add {countText(pending)} to {album.name}
        </button>
      </Sheet>

      <Sheet open={choosingPeople} onClose={() => setChoosingPeople(false)} title="Who can see this album" modal>
        <div className="chips" role="radiogroup" aria-label="Who can see it">
          <button role="radio" aria-checked={!secretOn} className={`chip small ${secretOn ? '' : 'on'}`} onClick={() => setSecretOn(false)}>
            Everyone
          </button>
          <button role="radio" aria-checked={secretOn} className={`chip small ${secretOn ? 'on' : ''}`} onClick={() => setSecretOn(true)}>
            <Icon name="lock" size={14} /> Only these people
          </button>
        </div>
        {secretOn ? (
          <>
            <PeoplePicker people={people} value={chosen} onChange={setChosen} locked={admin ? [] : [myId]} placeholder="Add someone: type a name" />
            <p className="note">
              Only the people here can see this album, add to it and hear about it{admin ? '' : ", and Hugpix's admin can see it too"}.
              Secret albums can't have share links{share ? '; this one’s link stops working' : ''}.
            </p>
          </>
        ) : (
          <p className="note">Everyone in Hugpix can see this album.</p>
        )}
        <button className="primary block" onClick={savePeople}>Save</button>
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
          choosePhotos(files)
        }}
      />
    </div>
  )
}
