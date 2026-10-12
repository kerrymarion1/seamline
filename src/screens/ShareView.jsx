import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PhotoPager from '../components/PhotoPager'
import Sheet from '../components/Sheet'
import { downloadUrl, fetchMyFavorites, fetchShare, publicUrl, setFavorite, useCloud, visitorUpload } from '../lib/cloud'
import { clock, countText, isVideo } from '../lib/images'
import { downloadZip } from '../lib/share'

function Heart({ on, onToggle, className = '' }) {
  return (
    <button
      className={`heart ${on ? 'on' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={on ? 'Remove favourite' : 'Mark as favourite'}
      aria-pressed={on}
    >
      <Icon name="heart" size={22} />
    </button>
  )
}

// The page a visitor lands on from a shared link. No sign-in, no editor:
// just the photos and videos, full size on tap, with download buttons.
export default function ShareView({ token }) {
  const { session } = useCloud()
  const [share, setShare] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [zipping, setZipping] = useState(null)
  const [index, setIndex] = useState(0)
  const scroller = useRef(null)
  const [liked, setLiked] = useState(() => new Set())
  const fileInput = useRef(null)
  const PIN_KEY = `seamline:pin:${token}`
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '')
  const [askPin, setAskPin] = useState(false)
  const [pinError, setPinError] = useState(null)
  const [adding, setAdding] = useState(null)

  // Check the PIN before opening the photo picker, so a wrong one is caught first.
  const startAdding = async (candidate = pin) => {
    if (!candidate) return setAskPin(true)
    // Already checked in this visit: open the photo picker straight away.
    if (sessionStorage.getItem(PIN_KEY) === candidate) return fileInput.current.click()
    setPinError(null)
    setAdding('Checking PIN')
    try {
      await visitorUpload(token, candidate, null)
      sessionStorage.setItem(PIN_KEY, candidate)
      setPin(candidate)
      setAskPin(false)
      fileInput.current.click()
    } catch (e) {
      sessionStorage.removeItem(PIN_KEY)
      setPinError(e.message)
      setAskPin(true)
    }
    setAdding(null)
  }

  const addFiles = async (files) => {
    setError(null)
    let failed = null
    for (const [i, file] of files.entries()) {
      setAdding(`Adding ${i + 1} of ${files.length}`)
      try {
        const item = await visitorUpload(token, pin, file)
        if (item) setShare((sh) => ({ ...sh, items: [...sh.items, item] }))
      } catch (e) {
        failed = e.message
        if (e.wrongPin) break
      }
    }
    setAdding(null)
    if (failed) setError(failed)
  }

  useEffect(() => {
    fetchShare(token).then(setShare).catch((e) => {
      setShare(null)
      setError(e.message)
    })
  }, [token])

  useEffect(() => {
    fetchMyFavorites(token).then((ids) => setLiked(new Set(ids))).catch(() => {})
  }, [token])

  // Show the change at once; put it back if saving fails.
  const toggle = (item) => {
    const on = !liked.has(item.id)
    const flip = (want) => setLiked((prev) => {
      const next = new Set(prev)
      if (want) next.add(item.id)
      else next.delete(item.id)
      return next
    })
    flip(on)
    setFavorite(token, item.id, on).catch((e) => {
      flip(!on)
      setError(e.message)
    })
  }

  useEffect(() => {
    if (share?.title) document.title = `${share.title} · Seamline`
  }, [share])

  if (share === undefined) return <div className="splash"><Logo as="div" /></div>
  if (!share || (share.items.length === 0 && !share.allow_uploads)) {
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
  const single = share.kind === 'photo' || (items.length === 1 && !share.allow_uploads)
  const carousel = share.kind === 'carousel' && !single
  const viewed = items.find((it) => it.path === viewing)

  // Videos are too large to zip in the browser; each is downloaded on its own.
  const stills = items.filter((it) => !isVideo(it))

  async function downloadAll() {
    setError(null)
    try {
      const files = []
      for (const [i, it] of stills.entries()) {
        setZipping(`Fetching ${i + 1} of ${stills.length}`)
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
      {/* A way out of the page: into the app, at the albums when signed in. */}
      <nav className="shareview-nav">
        <a className="pill-btn" href={session ? '/albums' : '/'}>
          <Icon name="back" size={16} /> {session ? 'All albums' : 'Open Seamline'}
        </a>
      </nav>
      <header className="shareview-head">
        <h1>{share.title || 'Shared photos'}</h1>
        {(single || carousel) && (
          <Heart
            className="head-heart"
            on={liked.has(items[single ? 0 : index].id)}
            onToggle={() => toggle(items[single ? 0 : index])}
          />
        )}
        {!single && <p>{carousel ? `${index + 1} of ${items.length} · swipe to see the rest` : countText(items)}</p>}
      </header>

      {single && isVideo(items[0]) ? (
        <video className="single-photo" src={publicUrl(items[0].path)} poster={publicUrl(items[0].poster)} controls playsInline preload="metadata" />
      ) : single ? (
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
            <div key={it.path} className="photo">
              <button className="photo-open" onClick={() => setViewing(it.path)} aria-label={`Open ${it.name}`}>
                <img src={publicUrl(isVideo(it) ? it.poster : it.path)} alt={it.name} loading="lazy" decoding="async" draggable={false} />
                {isVideo(it) && <span className="clip"><Icon name="play" size={13} /> {clock(it.duration)}</span>}
              </button>
              <Heart className="corner" on={liked.has(it.id)} onToggle={() => toggle(it)} />
            </div>
          ))}
        </div>
      )}

      <footer className="shareview-foot">
        {share.allow_uploads && (
          <button className="secondary add-photos" onClick={() => startAdding()} disabled={!!adding}>
            <Icon name="plus" size={20} /> {adding ?? 'Add your photos'}
          </button>
        )}
        {error && <p className="preview-error" role="alert">{error}</p>}
        Made with <a href="/">Seamline</a>
      </footer>

      {single ? (
        <a className="primary fab" href={downloadUrl(items[0])}>
          <Icon name="download" size={20} /> Download
        </a>
      ) : stills.length > 0 ? (
        <button className="primary fab" onClick={downloadAll} disabled={!!zipping}>
          <Icon name="download" size={20} /> {zipping ?? (stills.length < items.length ? 'Download photos' : 'Download all')}
        </button>
      ) : null}

      <Sheet open={askPin} onClose={() => setAskPin(false)} title="Enter the PIN" modal>
        <p className="hint">Ask the person who shared this album for its PIN to add your own photos.</p>
        <input
          className="field pin-field"
          inputMode="numeric"
          maxLength={8}
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && startAdding(pin)}
        />
        {pinError && <p className="preview-error" role="alert">{pinError}</p>}
        <button className="primary block" disabled={pin.length < 4 || !!adding} onClick={() => startAdding(pin)}>
          {adding ?? 'Continue'}
        </button>
      </Sheet>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...e.target.files]
          e.target.value = ''
          addFiles(files)
        }}
      />

      {viewed && (
        <div className="viewer">
          <header className="topbar">
            <button className="icon-btn" onClick={() => setViewing(null)} aria-label="Close photo">
              <Icon name="close" />
            </button>
            <div className="preview-title">{items.indexOf(viewed) + 1} of {items.length}</div>
            <Heart on={liked.has(viewed.id)} onToggle={() => toggle(viewed)} />
          </header>
          <PhotoPager
            slides={items.map((it) => ({
              key: it.path, src: publicUrl(it.path), alt: it.name, video: isVideo(it), poster: isVideo(it) ? publicUrl(it.poster) : undefined,
            }))}
            index={items.indexOf(viewed)}
            onIndex={(i) => setViewing(items[i].path)}
          />
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
