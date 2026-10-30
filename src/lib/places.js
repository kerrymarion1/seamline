// Places by name and names for places, from OpenStreetMap's Nominatim: asked
// only when someone searches or a spot needs a name, never more than once a
// second. A place is { name, lat, lng }.
//
// Where things sit on the map: an album has a `place` ({ name, lat, lng });
// a photo may have its own spot in the album's `spots`, [lat, lng] when read
// from the photo itself, [lat, lng, name] once named (by hand, or from where
// it is), or null when it was taken off the map on purpose, so it is not
// read again.

// Nominatim allows one request a second: every ask waits its turn.
let lastAsked = 0
let turn = Promise.resolve()
function ask(url) {
  const run = turn.then(async () => {
    const wait = lastAsked + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastAsked = Date.now()
    const res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } })
    if (!res.ok) throw new Error('Places could not be looked up just now')
    return res.json()
  })
  turn = run.catch(() => {})
  return run
}

export async function findPlaces(query) {
  const q = query.trim()
  if (q.length < 2) return []
  const found = await ask(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`)
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

// A name for a spot, "Kyoto, Japan", from the town and country it is in; null
// for the open sea. Spots are rounded to about a kilometre first, so nearby
// photos share one answer (kept here) and the exact spot stays on the phone.
const names = new Map() // "lat,lng" -> Promise<string | null>
export function nameOf(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  if (!names.has(key)) {
    const [la, ln] = key.split(',')
    const asked = ask(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${la}&lon=${ln}`).then((found) => {
      const a = found.address ?? {}
      const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state_district ?? a.state ?? found.name
      return [town, a.country].filter(Boolean).join(', ') || null
    })
    asked.catch(() => names.delete(key)) // so it is asked again another time
    names.set(key, asked)
  }
  return names.get(key)
}

// Where this device is right now, [lat, lng], or null when it can't or won't
// say. A fix from the last couple of minutes is fine.
export const whereAmI = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([Math.round(pos.coords.latitude * 1e5) / 1e5, Math.round(pos.coords.longitude * 1e5) / 1e5]),
      () => resolve(null),
      { maximumAge: 120000, timeout: 15000 },
    )
  })

// Where an album sits on the map: the place given to it, or else the middle
// of its photos' own locations. Null when it has neither.
export function albumSpot(album) {
  if (album.place) return [album.place.lat, album.place.lng]
  const spots = Object.entries(album.spots ?? {}).filter(([id, s]) => s && album.imageIds.includes(id)).map(([, s]) => s)
  if (!spots.length) return null
  return [spots.reduce((n, s) => n + s[0], 0) / spots.length, spots.reduce((n, s) => n + s[1], 0) / spots.length]
}

// Where one photo sits on the map, { lat, lng, name }: its own spot (named
// once it has been), or else the album's place. Null when neither.
export function photoPlace(album, imageId) {
  const spot = album.spots?.[imageId]
  if (spot) return { lat: spot[0], lng: spot[1], name: spot[2] ?? null }
  return album.place ? { lat: album.place.lat, lng: album.place.lng, name: album.place.name } : null
}

// The names an album's photos' spots have: { [imageId]: name }.
export function spotNames(album) {
  const names = {}
  for (const id of album.imageIds) {
    const name = album.spots?.[id]?.[2]
    if (name) names[id] = name
  }
  return names
}

// A name for where an album was, for beside it on the front page: its own
// place, or else the place most of its placed photos share. Null for none.
export function placeName(album) {
  if (album.place) return album.place.name
  const tally = new Map()
  for (const name of Object.values(spotNames(album))) tally.set(name, (tally.get(name) ?? 0) + 1)
  let best = null
  for (const [name, n] of tally) if (!best || n > best.n) best = { name, n }
  return best?.name ?? null
}
