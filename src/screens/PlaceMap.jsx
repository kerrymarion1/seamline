import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { useCloud } from '../lib/cloud'
import { gpsOf } from '../lib/exif'
import { countText, isVideo } from '../lib/images'
import { setPhotoSpots, useStore } from '../lib/store'

// Where the albums were, on a map. A photo that knows where it was taken sits
// there; an album given a place holds the rest of its photos there. Pins close
// together on screen join into one with a count; a tap lists its photos, and a
// tap on one opens it in its album. The map is OpenStreetMap's own, darkened
// to suit the app (see .place-map in styles.css).

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const JOIN = 56 // pins nearer than this on screen, in pixels, become one
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

// The map's points: [{ lat, lng, items: [{ id, album }] }].
function pointsOf(albums, images) {
  const points = []
  for (const album of albums) {
    const shown = album.imageIds.filter((id) => images[id])
    const loose = []
    for (const id of shown) {
      const spot = album.spots?.[id]
      if (spot) points.push({ lat: spot[0], lng: spot[1], items: [{ id, album }] })
      else loose.push({ id, album })
    }
    if (album.place && loose.length) points.push({ lat: album.place.lat, lng: album.place.lng, items: loose })
  }
  return points
}

export default function PlaceMap() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { guest, session } = useCloud()
  const me = session?.user.id
  const box = useRef(null)
  const map = useRef(null)
  const pins = useRef(null)
  const [opened, setOpened] = useState(null) // the photos under the pin tapped
  const [reading, setReading] = useState(null) // { done, total } while photos are read for places

  const points = useMemo(() => pointsOf(albums, images), [albums, images])
  const placed = new Set(points.flatMap((p) => p.items.map((it) => it.album.id))).size

  const fitted = useRef(-1) // how many points the view was last fitted to

  // The map itself, once.
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, worldCopyJump: true, attributionControl: true })
    L.tileLayer(TILES, { attribution: CREDIT, maxZoom: 19 }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    pins.current = L.layerGroup().addTo(m)
    map.current = m
    fitted.current = -1
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  // Start where the photos are, and again whenever more turn up.
  useEffect(() => {
    const m = map.current
    if (!m || points.length === fitted.current) return
    fitted.current = points.length
    if (!points.length) m.setView([25, 10], 2)
    else if (points.length === 1) m.setView([points[0].lat, points[0].lng], 11)
    else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 13 })
  }, [points])

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
          .on('click', () => setOpened(g.items))
          .addTo(pins.current)
      }
    }
    draw()
    m.on('zoomend', draw)
    return () => m.off('zoomend', draw)
  }, [points, images])

  // Photos added before the map existed: read their locations once, on the
  // device that holds them in full, and note them in the albums this person
  // may change.
  useEffect(() => {
    let alive = true
    const checked = readChecked()
    const todo = []
    for (const album of albums) {
      if (guest && album.createdBy !== me) continue
      for (const id of album.imageIds) {
        const img = images[id]
        if (img?.blob && !isVideo(img) && !album.spots?.[id] && !checked.has(id)) todo.push({ id, album })
      }
    }
    if (!todo.length) return
    ;(async () => {
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
      if (alive) setReading(null)
    })()
    return () => {
      alive = false
    }
    // Once per visit, with the photos as they were on arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const albumsUnder = opened ? [...new Set(opened.map((it) => it.album))] : []

  return (
    <div className="screen place-map">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="preview-title">Places</div>
        <span className="topbar-spacer" />
      </header>
      <div className="map-box" ref={box} />
      <div className="map-note">
        {reading ? (
          <p><i className="spinner inline" /> Looking for places in your photos, {reading.done} of {reading.total}</p>
        ) : placed ? (
          <p>{placed} album{placed === 1 ? '' : 's'} on the map. To add another, open it and tap Add place.</p>
        ) : (
          <p>Nothing on the map yet. Open an album and tap Add place, or add photos that know where they were taken.</p>
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
              {albumsUnder.length === 1 && albumsUnder[0].place ? ` · ${albumsUnder[0].place.name}` : ''}
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
          </>
        )}
      </Sheet>
    </div>
  )
}
