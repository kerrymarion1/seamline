import { useEffect, useSyncExternalStore } from 'react'
import { navigate } from '../App'
import Avatar from './Avatar'
import { ReactionFace } from './ReactionFaces'
import { useCloud } from '../lib/cloud'
import { refreshFamilyDays, useFamilyDays } from '../lib/familyDays'
import {
  ADVENT, adventDay, adventDone, countdown, familyDayAlbumId, familyDayGreeting, familyDayTitle, familyDayToday, holidayAlbum, holidayAlbumId, holidayName,
  holidayNow, holidayOn, holidayYears, recapNow, today,
} from '../lib/holidays'
import { personIn, usePeople } from '../lib/people'
import { isVideo } from '../lib/images'
import { addedAt, createFamilyDayAlbum, createHolidayAlbum, useStore } from '../lib/store'
import { useHolidaysOff } from '../lib/theme'
import { getSyncStatus, knownOnServer, onSyncStatus } from '../lib/sync'
import { useV2, useV2Everyone } from '../lib/v2'

// The holiday on the front page, while it's its month (lib/holidays.js): how
// long to go, the family's album for it this year (made here the first time
// anyone opens Hugpix in its month, unless one was marked as it, or it was
// deleted), and the same holiday's albums from the years before; the week
// after a holiday, its story (screens/Recap.jsx) comes first. Part of
// Hugpix 2 (lib/v2.js): the album is made by itself only once that is on for
// everyone; while the admin tries it alone, the card offers to make it.
// A holiday someone has turned off for themselves (screens/Holidays.jsx)
// doesn't show; a family day does, on the day, before anything else.
export default function HolidayHome({ className = '' }) {
  const v2 = useV2()
  const story = useRecapAlbum()
  const everyone = useV2Everyone()
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { session, canSync, guest, features } = useCloud()
  const synced = useSyncExternalStore(onSyncStatus, () => getSyncStatus().lastSync)
  useHolidaysOff()
  const now = holidayNow()
  const h = now && holidayOn(now.id) ? now : null
  const days = useFamilyDays().filter((d) => familyDayToday(d))

  useEffect(() => {
    if (v2 && session && features.familyDays) refreshFamilyDays().catch(() => {})
  }, [v2, session?.user.id, features.familyDays])
  const found = h ? holidayAlbum(albums, h.id, h.year) : null
  // Localhost works on the family's real library: there it only shows what
  // would be made, and makes nothing.
  const preview = (import.meta.env.DEV || !everyone) && h && !found ? { id: holidayAlbumId(h.id, h.year), name: holidayName(h), imageIds: [], preview: true } : null
  const album = found ?? preview

  // Made once this phone has heard from the server, so it isn't made twice
  // (or again after someone deleted it). A guest doesn't make albums for everyone.
  useEffect(() => {
    if (!h || found || !everyone || import.meta.env.DEV || !session || !canSync || guest || !synced) return
    const id = holidayAlbumId(h.id, h.year)
    if (!knownOnServer('album', id)) createHolidayAlbum(h, id, session.user.id)
    // The holiday and year stand for `h`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h?.id, h?.year, !!found, everyone, session?.user.id, canSync, guest, synced])

  if (!v2) return null
  if (!h && !story) return days.length ? <section className={`holiday-home ${className}`}><FamilyDays days={days} /></section> : null
  // Trying Hugpix 2 alone: the album is made when asked for (on localhost, never).
  const makeIt = album?.preview && !import.meta.env.DEV && session && canSync && !guest
  const go = () => {
    if (makeIt) {
      createHolidayAlbum(h, album.id, session.user.id)
      navigate(`/album/${album.id}`)
    } else if (!album.preview) navigate(`/album/${album.id}`)
  }
  const left = h && countdown(h)
  const before = h ? holidayYears(albums, h.id).filter((a) => a.holiday.year < h.year).slice(0, 6) : []
  const picOf = (a) => {
    const id = a.cover && images[a.cover] ? a.cover : a.imageIds.find((i) => images[i])
    return id ? images[id].previewUrl : null
  }
  return (
    <section className={`holiday-home ${className}`} aria-label={h?.name ?? story.holiday.name}>
      {days.length > 0 && <FamilyDays days={days} />}
      {story && (
        <button className="holiday-card recap-card" onClick={() => navigate(`/recap/${story.album.id}`)}>
          <span className="recap-card-pics" aria-hidden="true">
            {story.pics.slice(0, 2).map((id) => <img key={id} src={images[id].previewUrl} alt="" draggable={false} />)}
          </span>
          <span className="holiday-card-text">
            <small>The Sunday after</small>
            <b>{story.album.name}</b>
            <span>The story of the week, {story.pics.length === 1 ? 'one photo' : `${story.pics.length} photos`}.</span>
          </span>
          <span className="holiday-card-go">Play</span>
        </button>
      )}
      {h && album && (
        <button className="holiday-card" onClick={go}>
          <span className="holiday-card-face"><ReactionFace kind="wave" season={h.id} size={64} /></span>
          <span className="holiday-card-text">
            {left && <small>{left}</small>}
            <b>{album.name || holidayName(h)}</b>
            <span>{album.imageIds.length ? `The family's ${h.name} album. Everyone adds to it.` : `This year's family album. Be the first to add.`}</span>
          </span>
          <span className="holiday-card-go">{makeIt ? 'Make it' : 'Add yours'}</span>
        </button>
      )}
      {h?.id === 'christmas' && album && <Advent album={album} year={h.year} onAdd={go} />}
      {before.length > 0 && (
        <div className="holiday-before">
          <h3>{h.plural} before</h3>
          <div className="holiday-years">
            {before.map((a) => {
              const pic = picOf(a)
              return (
                <button key={a.id} onClick={() => navigate(`/album/${a.id}`)}>
                  <span className="holiday-year-pic">{pic && <img src={pic} alt="" draggable={false} />}</span>
                  <span>{a.holiday.year}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <button className="holiday-more" onClick={() => navigate('/holidays')}>Holidays and family days</button>
    </section>
  )
}

// The story waiting the week after a holiday: its album, once it has photos,
// as { holiday, album, pics } (the photos, newest first), else null.
export function useRecapAlbum() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  useHolidaysOff()
  const r = recapNow()
  const h = r && holidayOn(r.id) ? r : null
  const album = h ? holidayAlbum(albums, h.id, h.year) : null
  const pics = album ? album.imageIds.filter((id) => images[id] && !isVideo(images[id])) : []
  return pics.length ? { holiday: h, album, pics } : null
}

// Advent, December 1 to 24: today's thing to look for, and the days so far,
// each filled once someone has added a photo to the Christmas album that day.
// On the front page and in the album itself; `onAdd` goes to add one.
export function Advent({ album, year, onAdd }) {
  const day = adventDay()
  if (!day) return null
  const done = adventDone(album, year, addedAt)
  return (
    <div className="advent">
      <div className="advent-head">
        <span>
          <small>Advent · day {day}</small>
          <b>{ADVENT[day - 1]}</b>
        </span>
        {onAdd && <button className="pill-btn" onClick={onAdd}>{done.has(day) ? 'Add another' : "Add today's"}</button>}
      </div>
      <ol className="advent-days" aria-label={`${done.size} of the ${day} days so far have a photo`}>
        {ADVENT.map((what, i) => (
          <li key={what} className={`${done.has(i + 1) ? 'done' : ''} ${i + 1 === day ? 'today' : ''} ${i + 1 > day ? 'later' : ''}`} title={`${i + 1}: ${what}`}>
            {i + 1}
          </li>
        ))}
      </ol>
    </div>
  )
}

// A family day, on the day: the greeting with their name (to them, from
// everyone), a little confetti the first time it's seen on this phone, and
// the day's album, made like a holiday's (only once Hugpix 2 is on for everyone).
function FamilyDays({ days }) {
  const people = usePeople()
  const albums = useStore((s) => s.albums)
  const { session, canSync, guest } = useCloud()
  const everyone = useV2Everyone()
  const synced = useSyncExternalStore(onSyncStatus, () => getSyncStatus().lastSync)
  const me = session?.user.id
  const year = today().getFullYear()
  const key = days.map((d) => d.id).join(',')

  // Confetti, once a day on this phone.
  useEffect(() => {
    const mark = `${today().toDateString()}:${key}`
    try {
      if (localStorage.getItem('hugpix:dayConfetti') === mark) return
      localStorage.setItem('hugpix:dayConfetti', mark)
    } catch {
      return
    }
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent('hugpix:added', { detail: { season: 'confetti' } })), 600)
    return () => clearTimeout(t)
  }, [key])

  useEffect(() => {
    if (!everyone || import.meta.env.DEV || !session || !canSync || guest || !synced) return
    for (const d of days) {
      const id = familyDayAlbumId(d.id, year)
      if (!albums.some((a) => a.id === id) && !knownOnServer('album', id)) createFamilyDayAlbum(id, `${familyDayTitle(d)} ${year}`, { id: d.id, year }, session.user.id)
    }
    // `days` stand for `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, everyone, session?.user.id, canSync, guest, synced])

  return days.map((d) => {
    const album = albums.find((a) => a.id === familyDayAlbumId(d.id, year))
    const person = d.person ? personIn(people, d.person) : null
    const mine = d.person && d.person === me
    const years = d.year ? year - d.year : null
    return (
      <button key={d.id} className="holiday-card family-day-card" onClick={() => album && navigate(`/album/${album.id}`)}>
        <span className="holiday-card-face">
          {person ? <Avatar person={person} size={56} zoom={false} /> : <ReactionFace kind="dance" season="everyday" size={60} />}
        </span>
        <span className="holiday-card-text">
          <small>Today{years > 0 && d.kind !== 'birthday' ? ` · ${years} years` : ''}</small>
          <b>{familyDayGreeting(d)}</b>
          <span>{mine ? 'From everyone in Hugpix.' : album ? "Today's photos go in one album." : `${familyDayTitle(d)} is today.`}</span>
        </span>
        {album && <span className="holiday-card-go">Add yours</span>}
      </button>
    )
  })
}
