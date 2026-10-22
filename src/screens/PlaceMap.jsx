import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { useCloud } from '../lib/cloud'
import { gpsOf } from '../lib/exif'
import { countText, isVideo } from '../lib/images'
import { nameOf } from '../lib/places'
import { addedAt, getState, setPhotoSpots, useStore } from '../lib/store'

// Where the albums were, on a map. A photo that knows where it was taken sits
// there; an album given a place holds the rest of its photos there. Pins close
// together on screen join into one with a count: a tap on one that spans
// several spots closes in on them, a tap on one spot lists its photos, and a
// tap on a photo opens it in its album. A dashed line follows each album's
// photos from spot to spot in the order they were added: its trip.
//
// The address can ask for a view: /map?at=lat,lng starts over one spot (from
// under a photo), /map?album=id shows one album's trip alone. The map is
// OpenStreetMap's own, darkened to suit the app (see .place-map in styles.css).

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const JOIN = 56 // pins nearer than this on screen, in pixels, become one
const CLOSEST = 17 // this far in, a pin's photos are listed rather than closed in on
const STEP = 100 // metres a trip must move before its line gets another point
const CHECKED = 'seamline:placesChecked' // photos already read for a location

const readChecked = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKED) || '[]'))
  } catch {
    return new Set()
  }
}
const saveChecked = (set) => {
  try {
    localStorage.setItem(CHECKED, JSON.stringify([...set]))
  } catch {
    // Storage blocked: the photos are just read again next time.
  }
}

// The address, read again whenever it changes (navigate() says so).
const onUrl = (cb) => {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}
const spotIn = (text) => {
  const [lat, lng] = (text ?? '').split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null
}

// The map's points: [{ lat, lng, items: [{ id, album, lat, lng }] }]. A photo's
// spot is [lat, lng] or [lat, lng, name]; null means taken off the map.
function pointsOf(albums, images) {
  const points = []
  for (const album of albums) {
    const shown = album.imageIds.filter((id) => images[id])
    const loose = []
    for (const id of shown) {
      const spot = album.spots?.[id]
      if (spot) points.push({ lat: spot[0], lng: spot[1], items: [{ id, album, lat: spot[0], lng: spot[1] }] })
      else loose.push(id)
    }
    if (album.place && loose.length) {
      const { lat, lng } = album.place
      points.push({ lat, lng, items: loose.map((id) => ({ id, album, lat, lng })) })
    }
  }
  return points
}

// An album's trip: its photos' own spots in the order the photos were added,
// leaving out spots it hardly moves from. Empty unless it goes somewhere.
function tripOf(album, images) {
  const ids = album.imageIds.filter((id) => images[id] && album.spots?.[id]).sort((x, y) => addedAt(x) - addedAt(y))
  const line = []
  for (const id of ids) {
    const at = L.latLng(album.spots[id][0], album.spots[id][1])
    if (!line.length || line.at(-1).distanceTo(at) > STEP) line.push(at)
  }
  return line.length > 1 ? line : []
}

