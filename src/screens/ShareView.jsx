import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { downloadUrl, fetchShare, publicUrl } from '../lib/cloud'
import { downloadZip } from '../lib/share'

// The page a visitor lands on from a shared link. No sign-in, no editor:
// just the photos, full size on tap, with download buttons.
export default function ShareView({ token }) {
  const [share, setShare] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [zipping, setZipping] = useState(null)
  const [index, setIndex] = useState(0)
  const scroller = useRef(null)

  useEffect(() => {
    fetchShare(token).then(setShare).catch((e) => {
      setShare(null)
      setError(e.message)
    })
  }, [token])

  useEffect(() => {
    if (share?.title) document.title = `${share.title} · Seamline`
  }, [share])

  if (share === undefined) return <div className="splash">Seamline</div>
  if (!share || share.items.length === 0) {
    return (
      <div className="screen">
        <div className="empty">
          <h2>{error ? 'Could not open this link' : 'This link is no longer shared'}</h2>
          <p>{error ?? 'The owner may have stopped sharing it, or the address is incomplete.'}</p>
        </div>
      </div>
    )
  }

  const { items } = share
  const single = share.kind === 'photo' || items.length === 1
  const carousel = share.kind === 'carousel' && !single
  const viewed = items.find((it) => it.path === viewing)

  async function downloadAll() {
    setError(null)
    try {
      const files = []
      for (const [i, it] of items.entries()) {
        setZipping(`Fetching ${i + 1} of ${items.length}`)
        const res = await fetch(publicUrl(it.path))
        if (!res.ok) throw new Error('A photo could not be downloaded')
        // Keep names unique inside the zip.
        files.push(new File([await res.blob()], `${String(i + 1).padStart(2, '0')}-${it.name}`, { type: 'image/jpeg' }))
      }
      await downloadZip(files, share.title || 'photos')
    } catch (e) {
      setError(e.message)
    }
    setZipping(null)
  }

  return (
    <div className="screen shareview">
      <header className="shareview-head">
        <h1>{share.title || 'Shared photos'}</h1>
        {!single && <p>{carousel ? `${index + 1} of ${items.length} · swipe to see the rest` : `${items.length} photos`}</p>}
      </header>

      {single ? (
        <img className="single-photo" src={publicUrl(items[0].path)} alt={items[0].name} />
      ) : carousel ? (
        <div className="shared-carousel">
          <div
            className="carousel"
            ref={scroller}
            style={{ '--ratio': items[0].width / items[0].height }}
            onScroll={() => setIndex(Math.round(scroller.current.scrollLeft / scroller.current.clientWidth))}
          >
            {items.map((it, i) => (
              <img key={it.path} src={publicUrl(it.path)} alt={`Frame ${i + 1}`} draggable={false} />
            ))}
          </div>
          <div className="dots" aria-hidden="true">
            {items.map((it, i) => (
              <i key={it.path} className={i === index ? 'on' : ''} />
            ))}
          </div>
        </div>
      ) : (
        <div className="photo-grid">
          {items.map((it) => (
            <button key={it.path} className="photo" onClick={() => setViewing(it.path)}>
              <img src={publicUrl(it.path)} alt={it.name} loading="lazy" decoding="async" draggable={false} />
            </button>
          ))}
        </div>
      )}

      <footer className="shareview-foot">
        {error && <p className="preview-error" role="alert">{error}</p>}
        Made with <a href="/">Seamline</a>
      </footer>

      {single ? (
        <a className="primary fab" href={downloadUrl(items[0])}>
          <Icon name="download" size={20} /> Download
        </a>
      ) : (
        <button className="primary fab" onClick={downloadAll} disabled={!!zipping}>
          <Icon name="download" size={20} /> {zipping ?? 'Download all'}
        </button>
      )}

      {viewed && (
        <div className="viewer">
          <header className="topbar">
            <button className="icon-btn" onClick={() => setViewing(null)} aria-label="Close photo">
              <Icon name="close" />
            </button>
            <div className="preview-title">{items.indexOf(viewed) + 1} of {items.length}</div>
            <span className="topbar-spacer" />
          </header>
          <div className="viewer-body">
            <img src={publicUrl(viewed.path)} alt={viewed.name} draggable={false} />
          </div>
          <footer className="preview-actions">
            <a className="primary block" href={downloadUrl(viewed)}>
              <Icon name="download" size={20} /> Download
            </a>
          </footer>
        </div>
      )}
    </div>
  )
}
