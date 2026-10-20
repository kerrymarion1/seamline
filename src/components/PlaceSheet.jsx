import { useEffect, useState } from 'react'
import Icon from './Icon'
import Sheet from './Sheet'
import { findPlaces } from '../lib/places'
import { setAlbumPlace } from '../lib/store'

// Putting an album on the map: search for the place by name (the album's own
// name is tried first, since it often is one), and pick it. Mounted afresh
// each time it opens.
export default function PlaceSheet({ open, album, onClose }) {
  const [query, setQuery] = useState(album.place?.name ?? album.name ?? '')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

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
  useEffect(() => {
    if (open) search(query)
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (p) => {
    setAlbumPlace(album.id, { name: p.name, lat: p.lat, lng: p.lng })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Where was this?" modal>
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
      {album.place && (
        <button
          className="text-btn"
          onClick={() => {
            setAlbumPlace(album.id, null)
            onClose()
          }}
        >
          Take it off the map
        </button>
      )}
      <p className="note">Photos that know where they were taken also go on the map by themselves.</p>
    </Sheet>
  )
}
