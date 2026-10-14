import { useEffect, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import Sheet from '../components/Sheet'
import StripView from '../components/StripView'
import { FormatPicker, Stepper, TemplateThumb } from '../editor/panels'
import { MAX_SPOTS, templatesFor } from '../lib/cells'
import { greeting, newsSince, rememberNow } from '../lib/activity'
import { useCloud, userName } from '../lib/cloud'
import { countText, isVideo } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { FRAME_W, frameH, FORMATS } from '../lib/scene'
import { lastUpload, createAlbum, createProject, deleteProject, duplicateProject, fillEmptySpots, useStore } from '../lib/store'

// A collage's thumbnail is fitted inside this box.
const THUMB_W = 124
const THUMB_H = 140

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const COVER_SECONDS = 4.5

// The large picture on the leading album: it moves slowly through the album's
// photos, each fading in over the last. `urls` are the pictures to show in turn.
function CoverCycle({ urls }) {
  const [step, setStep] = useState(0)
  const moving = urls.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!moving) return
    const t = setInterval(() => !document.hidden && setStep((s) => s + 1), COVER_SECONDS * 1000)
    return () => clearInterval(t)
  }, [moving])
  const now = urls[step % urls.length]
  const before = step > 0 ? urls[(step - 1) % urls.length] : null
  return (
    <span className="cover-main">
      {before && <img key={`was-${step}`} src={before} alt="" draggable={false} />}
      <img key={step} className={moving ? 'drift' : undefined} src={now} alt="" draggable={false} />
    </span>
  )
}

// The newest album leads as one wide cover; the rest follow in a grid.
function AlbumCard({ album, images, featured, index }) {
  const ids = album.imageIds.filter((id) => images[id])
  // The leading cover keeps two photos at the side and cycles the rest in the large spot.
  const cycle = featured && ids.length > 0 ? [ids[0], ...ids.slice(3, 9)].map((id) => images[id].previewUrl) : null
  return (
    <button
      className={`album-card ${featured ? 'featured' : ''}`}
      style={{ '--i': Math.min(index, 8) }}
      data-album={album.id}
      // The card zooms out to become the album's own screen.
      onClick={(e) => {
        const card = e.currentTarget
        morph(() => navigate(`/album/${album.id}`, { animate: false }), {
          name: 'album', from: () => card, to: () => document.querySelector('.screen.album'),
        })
      }}
    >
      <span className="album-cover">
        {cycle && <CoverCycle key={cycle.join()} urls={cycle} />}
        {ids.slice(cycle ? 1 : 0, featured ? 3 : 4).map((id) => (
          <img key={id} className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
        ))}
        {ids.length === 0 && <Icon name="photo" size={featured ? 36 : 28} />}
      </span>
      <div className="album-caption">
        {featured && <span className="eyebrow">Latest</span>}
        <h3>{album.name}</h3>
        <p>
          {countText(ids.map((id) => images[id]))}
          {featured && ids.length > 0 && ` · added ${ago(lastUpload(album))}`}
        </p>
      </div>
      {featured && <span className="open-pill" aria-hidden="true">Open <Icon name="back" size={14} /></span>}
    </button>
  )
}

function Albums({ albums, images, onNew }) {
  if (!albums.length) {
    return (
      <div className="invite">
        <div className="pool-art" aria-hidden="true"><i /><i /><i /><i /></div>
        <h3>Keep a pool of photos</h3>
        <p>Albums hold photos inside the app, ready to drop into any collage or save back to your phone.</p>
        <button className="primary" onClick={onNew}>
          <Icon name="plus" size={20} /> New album
        </button>
      </div>
    )
  }
  return (
    <div className="album-grid">
      {albums.map((a, i) => (
        <AlbumCard key={a.id} album={a} images={images} featured={i === 0} index={i} />
      ))}
    </div>
  )
}

