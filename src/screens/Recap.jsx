import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Avatar from '../components/Avatar'
import CardMaker from '../components/CardMaker'
import Icon from '../components/Icon'
import { ReactionFace } from '../components/ReactionFaces'
import { holidayById, recapNow } from '../lib/holidays'
import { isVideo } from '../lib/images'
import { adderOf, usePeople } from '../lib/people'
import { fetchAlbumSocial } from '../lib/social'
import { addedAt, useStore } from '../lib/store'

// The story of an album (Hugpix 2): made for a holiday's album the Sunday
// after it (lib/holidays.js recapNow), and open for any album with photos.
// First a cover: the name in the holiday's lettering, a few photos, the most
// loved one and who added to it. Then the photos one at a time, the oldest
// first, the most loved last; tap the right side for the next, the left for
// the one before, hold to stop for a moment.

const EACH = 4000 // how long each photo shows
const MOST = 30 // a story of at most this many

const first = (name) => (name ?? '').split(' ')[0]
const whenOf = (id) => new Date(addedAt(id)).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

export default function Recap({ albumId }) {
  const album = useStore((s) => s.albums.find((a) => a.id === albumId))
  const images = useStore((s) => s.images)
  const people = usePeople()
  const [counts, setCounts] = useState(null) // { [photo]: how many reactions }
  const [at, setAt] = useState(null) // the photo showing, while the story plays
  const [watched, setWatched] = useState(false)
  const [carding, setCarding] = useState(false)
  const bar = useRef(null)
  const held = useRef(false)
  const down = useRef(0)

  useEffect(() => {
    let live = true
    fetchAlbumSocial(albumId)
      .then(({ hearts }) => {
        const n = {}
        for (const r of hearts) n[r.photo] = (n[r.photo] ?? 0) + 1
        if (live) setCounts(n)
      })
      .catch(() => live && setCounts({}))
    return () => {
      live = false
    }
  }, [albumId])

  const photos = (album?.imageIds ?? []).filter((id) => images[id] && !isVideo(images[id]))
  const n = (id) => counts?.[id] ?? 0
  // The most loved: the most reactions, the earliest if it's a tie; none until someone reacts.
  const loved = photos.reduce((best, id) => (n(id) > (best ? n(best) : 0) || (best && n(id) === n(best) && addedAt(id) < addedAt(best)) ? id : best), null)
  // The story: the best-liked if there are many, the oldest first, the most loved kept for last.
  const picked = photos.length > MOST ? [...photos].sort((a, b) => n(b) - n(a)).slice(0, MOST) : photos
  const frames = [...picked].sort((a, b) => addedAt(a) - addedAt(b)).filter((id) => id !== loved)
  if (loved) frames.push(loved)

  const hol = album?.holiday ? holidayById(album.holiday.id) : null
  const recap = recapNow()
  const sundayAfter = !!hol && recap?.id === hol.id && recap.year === album.holiday.year
  const adders = [...new Map(photos.map((id) => adderOf(people, album.addedBy?.[id])).filter(Boolean).map((p) => [p.id ?? p.name, p])).values()]
  const close = () => (window.history.length > 1 ? window.history.back() : navigate(`/album/${albumId}`))

  // Playing: the bar fills, then the next photo (after the last, back to the cover).
  useEffect(() => {
    if (at == null) return
    let raf
    let last = performance.now()
    let done = 0
    const tick = (now) => {
      if (!held.current && !document.hidden) done += now - last
      last = now
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, done / EACH)})`
      if (done >= EACH) {
        if (at + 1 < frames.length) setAt(at + 1)
        else {
          setAt(null)
          setWatched(true)
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // The next one, ready before it's needed.
    const next = images[frames[at + 1]]
    if (next) new Image().src = next.url ?? next.previewUrl
    return () => cancelAnimationFrame(raf)
    // `frames` follows from the album and its reactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])

  useEffect(() => {
    if (at == null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setAt(null)
      else if (e.key === 'ArrowRight') {
        setAt((i) => (i != null && i + 1 < frames.length ? i + 1 : null))
        if (at + 1 >= frames.length) setWatched(true)
      } else if (e.key === 'ArrowLeft') setAt((i) => (i == null ? null : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, frames.length])

  if (!album) {
    return (
      <div className="screen recap">
        <header className="recap-top">
          <div><h1 className="recap-title">This story isn't here</h1><p>The album may have been deleted.</p></div>
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Close"><Icon name="close" /></button>
        </header>
      </div>
    )
  }

  const title = <span style={hol ? { font: hol.font } : null}>{album.name}</span>
  const pic = (id) => images[id]?.previewUrl
  const fanned = [frames[0], frames[Math.floor(frames.length / 2)], loved ?? frames.at(-1)].filter((id, i, all) => id && all.indexOf(id) === i)
  const who = adders.length
    ? `Photos from ${adders.slice(0, 2).map((p) => first(p.name)).join(adders.length === 2 ? ' and ' : ', ')}${adders.length > 2 ? ` and ${adders.length - 2} more` : ''}`
    : null

  if (at != null) {
    const id = frames[at]
    const image = images[id]
    const by = adderOf(people, album.addedBy?.[id])
    const tap = (e) => {
      if (Date.now() - down.current > 300) return // held: it was a pause
      const { left, width } = e.currentTarget.getBoundingClientRect()
      if (e.clientX - left < width / 3) setAt(Math.max(0, at - 1))
      else if (at + 1 < frames.length) setAt(at + 1)
      else {
        setAt(null)
        setWatched(true)
      }
    }
    return (
      <div className="recap-play" role="dialog" aria-label={album.name}>
        <img className="recap-blur" src={image.previewUrl} alt="" aria-hidden="true" />
        <img
          key={id}
          className="recap-photo"
          src={image.url ?? image.previewUrl}
          alt=""
          draggable={false}
          onPointerDown={() => {
            down.current = Date.now()
            held.current = true
          }}
          onPointerUp={(e) => {
            held.current = false
            tap(e)
          }}
          onPointerCancel={() => (held.current = false)}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="recap-bars" aria-hidden="true">
          {frames.map((f, i) => (
            <span key={f}><i ref={i === at ? bar : null} style={{ transform: `scaleX(${i < at ? 1 : 0})` }} /></span>
          ))}
        </div>
        <button className="icon-btn recap-close" onClick={() => setAt(null)} aria-label="Stop the story"><Icon name="close" /></button>
        <div className="recap-caption">
          {id === loved && (
            <span className="recap-loved">
              <ReactionFace kind="love" season={hol?.id ?? 'everyday'} size={36} />
              Most loved · {n(id)}
            </span>
          )}
          {by && (
            <span className="recap-by">
              <Avatar person={by} size={26} zoom={false} />
              {first(by.name)} · {whenOf(id)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen recap" style={hol ? { '--recap-ink': hol.ink } : null}>
      <header className="recap-top">
        <div>
          <small>{sundayAfter ? 'The Sunday after' : 'The story'}</small>
          <h1 className="recap-title">{title}</h1>
          <p>{frames.length ? `${sundayAfter ? "Everyone's photos from the week" : `${frames.length} photos`}, in one story.` : 'No photos in it yet.'}</p>
        </div>
        <button className="icon-btn" onClick={close} aria-label="Close"><Icon name="close" /></button>
      </header>

      {fanned.length > 0 && (
        <div className="recap-fan" aria-hidden="true">
          {fanned.map((id) => <span key={id}><img src={pic(id)} alt="" draggable={false} /></span>)}
          {hol && <span className="recap-fan-face"><ReactionFace kind="dance" season={hol.id} size={84} /></span>}
        </div>
      )}

      {loved && (
        <button className="recap-most" onClick={() => setAt(frames.length - 1)}>
          <img src={pic(loved)} alt="" draggable={false} />
          <span>
            <b>Most loved</b>
            <small>{adderOf(people, album.addedBy?.[loved]) ? `Added by ${first(adderOf(people, album.addedBy?.[loved]).name)}` : whenOf(loved)}</small>
          </span>
          <span className="recap-most-n">
            <ReactionFace kind="love" season={hol?.id ?? 'everyday'} size={40} still />
            <i>{n(loved)}</i>
          </span>
        </button>
      )}

      {who && (
        <p className="recap-who">
          <span aria-hidden="true">{adders.slice(0, 4).map((p) => <Avatar key={p.id ?? p.name} person={p} size={28} zoom={false} />)}</span>
          {who}
        </p>
      )}

      <div className="recap-actions">
        <button className="primary block" disabled={!frames.length || counts == null} onClick={() => setAt(0)}>
          <Icon name="play" size={18} /> {counts == null ? 'Getting it ready…' : watched ? 'Watch again' : 'Play the story'}
        </button>
        {frames.length > 0 && <button className="secondary block" onClick={() => setCarding(true)}>Make a card{loved ? ' of the most loved' : ''}</button>}
        <button className="text-btn" onClick={() => navigate(`/album/${album.id}`)}>Open the album</button>
      </div>

      <CardMaker
        open={carding && !!images[loved ?? frames[0]]}
        image={images[loved ?? frames[0]]}
        holiday={hol?.id}
        onClose={() => setCarding(false)}
      />
    </div>
  )
}

