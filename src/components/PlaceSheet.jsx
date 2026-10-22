import { lazy, Suspense, useEffect, useState } from 'react'
import { navigate } from '../App'
import Icon from './Icon'
import Sheet from './Sheet'
import { findPlaces, photoPlace } from '../lib/places'
import { setAlbumPlace, setPhotoSpots } from '../lib/store'

// The map is a big piece of code: it comes only when the sheet opens.
const PinMap = lazy(() => import('./PinMap'))

// Putting an album, or a few of its photos, on the map: search for the place
// by name and pick it, then drag the map to put the pin just where it should
// be. `photoIds` names the photos; without it the whole album is placed.
// Mounted afresh each time it opens. `onClose(saved)` says whether anything
// changed.
export default function PlaceSheet({ open, album, photoIds = null, onClose }) {
  // Where it is now, if anywhere: the first photo's own spot, or the album's place.
  const current = photoIds ? photoPlace(album, photoIds[0]) : album.place ?? null
  const [query, setQuery] = useState(current?.name ?? album.place?.name ?? album.name ?? '')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(current) // the place chosen: it names the spot, and is where the map looks
  const [pin, setPin] = useState(current ? [current.lat, current.lng] : null) // where the pin is, after any dragging

  const search = async (q) => {
    if (q.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      setResults(await findPlaces(q))
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  // Nothing placed yet: look for the name straight away.
  useEffect(() => {
    if (open && !current) search(query)
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (p) => {
    setPicked(p)
    setPin([p.lat, p.lng])
    setResults(null)
  }

  const what = photoIds ? (photoIds.length === 1 ? 'the photo' : `these ${photoIds.length} photos`) : 'the album'
  const save = () => {
    const name = picked?.name ?? null
    if (photoIds) {
      const spot = name ? [pin[0], pin[1], name] : [pin[0], pin[1]]
      setPhotoSpots(album.id, Object.fromEntries(photoIds.map((id) => [id, spot])))
    } else {
      setAlbumPlace(album.id, { name: name ?? (query.trim() || 'Somewhere'), lat: pin[0], lng: pin[1] })
    }
    onClose(true)
  }
  // Off the map: the album's place goes; a photo's spot is marked as taken
  // off, so the photo is not read for one again.
  const placed = photoIds ? photoIds.some((id) => album.spots?.[id]) : !!album.place
  const clear = () => {
    if (photoIds) setPhotoSpots(album.id, Object.fromEntries(photoIds.map((id) => [id, null])))
    else setAlbumPlace(album.id, null)
    onClose(true)
  }

  return (
    <Sheet
      open={open}
      onClose={() => onClose(false)}
      title={photoIds ? (photoIds.length === 1 ? 'Where was this taken?' : 'Where were these taken?') : 'Where was this?'}
      modal
    >
      <form
        className="place-search"
        onSubmit={(e) => {
          e.preventDefault()
          search(query)
        }}
      >
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A city, a park, an address"
          enterKeyHint="search"
          aria-label="Place"
        />
        <button className="pill-btn" disabled={busy}>{busy ? <i className="spinner inline" /> : 'Search'}</button>
      </form>
      {error && <p className="note warn">{error}</p>}
      {results?.length === 0 && !busy && <p className="note">Nothing found by that name. Try a nearby town.</p>}
      {results?.length > 0 && (
        <ul className="layer-list">
          {results.map((p) => (
            <li key={`${p.lat},${p.lng},${p.full}`}>
              <button className="layer-pick place-pick" onClick={() => choose(p)}>
                <Icon name="pin" size={18} />
                <span className="place-names">
                  <b>{p.name}</b>
                  <small>{p.full}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pin && (
        <>
          <Suspense fallback={<div className="pin-map"><p className="hint centre"><i className="spinner inline" /> Getting the map</p></div>}>
            <PinMap at={[picked.lat, picked.lng]} onMove={setPin} />
          </Suspense>
          <p className="note centre">
            {picked.name ? <b>{picked.name}</b> : 'Where it was taken'} · drag the map to move the pin
          </p>
          <button className="primary block" onClick={save}>Put {what} here</button>
        </>
      )}
      {placed && <button className="text-btn" onClick={clear}>Take {what} off the map</button>}
      {!photoIds && (placed || album.imageIds.some((id) => album.spots?.[id])) && (
        <button
          className="text-btn"
          onClick={() => {
            onClose(false)
            navigate(`/map?album=${album.id}`)
          }}
        >
          See the album on the map
        </button>
      )}
      {!photoIds && <p className="note">Photos that know where they were taken also go on the map by themselves.</p>}
    </Sheet>
  )
}