export default function Home() {
  const projects = useStore((s) => s.projects)
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const saveFailed = useStore((s) => s.saveFailed)
  const cloud = useCloud()
  const { session } = cloud
  const [namingAlbum, setNamingAlbum] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const frames = 1 // a collage is a single page
  const [format, setFormat] = useState(FORMATS[0])
  const presets = useStore((s) => s.presets)
  const [fillFrom, setFillFrom] = useState(null) // album whose photos fill the new layout
  const isPhoto = (id) => images[id] && !isVideo(images[id])
  const fillable = albums.filter((a) => a.imageIds.some(isPhoto))
  // Four photos until the number is set by hand.
  const [photos, setPhotos] = useState(null)
  const [template, setTemplate] = useState(null)
  const count = photos ?? 4
  const templates = templatesFor(frames, count)
  // A layout picked for other numbers may not exist for these ones.
  const chosen = templates.find((t) => t.id === template)
  const [doomed, setDoomed] = useState(null)

  const create = (preset) => {
    const p = createProject({ name, format: format.id, template: chosen?.id, count, preset })
    const source = fillable.find((a) => a.id === fillFrom)
    if (source) fillEmptySpots(p.id, source.imageIds.filter(isPhoto))
    setFillFrom(null)
    setCreating(false)
    setName('')
    setPhotos(null)
    setTemplate(null)
    navigate(`/p/${p.id}`)
  }

  // "3 albums · 41 photos · 2 collages", under the logo.
  const say = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const kept = [...new Set(albums.flatMap((a) => a.imageIds.filter((id) => images[id])))]
  const clips = kept.filter((id) => isVideo(images[id])).length
  const summary = albums.length || projects.length
    ? [
        say(albums.length, 'album'), say(kept.length - clips, 'photo'), clips && say(clips, 'video'),
        say(projects.length, 'collage'),
      ].filter(Boolean).join(' · ')
    : 'Albums and collages'

  const signedInAs = userName(session)
  // What visitors have done since the app was last opened here.
  const news = cloud.activityLoaded ? newsSince(cloud, albums) : []
  useEffect(() => {
    if (cloud.activityLoaded) rememberNow(cloud)
  }, [cloud])
  const hello = signedInAs ? `${greeting()}, ${signedInAs.split(' ')[0]}` : greeting()
  // The album something was added to most recently leads; the rest follow in the same order.
  const latestFirst = [...albums].sort((a, b) => lastUpload(b) - lastUpload(a))
  const heroId = latestFirst[0]?.imageIds.find((id) => images[id])
  const heroUrl = heroId && images[heroId].previewUrl

  const makeAlbum = () => {
    const a = createAlbum(albumName)
    setNamingAlbum(false)
    setAlbumName('')
    navigate(`/album/${a.id}`)
  }

  return (
    <div className="screen home ambient">
      <div className="hero-wash" style={heroUrl ? { backgroundImage: `url("${heroUrl}")` } : undefined} aria-hidden="true" />
      <header className="home-head">
        <Logo />
        {/* Who is signed in; the whole thing opens Settings. */}
        <button className="who" onClick={() => navigate('/settings')} aria-label={signedInAs ? `Settings, signed in as ${signedInAs}` : 'Settings'}>
          {signedInAs && <i aria-hidden="true">{signedInAs[0].toUpperCase()}</i>}
          {signedInAs && <span>{signedInAs}</span>}
          <Icon name="gear" size={20} />
        </button>
      </header>
      <section className="home-intro">
        <p className="greeting">{hello}</p>
        {news.length > 0 ? (
          <div className="news">
            <i className="pulse" aria-hidden="true" />
            {news.map((n) => (
              <button key={n.key} disabled={!n.albumId} onClick={() => navigate(`/album/${n.albumId}`)}>{n.text}</button>
            ))}
          </div>
        ) : (
          <p className="home-sub">{summary}</p>
        )}
      </section>
      {saveFailed && (
        <p className="banner" role="alert">
          Changes are not being saved on this device. Storage may be full or blocked (private browsing).
        </p>
      )}

      <main className="home-body">
        <section>
          <div className="section-head">
            <h2>Albums{albums.length > 0 && <span className="count">{albums.length}</span>}</h2>
            {albums.length > 0 && (
              <button className="pill-btn" onClick={() => setNamingAlbum(true)}>
                <Icon name="plus" size={16} /> New
              </button>
            )}
          </div>
          <Albums albums={latestFirst} images={images} onNew={() => setNamingAlbum(true)} />
        </section>

        <section>
          <div className="section-head">
            <h2>Collages{projects.length > 0 && <span className="count">{projects.length}</span>}</h2>
            <button className="pill-btn" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> New
            </button>
          </div>
          {/* With none yet, the New button above is all there is; no empty box. */}
          {projects.length === 0 ? null : (
            <div className="shelf">
              {projects.map((p) => (
                <article key={p.id} className="card">
                  <button className="card-open" onClick={() => navigate(`/p/${p.id}`)} aria-label={`Open ${p.name}`}>
                    <div className="card-thumb" style={{ height: THUMB_H }}>
                      <StripView project={p} scale={Math.min(THUMB_W / FRAME_W, THUMB_H / frameH(p))} />
                    </div>
                  </button>
                  <div className="card-meta">
                    <div>
                      <h3>{p.name}</h3>
                      <p>{p.frames > 1 && `${p.frames} frames · `}{ago(p.updatedAt)}</p>
                    </div>
                    <button className="icon-btn" onClick={() => duplicateProject(p.id)} aria-label={`Duplicate ${p.name}`}>
                      <Icon name="copy" size={20} />
                    </button>
                    <button className="icon-btn" onClick={() => setDoomed(p)} aria-label={`Delete ${p.name}`}>
                      <Icon name="trash" size={20} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New collage" modal>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          enterKeyHint="done"
        />
        <div className="row">
          <div className="label">Shape</div>
          <FormatPicker value={format.h} onChange={setFormat} />
        </div>
        <div className="row">
          <div>
            <div className="label">Photos</div>
            <div className="hint">Spots in the layout</div>
          </div>
          <Stepper value={count} min={1} max={MAX_SPOTS} onChange={setPhotos} />
        </div>
        <div className="label">Layout</div>
        <div className="templates">
          <button className={`tpl ${chosen ? '' : 'on'}`} onClick={() => setTemplate(null)}>
            <span className="tpl-art none" style={{ width: 40, height: 50 }} />
            <span>Freeform</span>
          </button>
          {templates.map((t) => (
            <button key={t.id} className={`tpl ${chosen === t ? 'on' : ''}`} onClick={() => setTemplate(t.id)}>
              <TemplateThumb template={t} frames={frames} count={count} ratio={format.h / 1080} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
        {fillable.length > 0 && (
          <>
            <div className="label">Fill from album</div>
            <div className="chips">
              <button className={`chip ${fillFrom ? '' : 'on'}`} onClick={() => setFillFrom(null)}>Empty</button>
              {fillable.map((a) => (
                <button key={a.id} className={`chip ${fillFrom === a.id ? 'on' : ''}`} onClick={() => setFillFrom(a.id)}>
                  {a.name}
                </button>
              ))}
            </div>
          </>
        )}
        {presets.length > 0 && (
          <>
            <div className="label">Or start from your template</div>
            <div className="templates">
              {presets.map((t) => (
                <button key={t.id} className="tpl" onClick={() => create(t)}>
                  <span className="preset-art"><StripView project={t} scale={50 / t.frameH} /></span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <button className="primary block" onClick={() => create()}>Create</button>
      </Sheet>

      <Sheet open={namingAlbum} onClose={() => setNamingAlbum(false)} title="New album" modal>
        <input
          className="field"
          value={albumName}
          onChange={(e) => setAlbumName(e.target.value)}
          placeholder="Album name"
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && makeAlbum()}
        />
        <button className="primary block" onClick={makeAlbum}>Create album</button>
      </Sheet>

      <Sheet open={!!doomed} onClose={() => setDoomed(null)} title="Delete collage?" modal>
        <p className="hint">“{doomed?.name}” will be removed from this device. This cannot be undone.</p>
        <button
          className="primary block danger"
          onClick={() => {
            deleteProject(doomed.id)
            setDoomed(null)
          }}
        >
          Delete
        </button>
      </Sheet>
    </div>
  )
}
