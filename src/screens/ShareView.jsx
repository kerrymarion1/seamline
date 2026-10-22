import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PhotoPager from '../components/PhotoPager'
import Sheet from '../components/Sheet'
import {
  addComment, downloadUrl, fetchMedia, fetchMyFavorites, fetchShare, fetchShareExtras, markViewed, publicUrl, rememberLink, requestUploads,
  setFavorite, signOut, useCloud, visitorUpload,
} from '../lib/cloud'
import { clock, countText, isVideo } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { downloadZip } from '../lib/share'
import { SignIn } from './SignIn'

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

// The page a visitor lands on from a shared link. No editor: just the photos
// and videos, full size on tap, with download buttons. Anyone can look and
// heart; adding photos and leaving notes need signing in, and the library's
// say-so (see seamline_rights).
export default function ShareView({ token }) {
  const { session, uploader } = useCloud()
  const [share, setShare] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [zipping, setZipping] = useState(null)
  const [index, setIndex] = useState(0)
  const scroller = useRef(null)
  const [liked, setLiked] = useState(() => new Set())
  const fileInput = useRef(null)
  const [signingIn, setSigningIn] = useState(false)
  const [adding, setAdding] = useState(null)
  // The album's note, what this person may do, and their own comments; null where not available.
  const [extras, setExtras] = useState(null)
  const rights = extras?.rights
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Signed out: sign in. Not allowed yet: ask the album's owner, once.
  const startAdding = async () => {
    setError(null)
    if (!session) return setSigningIn(true)
    if (rights && !rights.upload) {
      if (extras.requested) return
      setAdding('Asking')
      try {
        const answer = await requestUploads(token)
        if (answer === 'allowed') {
          setExtras(await fetchShareExtras(token))
          fileInput.current.click()
        } else if (answer === 'pending') {
          setExtras((x) => ({ ...x, requested: true }))
        } else {
          setError('This album is not taking photos right now.')
        }
      } catch (e) {
        setError(e.message)
      }
      setAdding(null)
      return
    }
    fileInput.current.click()
  }
  const waiting = session && rights && !rights.upload && extras?.requested
  const addLabel = !session
    ? 'Sign in to add your photos'
    : rights && !rights.upload
      ? waiting ? 'Asked · waiting for approval' : 'Ask to add photos'
      : 'Add your photos'

  const addFiles = async (files) => {
    setError(null)
    let failed = null
    for (const [i, file] of files.entries()) {
      setAdding(`Adding ${i + 1} of ${files.length}`)
      try {
        const item = await visitorUpload(token, file)
        if (item) setShare((sh) => ({ ...sh, items: [...sh.items, item] }))
      } catch (e) {
        failed = e.message
        if (e.refused) break
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
    markViewed(token).catch(() => {})
  }, [token])

  // What this person may do changes as they sign in or out.
  const userId = session?.user.id
  useEffect(() => {
    fetchShareExtras(token).then(setExtras).catch(() => {})
    if (userId) setSigningIn(false)
  }, [token, userId])

  const comment = async (item) => {
    if (!draft.trim()) return
    setSending(true)
    setError(null)
    try {
      const made = await addComment(token, item.id, draft.trim())
      setExtras((x) => ({ ...x, comments: [...x.comments, made] }))
      setDraft('')
    } catch (e) {
      setError(e.message)
    }
    setSending(false)
  }

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
    if (share?.title) document.title = `${share.title} · Hugpix`
    if (share) rememberLink(token, share.title)
  }, [share, token])

  if (share === undefined) return <div className="splash"><Logo as="div" loop /></div>
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
  const tileOf = (path) => document.querySelector(`.photo[data-id="${CSS.escape(path)}"]`)
  const open = (path) => morph(() => setViewing(path), { from: () => tileOf(path) })
  const close = () => morph(() => setViewing(null), { to: () => tileOf(viewing) })
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
        const res = await fetchMedia(publicUrl(it.path))
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
        <a className="pill-btn" href={uploader ? '/albums' : '/'}>
          <Icon name="back" size={16} /> {uploader ? 'All albums' : 'Open Hugpix'}
        </a>
        {session && !uploader && <button className="pill-btn" onClick={signOut}>Sign out</button>}
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
        {/* Where it was: a tap shows the spot on OpenStreetMap. */}
        {share.place && (
          <a
            className="share-place"
            href={`https://www.openstreetmap.org/?mlat=${share.place.lat}&mlon=${share.place.lng}#map=12/${share.place.lat}/${share.place.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="pin" size={14} /> {share.place.name ?? 'See where on a map'}
          </a>
        )}
        {extras?.note && <p className="share-note">{extras.note}</p>}
      </header>

      {single && isVideo(items[0]) ? (
        <video className="single-photo" src={publicUrl(items[0].path)} poster={publicUrl(items[0].poster)} controls playsInline preload="metadata" />
      ) : single ? (
        <img className="single-photo" src={publicUrl(items[0].path)} alt={items[0].caption || items[0].name} />
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
          {items.map((it, i) => (
            <div key={it.path} data-id={it.path} className="photo" style={{ '--i': Math.min(i, 17) }}>
              <button className="photo-open" onClick={() => open(it.path)} aria-label={`Open ${it.name}`}>
                <img className="fade" onLoad={fadeIn} onError={fadeIn} src={publicUrl(isVideo(it) ? it.poster : it.path)} alt={it.name} loading="lazy" decoding="async" draggable={false} />
                {isVideo(it) && <span className="clip"><Icon name="play" size={13} /> {clock(it.duration)}</span>}
              </button>
              <Heart className="corner" on={liked.has(it.id)} onToggle={() => toggle(it)} />
            </div>
          ))}
        </div>
      )}

      {single && items[0].caption && <p className="caption">{items[0].caption}</p>}

      <footer className="shareview-foot">
        {share.allow_uploads && (
          <button className="secondary add-photos" onClick={startAdding} disabled={!!adding || !!waiting}>
            {!waiting && <Icon name="plus" size={20} />} {adding ?? addLabel}
          </button>
        )}
        {error && <p className="preview-error" role="alert">{error}</p>}
        Made with <a href="/">Hugpix</a>
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

      <Sheet open={signingIn && !session} onClose={() => setSigningIn(false)} title="Sign in" modal>
        <SignIn intro="Sign in to add your photos or leave a note. Anyone can look without signing in." />
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
            <button className="icon-btn" onClick={close} aria-label="Close photo">
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
          <div className="viewer-notes">
            {/* This photo's own place, when it differs from the page's. */}
            {viewed.place && viewed.place !== share.place?.name && (
              <p className="note centre place-note"><Icon name="pin" size={13} /> {viewed.place}</p>
            )}
            {viewed.caption && <p className="caption">{viewed.caption}</p>}
            {extras && (
              <>
                {extras.comments.filter((c) => c.item_id === viewed.id).length > 0 && (
                  <ul className="comment-list">
                    {extras.comments.filter((c) => c.item_id === viewed.id).map((c) => (
                      <li key={c.id}><p><b>{c.author || 'You'}</b> {c.body}</p></li>
                    ))}
                  </ul>
                )}
                {!session ? (
                  <button className="pill-btn" onClick={() => setSigningIn(true)}>Sign in to leave a note</button>
                ) : rights && !rights.comment ? (
                  <p className="note">You can no longer leave notes on this album.</p>
                ) : (
                  <form
                    className="comment-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      comment(viewed)
                    }}
                  >
                    <input
                      className="caption-input" value={draft} onChange={(e) => setDraft(e.target.value)}
                      placeholder="Leave a note about this photo" maxLength={600} enterKeyHint="send" aria-label="Note"
                    />
                    <button className="pill-btn" disabled={sending || !draft.trim()}>{sending ? 'Sending' : 'Send'}</button>
                  </form>
                )}
                {error && <p className="preview-error" role="alert">{error}</p>}
              </>
            )}
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
