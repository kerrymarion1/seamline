import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import AlbumChooser from '../components/AlbumChooser'
import Avatar from '../components/Avatar'
import Camera from '../components/Camera'
import CropEditor from '../components/CropEditor'
import { GreetingPicker, greetingSeason, isGreeting, markPlayed, playGreeting, unplayed } from '../components/Greetings'
import LinkSheet from '../components/LinkSheet'
import Linkify from '../components/Linkify'
import PeoplePicker from '../components/PeoplePicker'
import PhotoShareSheet from '../components/PhotoShareSheet'
import PhotoPager from '../components/PhotoPager'
import PlaceSheet from '../components/PlaceSheet'
import { ReactionRow } from '../components/Reactions'
import {
  adoptVisitorItems, canLink, deleteComment, fetchMedia, findShare, me, progressText, publicUrl, refreshComments,
  refreshHearts, refreshShares, removeVisitorItem, setPinned, setRights, stopShare, useCloud, usePinned, visitorItems,
} from '../lib/cloud'
import Sheet from '../components/Sheet'
import TagSheet from '../components/TagSheet'
import { tagName } from '../lib/collections'
import { findDuplicates } from '../lib/dupes'
import { fetchSeen, markSeen, seenTime } from '../lib/seen'
import { celebrateAdded } from '../lib/feedback'
import { editPhoto } from '../lib/edit'
import { clock, countText, importFile, importMedia, isVideo } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { adderOf, personIn, usePeople } from '../lib/people'
import { nameOf as nameOfSpot, photoPlace, spotNames } from '../lib/places'
import { announceShared, announceUpload } from '../lib/push'
import { addPhotoComment, fetchAlbumSocial, removePhotoComment, setReaction, watchAlbumSocial } from '../lib/social'
import { syncNow } from '../lib/sync'
import { SEASONS, useActiveSeason } from '../lib/theme'
import { downloadFile, imageFile, saveToPhone } from '../lib/share'
import {
  addedAt, addImages, addToAlbum, deleteAlbum, isPersonTag, moveInAlbum, removeFromAlbum, renameAlbum, setAlbumNote, setAlbumPeople, setCaption,
  getState, setPhotoSpots, sortAlbum, useAlbum, useStore,
} from '../lib/store'