export default function PlaceMap() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { guest, session } = useCloud()
  const me = session?.user.id
  const search = useSyncExternalStore(onUrl, () => window.location.search)
  const params = new URLSearchParams(search)
  const atKey = params.get('at')
  const at = useMemo(() => spotIn(atKey), [atKey]) // sent here to look at one spot
  const only = albums.find((a) => a.id === params.get('album')) ?? null // one album's trip alone
  const box = useRef(null)
  const map = useRef(null)
  const lines = useRef(null)
  const pins = useRef(null)
  const [opened, setOpened] = useState(null) // the photos under the pin tapped
  const [reading, setReading] = useState(null) // { done, total, naming } while photos are read for places, or places for names

  const shownAlbums = useMemo(() => (only ? [only] : albums), [albums, only])
  const points = useMemo(() => pointsOf(shownAlbums, images), [shownAlbums, images])
  const placed = new Set(points.flatMap((p) => p.items.map((it) => it.album.id))).size

  const fitted = useRef(null) // what the view was last fitted to

  // The map itself, once.
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, worldCopyJump: true, attributionControl: true })
    L.tileLayer(TILES, { attribution: CREDIT, maxZoom: 19 }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    lines.current = L.layerGroup().addTo(m)
    pins.current = L.layerGroup().addTo(m)
    map.current = m
    fitted.current = null
    if (at) m.setView(at, 14)
    return () => {
      m.remove()
      map.current = null
    }
    // Once; `at` only says where to start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start where the photos are, and again whenever more turn up or the view
  // narrows to one album; not when sent to look at one spot.
  useEffect(() => {
    const m = map.current
    const key = `${only?.id ?? ''}:${points.length}`
    if (!m || at || fitted.current === key) return
    fitted.current = key
    if (!points.length) m.setView([25, 10], 2)
    else if (points.length === 1) m.setView([points[0].lat, points[0].lng], 11)
    else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 13 })
  }, [points, at, only])

  // Each album's trip, drawn again when its photos or their spots change.
  useEffect(() => {
    if (!lines.current) return
    lines.current.clearLayers()
    for (const album of shownAlbums) {
      const trip = tripOf(album, images)
      if (trip.length) {
        L.polyline(trip, { className: 'trip-line', weight: 2.5, opacity: 0.8, dashArray: '5 7', lineJoin: 'round', interactive: false }).addTo(lines.current)
      }
    }
  }, [shownAlbums, images])

  // Draw the pins, joining near ones, again after every zoom or pan.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const draw = () => {
      const groups = []
      for (const p of [...points].sort((a, b) => b.items.length - a.items.length)) {
        const at = m.latLngToLayerPoint([p.lat, p.lng])
        const near = groups.find((g) => g.at.distanceTo(at) < JOIN)
        if (near) near.items.push(...p.items)
        else groups.push({ at, lat: p.lat, lng: p.lng, items: [...p.items] })
      }
      pins.current.clearLayers()
      for (const g of groups) {
        const cover = g.items.find((it) => !isVideo(images[it.id])) ?? g.items[0]
        const icon = L.divIcon({
          className: 'map-pin',
          html: `<span class="map-pin-photo"><img src="${images[cover.id].previewUrl}" alt=""></span>${g.items.length > 1 ? `<b>${g.items.length}</b>` : ''}`,
          iconSize: [52, 60],
          iconAnchor: [26, 60],
        })
        L.marker([g.lat, g.lng], { icon, keyboard: true, title: [...new Set(g.items.map((it) => it.album.name))].join(', ') })
          .on('click', () => {
            // Photos from more than one spot: close in on them first, until they come apart.
            const spots = new Set(g.items.map((it) => `${it.lat},${it.lng}`))
            if (spots.size > 1 && m.getZoom() < CLOSEST) {
              m.fitBounds(L.latLngBounds(g.items.map((it) => [it.lat, it.lng])), { padding: [70, 70], maxZoom: CLOSEST })
            } else {
              setOpened(g.items)
            }
          })
          .addTo(pins.current)
      }
    }
    draw()
    m.on('zoomend', draw)
    return () => m.off('zoomend', draw)
  }, [points, images])

  // Photos added before the map existed: read their locations once, on the
  // device that holds them in full, and note them in the albums this person
  // may change. One with a spot already, or taken off the map (null), is left.
  // Then spots with no name yet are given one, from where they are.
  useEffect(() => {
    let alive = true
    const mine = (album) => !guest || album.createdBy === me
    const checked = readChecked()
    const todo = []
    for (const album of albums) {
      if (!mine(album)) continue
      for (const id of album.imageIds) {
        const img = images[id]
        if (img?.blob && !isVideo(img) && !(id in (album.spots ?? {})) && !checked.has(id)) todo.push({ id, album })
      }
    }
    // Names found go into the albums when done, or when leaving early.
    const named = new Map() // album id -> { [photo]: [lat, lng, name] }
    let kept = false
    const keep = () => {
      if (kept) return
      kept = true
      for (const [albumId, spots] of named) setPhotoSpots(albumId, spots)
    }
    ;(async () => {
      if (todo.length) {
        const found = new Map() // album id -> { [photo]: spot }
        for (const [i, { id, album }] of todo.entries()) {
          if (!alive) return
          if (i % 10 === 0) setReading({ done: i, total: todo.length })
          const spot = await gpsOf(images[id].blob)
          checked.add(id)
          if (spot) found.set(album.id, { ...found.get(album.id), [id]: spot })
        }
        saveChecked(checked)
        for (const [albumId, spots] of found) setPhotoSpots(albumId, spots)
      }
      // The albums as they stand now, with any spots just found.
      const unnamed = []
      for (const album of getState().albums) {
        if (!mine(album)) continue
        for (const [id, s] of Object.entries(album.spots ?? {})) if (s && !s[2] && album.imageIds.includes(id)) unnamed.push({ id, album, s })
      }
      for (const [i, { id, album, s }] of unnamed.entries()) {
        if (!alive) return
        if (i % 3 === 0) setReading({ done: i, total: unnamed.length, naming: true })
        const name = await nameOf(s[0], s[1]).catch(() => null)
        if (!alive) return
        if (name) named.set(album.id, { ...named.get(album.id), [id]: [s[0], s[1], name] })
      }
      keep()
      setReading(null)
    })()
    return () => {
      alive = false
      keep()
    }
    // Once per visit, with the photos as they were on arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const albumsUnder = opened ? [...new Set(opened.map((it) => it.album))] : []
  // What to call the spot: the one name its photos have, or else the album's place.
  const namesUnder = opened ? [...new Set(opened.map((it) => it.album.spots?.[it.id]?.[2]).filter(Boolean))] : []
  const nameUnder = namesUnder.length === 1 ? namesUnder[0] : albumsUnder.length === 1 ? albumsUnder[0].place?.name : null

  return (
    <div className="screen place-map">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="preview-title">{only ? only.name : 'Places'}</div>
        {only ? (
          <button className="pill-btn" onClick={() => navigate('/map', { replace: true })}>All places</button>
        ) : (
          <span className="topbar-spacer" />
        )}
      </header>
      <div className="map-box" ref={box} />
      <div className="map-note">
        {reading ? (
          <p>
            <i className="spinner inline" /> {reading.naming ? 'Naming the places in your photos' : 'Looking for places in your photos'}, {reading.done} of {reading.total}
          </p>
        ) : only ? (
          <p>
            {points.length
              ? `${countText(points.flatMap((p) => p.items).map((it) => images[it.id]))} on the map. The line follows them in the order they were added.`
              : `Nothing from ${only.name} is on the map yet.`}
          </p>
        ) : placed ? (
          <p>{placed} album{placed === 1 ? '' : 's'} on the map. To add more, open an album and tap Add place, or choose photos and tap Place.</p>
        ) : (
          <p>Nothing on the map yet. Open an album and tap Add place, choose photos and tap Place, or add photos that know where they were taken.</p>
        )}
      </div>

      <Sheet
        open={!!opened}
        onClose={() => setOpened(null)}
        title={albumsUnder.length === 1 ? albumsUnder[0].name : `${albumsUnder.length} albums`}
        modal
      >
        {opened && (
          <>
            <p className="hint">
              {countText(opened.map((it) => images[it.id]))}
              {nameUnder ? ` · ${nameUnder}` : ''}
            </p>
            <div className="wall-grid map-photos">
              {opened.map((it) => (
                <button
                  key={it.id}
                  className="wall-tile"
                  onClick={() => navigate(`/album/${it.album.id}?photo=${encodeURIComponent(it.id)}`)}
                  aria-label={`Open in ${it.album.name}`}
                >
                  <img src={images[it.id].previewUrl} alt="" loading="lazy" draggable={false} />
                  {isVideo(images[it.id]) && <span className="wall-clip"><Icon name="play" size={12} /></span>}
                </button>
              ))}
            </div>
            {albumsUnder.length === 1 && (
              <button className="primary block" onClick={() => navigate(`/album/${albumsUnder[0].id}`)}>Open {albumsUnder[0].name}</button>
            )}
            {albumsUnder.length === 1 && !only && albums.length > 1 && (
              <button
                className="text-btn"
                onClick={() => {
                  setOpened(null)
                  navigate(`/map?album=${albumsUnder[0].id}`, { replace: true })
                }}
              >
                Only {albumsUnder[0].name} on the map
              </button>
            )}
          </>
        )}
      </Sheet>
    </div>
  )
}
