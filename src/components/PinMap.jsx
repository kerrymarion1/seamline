import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import Icon from './Icon'

// A small map with a pin held at its middle: dragging the map moves the pin.
// `at` ([lat, lng]) is where to look, and each new one moves the map there;
// `onMove` hears where the middle is after every drag or zoom. The map is
// OpenStreetMap's own, darkened like the big one (see .pin-map in styles.css).

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const round = (n) => Math.round(n * 1e5) / 1e5

export default function PinMap({ at, zoom = 13, onMove }) {
  const box = useRef(null)
  const map = useRef(null)
  const say = useRef(onMove)
  say.current = onMove

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, worldCopyJump: true, attributionControl: true })
    L.tileLayer(TILES, { attribution: CREDIT, maxZoom: 19 }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    m.setView(at, zoom)
    m.on('moveend', () => {
      const c = m.getCenter()
      say.current?.([round(c.lat), round(c.lng)])
    })
    // Made while the sheet it sits in is still arriving: measure again once it has.
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)
    map.current = m
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
    }
    // Once; later places arrive through `at` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Somewhere new to look at, keeping any closer zoom.
  const key = at.join()
  useEffect(() => {
    const m = map.current
    if (m) m.setView(at, Math.max(m.getZoom(), zoom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div className="pin-map">
      <div className="pin-map-box" ref={box} />
      <span className="pin-map-pin" aria-hidden="true"><Icon name="pin" size={36} /></span>
    </div>
  )
}
