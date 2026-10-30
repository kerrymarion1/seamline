import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../App'
import { AlbumName, focusStyle, photosOf } from '../components/HomeLayouts'
import Icon from '../components/Icon'
import { tagName } from '../lib/collections'
import { countText, isVideo } from '../lib/images'
import { fadeIn } from '../lib/motion'
import { usePeople } from '../lib/people'
import { addedAt, uploaderName, useStore } from '../lib/store'

// Search every album at once: one box, and each word must match something
// about a photo — its album's name, who is tagged in it, where it was, its
// caption, who added it, or the year and month it was added. "Mum 2023",
// "Kyoto", "Regine christmas". Albums whose name or place matches come first,
// then the photos, newest first. A tap opens the photo in its album. All
// on this device, as you type.

const MOST = 300 // photos shown at once
const RECENT = 'seamline:searches'
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || '[]')
  } catch {
    return []
  }
}
const saveRecent = (q) => {
  try {
    localStorage.setItem(RECENT, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6)))
  } catch {
    // Storage blocked: nothing remembered.
  }
}

export default function Search() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const people = usePeople()
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [recent] = useState(readRecent)
  const box = useRef(null)
  useEffect(() => box.current?.focus(), [])

  // Everything searchable about each photo and album, folded to lower case once.
  const index = useMemo(() => {
    const photos = []
    const seen = new Set()
    for (const album of albums) {
      const albumText = fold([album.name, album.place?.name, album.note].join(' '))
      for (const id of album.imageIds) {
        if (!images[id] || seen.has(`${album.id}:${id}`)) continue
        seen.add(`${album.id}:${id}`)
        const at = addedAt(id)
        const d = new Date(at)
        const text = fold([
          albumText,
          ...(album.tags?.[id] ?? []).map((t) => tagName(t, people)),
          album.spots?.[id]?.[2],
          album.captions?.[id],
          uploaderName(album.addedBy?.[id]),
          at ? `${d.getFullYear()} ${MONTHS[d.getMonth()]}` : '',
          isVideo(images[id]) ? 'video' : 'photo',
        ].join(' '))
        photos.push({ id, album, at, text })
      }
    }
    return { photos, albums: albums.map((a) => ({ album: a, text: fold([a.name, a.place?.name].join(' ')) })) }
  }, [albums, images, people])

  const words = fold(query).split(/\s+/).filter(Boolean)
  const hits = useMemo(() => {
    if (!words.length) return null
    const all = (text) => words.every((w) => text.includes(w))
    // One photo once, even when it sits in several albums.
    const photos = []
    const got = new Set()
    for (const p of index.photos.filter((p) => all(p.text)).sort((a, b) => b.at - a.at)) {
      if (got.has(p.id)) continue
      got.add(p.id)
      photos.push(p)
    }
    return { albums: index.albums.filter((a) => all(a.text)).map((a) => a.album), photos }
    // `words` is the query, folded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, words.join(' ')])

  // Ideas before anything is typed: the people tagged most, and places.
  const ideas = useMemo(() => {
    const count = new Map()
    for (const a of albums) for (const tags of Object.values(a.tags ?? {})) for (const t of tags) count.set(t, (count.get(t) ?? 0) + 1)
    const names = [...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t]) => tagName(t, people).split(' ')[0])
    const places = [...new Set(albums.map((a) => a.place?.name?.split(',')[0]).filter(Boolean))].slice(0, 4)
    return [...new Set([...names, ...places])]
  }, [albums, people])

  const open = (p) => {
    if (query.trim()) saveRecent(query.trim())
    navigate(`/album/${p.album.id}?photo=${encodeURIComponent(p.id)}`)
  }
  const openAlbum = (a) => {
    if (query.trim()) saveRecent(query.trim())
    navigate(`/album/${a.id}`)
  }
  const fill = (q) => {
    setQuery(q)
    box.current?.focus()
  }

  return (
    <div className="screen wall search">
      <header className="topbar search-bar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            ref={box}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="People, places, albums, years"
            enterKeyHint="search"
            aria-label="Search photos"
          />
          {query && <button onClick={() => fill('')} aria-label="Clear"><Icon name="close" size={16} /></button>}
        </label>
      </header>
      <main className="wall-body">
        {!hits ? (
          <div className="search-ideas">
            {recent.length > 0 && (
              <>
                <p className="wall-sub">Recent</p>
                <div className="chips wrap">
                  {recent.map((q) => <button key={q} className="chip small" onClick={() => fill(q)}>{q}</button>)}
                </div>
              </>
            )}
            {ideas.length > 0 && (
              <>
                <p className="wall-sub">Try</p>
                <div className="chips wrap">
                  {ideas.map((q) => <button key={q} className="chip small" onClick={() => fill(q)}>{q}</button>)}
                </div>
              </>
            )}
            <p className="note search-help">Each word narrows it: “Regine 2024”, “Osaka video”, “Christmas Mum”.</p>
          </div>
        ) : hits.albums.length === 0 && hits.photos.length === 0 ? (
          <div className="empty">
            <h2>Nothing found</h2>
            <p>Nothing matches “{query.trim()}”. Try fewer words, a first name, or a year.</p>
          </div>
        ) : (
          <>
            {hits.albums.length > 0 && (
              <>
                <p className="wall-sub">{hits.albums.length === 1 ? '1 album' : `${hits.albums.length} albums`}</p>
                <div className="search-albums">
                  {hits.albums.map((a) => {
                    const pics = photosOf(a, images)
                    return (
                      <button key={a.id} className="search-album" onClick={() => openAlbum(a)}>
                        <span className="search-album-pic">
                          {pics[0] ? <img src={images[pics[0]].previewUrl} style={focusStyle(a, pics[0])} alt="" draggable={false} /> : <Icon name="photo" size={18} />}
                        </span>
                        <span className="search-album-name"><b><AlbumName album={a} /></b><small>{countText(pics.map((id) => images[id]))}</small></span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {hits.photos.length > 0 && (
              <>
                <p className="wall-sub">
                  {countText(hits.photos.map((p) => images[p.id]))}
                  {hits.photos.length > MOST && `, the newest ${MOST} shown`}
                </p>
                <div className="wall-grid">
                  {hits.photos.slice(0, MOST).map((p) => (
                    <button key={p.id} className="wall-tile" onClick={() => open(p)} aria-label={`Open in ${p.album.name}`}>
                      <img className="fade" onLoad={fadeIn} onError={fadeIn} src={images[p.id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                      {isVideo(images[p.id]) && <span className="wall-clip"><Icon name="play" size={12} /></span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
