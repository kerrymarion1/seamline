// Finding a place by name, for putting an album on the map. The search is
// OpenStreetMap's (Nominatim), asked only when someone searches, never more
// than once a second. A place comes back as { name, lat, lng }.

let lastAsked = 0

export async function findPlaces(query) {
  const q = query.trim()
  if (q.length < 2) return []
  const wait = lastAsked + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastAsked = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } })
  if (!res.ok) throw new Error('Places could not be searched just now')
  const found = await res.json()
  return found.map((p) => ({
    // "Osaka, Japan" rather than every level in between.
    name: shortName(p.display_name),
    full: p.display_name,
    lat: Math.round(Number(p.lat) * 1e5) / 1e5,
    lng: Math.round(Number(p.lon) * 1e5) / 1e5,
  }))
}

function shortName(full) {
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length <= 2) return parts.join(', ')
  return `${parts[0]}, ${parts.at(-1)}`
}

// Where an album sits on the map: the place given to it, or else the middle
// of its photos' own locations. Null when it has neither.
export function albumSpot(album) {
  if (album.place) return [album.place.lat, album.place.lng]
  const spots = Object.entries(album.spots ?? {}).filter(([id]) => album.imageIds.includes(id)).map(([, s]) => s)
  if (!spots.length) return null
  return [spots.reduce((n, s) => n + s[0], 0) / spots.length, spots.reduce((n, s) => n + s[1], 0) / spots.length]
}