// Who added a photo and when, for under it: "Added by Kerry · today",
// "Added by Kerry · Oct 17", "Oct 17, 2024" from another year, or just
// "Added Oct 17" when who isn't known.
function addedText(by, t) {
  const d = new Date(t)
  const now = new Date()
  const day = !(t > Date.UTC(2020, 0) && t < Date.now() + 864e5) ? ''
    : d.toDateString() === now.toDateString() ? 'today'
    : d.toDateString() === new Date(Date.now() - 864e5).toDateString() ? 'yesterday'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
  if (by) return day ? `Added by ${by} · ${day}` : `Added by ${by}`
  return day && `Added ${day}`
}

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
  const [dupes, setDupes] = useState(new Map()) // which of those are already in an album, and which album
  // Who sees this album: everyone, or (secret) only the people chosen.
  const [choosingPeople, setChoosingPeople] = useState(false)
  const people = usePeople()
  const [secretOn, setSecretOn] = useState(false)
  const [chosen, setChosen] = useState([])

  // Hearts and comments from the family, live while the album is open.
  const [social, setSocial] = useState({ hearts: [], comments: [] })
  const [saying, setSaying] = useState('')
  // A comment or the caption being written, for one photo: { kind, photo }.
  const [writing, setWriting] = useState(null)
  const writingHere = writing?.photo === viewing ? writing.kind : null
  const [tagging, setTagging] = useState(false) // who is in the photo being looked at
  const [placing, setPlacing] = useState(null) // being put on the map: 'album', or the ids of some photos
  const [named, setNamed] = useState({}) // names found for photos' spots in an album this person can't change
  const [sharingPhoto, setSharingPhoto] = useState(false) // the share sheet for the photo being looked at
  const [copying, setCopying] = useState(null) // photos on their way into another album
  const [shooting, setShooting] = useState(false) // the in-app camera is open
  const [cropping, setCropping] = useState(null) // { busy, error } while turning or cropping the photo being looked at
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

  // Who has seen each photo: read with the album, and noted for me once a
  // photo has been open for a second.
  const [views, setViews] = useState([]) // [{ photo, user_id, first_seen, last_seen }]
  const [seenList, setSeenList] = useState(false)
  useEffect(() => {
    if (!features.seen) return
    let live = true
    const load = () => fetchSeen(albumId).then((rows) => live && setViews(rows)).catch(() => {})
    load()
    const t = setInterval(() => !document.hidden && load(), 30000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [albumId, features.seen])
  useEffect(() => {
    if (!viewing || !features.seen) return
    const t = setTimeout(() => {
      markSeen(albumId, viewing)
        .then((row) => row && setViews((rows) => [...rows.filter((r) => !(r.photo === row.photo && r.user_id === row.user_id)), row]))
        .catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
  }, [viewing, albumId, features.seen])

  // Seasonal greetings given as reactions (components/Greetings.jsx): each
  // plays by itself once, the first time the photo is open on this device.
  const [greeting, setGreeting] = useState(false) // the season's greetings, to react with
  useEffect(() => {
    if (!viewing) return
    const keyOf = (h) => `${albumId}:${h.photo}:${h.user_id}:${h.emoji}`
    const theirs = social.hearts.filter((h) => h.photo === viewing && h.user_id !== session?.user.id && isGreeting(h.emoji))
    const due = theirs.filter((h) => unplayed([keyOf(h)]).length)
    if (!due.length) return
    const t = setTimeout(() => {
      markPlayed(theirs.map(keyOf))
      playGreeting(due.at(-1).emoji)
    }, 700)
    return () => clearTimeout(t)
  }, [viewing, social.hearts, albumId, session])

  // A photo's own spot, read from the photo, has no name yet: ask where that
  // is, once, and keep it with the album when this person may change it.
  useEffect(() => {
    const spot = album?.spots?.[viewing]
    if (!viewing || !spot || spot[2] || named[viewing]) return
    let live = true
    nameOfSpot(spot[0], spot[1])
      .then((name) => {
        if (!live || !name) return
        if (limited) setNamed((n) => ({ ...n, [viewing]: name }))
        else setPhotoSpots(album.id, { [viewing]: [spot[0], spot[1], name] })
      })
      .catch(() => {})
    return () => {
      live = false
    }
    // `named` is only read here, never a reason to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, album?.spots, album?.id, limited])

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
    // Longer while there is something to undo.
    const t = setTimeout(() => setNotice(null), notice.undo ? 6000 : 2600)
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
  // Whoever added it, by the name they go by now (the admin may have renamed them).
  const addedLine = viewed ? addedText(adderOf(people, addedBy[viewing])?.name ?? '', addedAt(viewing)) : ''
  const tagsHere = album.tags?.[viewing] ?? []
  const placeHere = viewed ? photoPlace(album, viewing) : null // where it sits on the map, if anywhere
  // Who else has seen it, the first to see it first.
  const seenHere = views
    .filter((r) => r.photo === viewing && r.user_id !== session?.user.id)
    .sort((a, b) => Date.parse(a.first_seen) - Date.parse(b.first_seen))
  const said = comments[viewing] ?? []
  // A secret album never gets a link or the front-page pin: both would show
  // its photos to everyone.
  const secret = !!album.secret
  const myId = session?.user.id
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Someone'
  // A link to the whole album: never for a secret one.
  const canShareLink = photoIds.length > 0 && !guest && !secret
  const openPeople = () => {
    setSecretOn(secret)
    setChosen(album.members ?? (myId ? [myId] : []))
    setChoosingPeople(true)
  }
  const savePeople = () => {
    // You stay in it yourself; only the admin can be outside a secret album.
    const members = secretOn ? [...new Set([...(admin || !myId ? [] : [myId]), ...chosen])] : null
    // People new to an album that was already secret hear it was shared with
    // them. (Going secret shares it with no one new: they could all see it.)
    const added = secret && members ? members.filter((id) => !(album.members ?? []).includes(id) && id !== myId) : []
    setAlbumPeople(album.id, members, myId)
    if (added.length) announceShared(album, added)
    // A link would show it to anyone: going secret switches it off.
    if (members && share) stopShare(share).catch(() => {})
    setChoosingPeople(false)
    setNotice({
      text: added.length
        ? `Shared with ${added.map((id) => nameOf(id).split(' ')[0]).join(', ')}`
        : members ? `Secret: only ${members.length === 1 ? 'you' : `these ${members.length} people`} can see it` : 'Everyone can see this album now',
    })
  }

  // The family's reactions and comments on the photo being looked at.
  const reactedHere = social.hearts.filter((h) => h.photo === viewing)
  // The season's greetings, while one is on; given ones still show and play after it.
  const greetSeason = features.greetings ? greetingSeason(season, !!features.moreGreetings) : null
  const myReaction = reactedHere.find((h) => h.user_id === session?.user.id)?.emoji ?? null
  const greetCounts = {}
  for (const h of reactedHere) if (isGreeting(h.emoji)) greetCounts[h.emoji] = (greetCounts[h.emoji] ?? 0) + 1
  const onGreet = features.greetings
    ? () => (greetSeason ? setGreeting(true) : playGreeting(reactedHere.filter((h) => isGreeting(h.emoji)).at(-1)?.emoji))
    : null
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
    // Then, while they wait, a look for any already in an album.
    const { albums, images: here } = getState()
    findDuplicates(records, albums, here)
      .then((found) => found.size && setDupes((d) => new Map([...d, ...found])))
      .catch(() => {})
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
    setDupes(new Map())
  }
  const pendingDupes = pending.filter((r) => dupes.has(r.id))
  const leaveOutDupes = () => {
    dropPending(pendingDupes)
    setPending((p) => p.filter((r) => !dupes.has(r.id)))
  }
  // In they go, with the season's sound, pulse and burst, and a moment to undo.
  const submitPending = () => {
    const ids = pending.map((r) => r.id)
    addImages(pending)
    addToAlbum(album.id, ids, me())
    announceUpload(album, pending)
    celebrateAdded(pending.length)
    setNotice({
      text: `Added ${countText(pending)} to ${album.name}`,
      undo: () => {
        removeFromAlbum(album.id, ids)
        setNotice({ text: 'Taken back out' })
      },
    })
    setPending([])
    setDupes(new Map())
  }

  // Taken with the in-app camera: straight in, no review sheet. Where the
  // phone was goes with it, unless the file already says.
  const sendFromCamera = async (file, spot) => {
    const record = await importMedia(file)
    if (spot && !record.gps) record.gps = spot
    addImages([record])
    addToAlbum(album.id, [record.id], me())
    announceUpload(album, [record])
    celebrateAdded(1)
    setShooting(false)
    setNotice({
      text: `Added to ${album.name}`,
      undo: () => {
        removeFromAlbum(album.id, [record.id])
        setNotice({ text: 'Taken back out' })
      },
    })
  }

  // The same photos, in one more album: nothing is uploaded again. Whoever
  // can see that album hears about them, and there's a moment to undo.
  const copyTo = (target) => {
    const fresh = copying.filter((id) => !target.imageIds.includes(id))
    setCopying(null)
    stopSelecting()
    if (!fresh.length) {
      setNotice({ text: `Already in ${target.name}` })
      return
    }
    addToAlbum(target.id, fresh, me())
    announceUpload(target, fresh.map((id) => images[id]))
    celebrateAdded(fresh.length)
    setNotice({
      text: `Added ${countText(fresh.map((id) => images[id]))} to ${target.name}`,
      undo: () => {
        removeFromAlbum(target.id, fresh)
        setNotice({ text: 'Taken back out' })
      },
    })
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
      place: photoPlace(album, viewing),
    })
  // Turning and cropping changes the photo for everyone; a guest can't.
  const canEditViewed = !guest && !!viewed && !isVideo(viewed)
  const saveCrop = async (change) => {
    setCropping({ busy: true, error: null })
    try {
      await editPhoto(album.id, viewing, change)
      setCropping(null)
      setNotice({ text: 'Photo saved' })
    } catch (e) {
      setCropping({ busy: false, error: e.message || 'Could not save the photo' })
    }
  }
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
      place: album.place ?? null,
      places: spotNames(album),
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
        {/* Share: who is in it (anyone may be added at any time), or a link. */}
        {!selecting && (canShareLink || (!limited && features.secret)) && (
          <button className={`icon-btn ${secret ? 'active' : ''}`} onClick={openPeople} aria-label="Share this album">
            <Icon name="share" size={20} />
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
          <span className="secret-faces">
            {(album.members ?? []).slice(0, 5).map((id) => <Avatar key={id} person={personIn(people, id) ?? { id, name: nameOf(id) }} size={20} zoom={false} />)}
          </span>
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
          <button className="secondary" onClick={() => setShooting(true)}>
            <Icon name="camera" size={20} /> Take a photo or video
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
          {!selecting && ids.length > 0 && (
            <div className="album-bar">
              {liked.length > 0 && (
                <>
                  <button className={`chip small ${onlyLiked ? '' : 'on'}`} onClick={() => setFavourites(false)}>All {ids.length}</button>
                  <button className={`chip small ${onlyLiked ? 'on' : ''}`} onClick={() => setFavourites(true)}>
                    <Icon name="heart" size={14} /> Favourites {liked.length}
                  </button>
                </>
              )}
              {/* Where it was, for the map. */}
              {(!limited || album.place) && (
                <button
                  className={`chip small place-btn ${album.place ? 'set' : ''}`}
                  onClick={() => (limited ? navigate('/map') : setPlacing('album'))}
                >
                  <Icon name="pin" size={15} /> <span>{album.place?.name ?? 'Add place'}</span>
                </button>
              )}
              {!limited && ids.length > 1 && (
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
                      {addedBy[id] && (
                        <span className="by">
                          <Avatar person={adderOf(people, addedBy[id])} size={16} />
                          <span>{adderOf(people, addedBy[id])?.name}</span>
                        </span>
                      )}
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
        <div className="fab-row">
          <button className="primary" onClick={() => fileInput.current.click()}>
            <Icon name="plus" size={20} /> Add photos or videos
          </button>
          <button className="primary fab-camera" onClick={() => setShooting(true)} aria-label="Take a photo or video">
            <Icon name="camera" size={22} />
          </button>
        </div>
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
              <button className="tool" disabled={!picked.length} onClick={() => setCopying(picked)}>
                <Icon name="photos" />
                <span>To album</span>
              </button>
              {!limited && (
                <>
                  <button className="tool" disabled={!picked.length} onClick={() => setPlacing(picked)}>
                    <Icon name="pin" />
                    <span>Place</span>
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
            <span className="viewer-tools">
              {canEditViewed && (
                <button className="icon-btn" onClick={() => setCropping({ busy: false, error: null })} aria-label="Crop and turn">
                  <Icon name="crop" size={20} />
                </button>
              )}
              <button className="icon-btn" disabled={busy} onClick={() => save([viewing])} aria-label="Save to phone">
                <Icon name="download" size={20} />
              </button>
              {!limited && (
                <button className="icon-btn" onClick={() => remove([viewing])} aria-label="Remove from album">
                  <Icon name="trash" size={20} />
                </button>
              )}
            </span>
          </header>
          <PhotoPager
            slides={shown.map((id) => ({ key: id, src: images[id].url, poster: images[id].previewUrl, video: isVideo(images[id]) }))}
            index={shown.indexOf(viewing)}
            onIndex={(i) => setViewing(shown[i])}
          />
          <div className="viewer-notes">
            {addedLine && (
              <p className="note centre added-line">
                {addedBy[viewing] && <Avatar person={adderOf(people, addedBy[viewing])} size={20} />}
                {addedLine}
              </p>
            )}
            {/* Where it was taken: a tap shows it on the map. */}
            {placeHere && (
              <button className="place-line" onClick={() => navigate(`/map?at=${placeHere.lat},${placeHere.lng}`)}>
                <Icon name="pin" size={14} /> <span>{placeHere.name ?? named[viewing] ?? 'On the map'}</span>
              </button>
            )}
            {/* The caption, when there is one: a tap edits it. */}
            {captions[viewing] && writingHere !== 'caption' && (
              limited ? (
                <p className="caption">{captions[viewing]}</p>
              ) : (
                <button className="caption" onClick={() => setWriting({ kind: 'caption', photo: viewing })}>{captions[viewing]}</button>
              )
            )}
            {/* Who is in it: a tap shows every photo they're in. */}
            {tagsHere.length > 0 && (
              <div className="viewer-tags">
                {tagsHere.map((t) => (
                  <button key={t} className="tag-chip" onClick={() => navigate(`/people/${encodeURIComponent(t)}`)}>
                    <Avatar person={isPersonTag(t) ? personIn(people, t) : { id: t, name: t }} size={20} />
                    {tagName(t, people).split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            {features.social && (
              <div className="family-react">
                <ReactionRow reactions={reactedHere} me={myId} onPick={react} season={greetSeason} onGreet={onGreet} />
              </div>
            )}
            {famNotes[viewing]?.length > 0 && (
              <ul className="comment-list family">
                {famNotes[viewing].map((c) => (
                  <li key={c.id}>
                    <Avatar person={personIn(people, c.user_id)} size={26} />
                    <p><b>{firstOf(c.user_id)}</b> <Linkify text={c.body} /></p>
                    {(c.user_id === myId || admin) && (
                      <button className="icon-btn" onClick={() => dropComment(c)} aria-label="Delete this comment">
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {seenHere.length > 0 && (
              <button className="seen-by" onClick={() => setSeenList(true)}>
                <span className="seen-faces">
                  {seenHere.slice(0, 4).map((r) => (
                    <Avatar key={r.user_id} person={personIn(people, r.user_id) ?? { id: r.user_id, name: nameOf(r.user_id) }} size={20} zoom={false} />
                  ))}
                </span>
                <span>
                  Seen by {seenHere.length <= 2
                    ? seenHere.map((r) => nameOf(r.user_id).split(' ')[0]).join(' and ')
                    : `${seenHere.slice(0, 2).map((r) => nameOf(r.user_id).split(' ')[0]).join(', ')} and ${seenHere.length - 2} more`}
                </span>
              </button>
            )}
            {/* Writing a comment or a caption: small buttons until tapped, so the photo keeps the room. */}
            {writingHere === 'comment' ? (
              <form className="comment-form" onSubmit={postComment}>
                <input
                  className="caption-input" value={saying} onChange={(e) => setSaying(e.target.value)}
                  onBlur={() => !saying.trim() && setWriting(null)}
                  placeholder="Add a comment" maxLength={1000} enterKeyHint="send" aria-label="Comment" autoFocus
                />
              </form>
            ) : writingHere === 'caption' ? (
              <input
                className="caption-input"
                value={captions[viewing] ?? ''}
                onChange={(e) => setCaption(album.id, viewing, e.target.value)}
                onBlur={() => setWriting(null)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="Add a caption"
                maxLength={200}
                enterKeyHint="done"
                aria-label="Caption"
                autoFocus
              />
            ) : (
              (
                <div className="viewer-write">
                  {features.social && (
                    <button className="chip small" onClick={() => setWriting({ kind: 'comment', photo: viewing })}>Comment</button>
                  )}
                  {!limited && !captions[viewing] && (
                    <button className="chip small" onClick={() => setWriting({ kind: 'caption', photo: viewing })}>Caption</button>
                  )}
                  {!limited && <button className="chip small" onClick={() => setTagging(true)}>{tagsHere.length ? 'Tags' : 'Tag'}</button>}
                  {!limited && <button className="chip small" onClick={() => setPlacing([viewing])}>Place</button>}
                  <button className="chip small share" onClick={() => setSharingPhoto(true)}>
                    <Icon name="share" size={14} /> Share
                  </button>
                </div>
              )
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
          </div>
          {/* Lead everyone's front page with this photo, for the season showing now. */}
          {canPin && (
            <footer className="preview-actions">
              <button className="text-btn" onClick={togglePin}>
                {pinnedHere ? 'Unpin from the front page' : `Pin to the front page${seasonName ? ` for ${seasonName}` : ''}`}
              </button>
            </footer>
          )}
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice.busy && <i className="spinner" />}
          {notice.text}
          {notice.undo && <button className="toast-undo" onClick={notice.undo}>Undo</button>}
        </div>
      )}

      <LinkSheet target={linking} onClose={() => setLinking(null)} />

      {shooting && <Camera albumName={album.name} onSend={sendFromCamera} onClose={() => setShooting(false)} />}

      {cropping && viewed && (
        <CropEditor
          key={viewing}
          image={viewed}
          busy={cropping.busy}
          error={cropping.error}
          onCancel={() => setCropping(null)}
          onSave={saveCrop}
        />
      )}

      <PhotoShareSheet
        key={sharingPhoto ? viewing : 'closed'}
        open={sharingPhoto && !!viewed}
        onClose={() => setSharingPhoto(false)}
        image={viewed}
        secret={secret}
        canSend={!!viewed && !isVideo(viewed)}
        canLinkIt={!guest && !!viewed && canLink(viewed)}
        onLink={() => {
          setSharingPhoto(false)
          linkPhoto()
        }}
        onToAlbum={() => {
          setSharingPhoto(false)
          setCopying([viewing])
        }}
        fileOf={fileOf}
        onDone={(text) => setNotice({ text })}
      />

      <AlbumChooser
        open={!!copying}
        onClose={() => setCopying(null)}
        title={copying?.length > 1 ? `Add ${copying.length} to another album` : 'Add to another album'}
        note={secret ? 'From a secret album: whoever can see the album you pick will see these too.' : null}
        exclude={album.id}
        onPick={copyTo}
      />

      <Sheet open={seenList && seenHere.length > 0} onClose={() => setSeenList(false)} title="Seen by" modal>
        <ul className="seen-list">
          {seenHere.map((r) => (
            <li key={r.user_id}>
              <Avatar person={personIn(people, r.user_id) ?? { id: r.user_id, name: nameOf(r.user_id) }} size={36} />
              <span className="seen-who">
                <b>{nameOf(r.user_id)}</b>
                <small>
                  First saw it {seenTime(r.first_seen)}
                  {Date.parse(r.last_seen) - Date.parse(r.first_seen) > 60000 && <>, last {seenTime(r.last_seen)}</>}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </Sheet>

      {greetSeason && (
        <GreetingPicker
          season={greetSeason}
          more={!!features.moreGreetings}
          open={greeting && !!viewed}
          onClose={() => setGreeting(false)}
          note="Your reaction to this photo. Whoever added it hears about it, and everyone who opens it sees it play."
          counts={greetCounts}
          mine={myReaction}
          onPick={(kind) => {
            setGreeting(false)
            if (myReaction === kind) {
              react(null)
            } else {
              react(kind)
              playGreeting(kind)
            }
          }}
        />
      )}

      <PlaceSheet
        key={placing ? (Array.isArray(placing) ? placing.join() : 'album') : 'closed'}
        open={!!placing}
        album={album}
        photoIds={Array.isArray(placing) ? placing : null}
        onClose={(saved) => {
          // Photos placed from Select are done with.
          if (saved && Array.isArray(placing) && selecting) stopSelecting()
          setPlacing(null)
        }}
      />

      <TagSheet key={tagging ? viewing : 'closed'} open={tagging && !!viewed} album={album} photoId={viewing} onClose={() => setTagging(false)} />

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
            <span key={r.id} className={`pending-thumb ${dupes.has(r.id) ? 'dupe' : ''}`}>
              <img src={r.previewUrl} alt="" draggable={false} />
              {dupes.has(r.id) && <span className="pending-dupe">{dupes.get(r.id).id === album.id ? 'Already here' : `In ${dupes.get(r.id).name}`}</span>}
              {isVideo(r) && <span className="clip"><Icon name="play" size={12} /> {clock(r.duration)}</span>}
              <button onClick={() => unpick(r)} aria-label="Take this one off"><Icon name="close" size={14} /></button>
            </span>
          ))}
          <button className="pending-more" onClick={() => fileInput.current.click()} aria-label="Choose more">
            <Icon name="plus" size={22} />
          </button>
        </div>
        {pendingDupes.length > 0 && (
          <div className="dupe-warn">
            <p>
              {pendingDupes.length === pending.length
                ? `${pending.length === 1 ? 'This is' : 'These are all'} already in your albums.`
                : `${pendingDupes.length} of these ${pendingDupes.length === 1 ? 'is' : 'are'} already in your albums.`}
            </p>
            {pendingDupes.length < pending.length && (
              <button className="pill-btn" onClick={leaveOutDupes}>Leave {pendingDupes.length === 1 ? 'it' : 'them'} out</button>
            )}
          </div>
        )}
        {secret && <p className="note">This album is secret: only its people will see these.</p>}
        <button className="primary block" onClick={submitPending}>
          Add {countText(pending)} to {album.name}
        </button>
      </Sheet>

      <Sheet open={choosingPeople} onClose={() => setChoosingPeople(false)} title="Share this album" modal>
        {!limited && features.secret && (
          <>
        <div className="label">Who can see it</div>
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
              Anyone you add gets a notification. Secret albums have no album link{share ? ', so this one’s link stops working' : ''};
              single photos can still be shared from the photo itself.
            </p>
          </>
        ) : (
          <p className="note">Everyone in Hugpix can see this album.</p>
        )}
        <button className="primary block" onClick={savePeople}>Save</button>
          </>
        )}
        {canShareLink && !secretOn && (
          <div className="share-link-part">
            <div className="label">Share a link</div>
            <button
              className="secondary block"
              onClick={() => {
                setChoosingPeople(false)
                setLinking({
                  kind: 'album', sourceId: album.id, title: album.name, imageIds: photoIds, captions, note: album.note ?? '',
                  place: album.place ?? null, places: spotNames(album),
                })
              }}
            >
              <Icon name="link" size={18} /> Link to this album
            </button>
            <p className="note">Anyone with the link can see the photos, without signing in.</p>
          </div>
        )}
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
