import { useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import StripView from '../components/StripView'
import { FormatPicker, Stepper, TemplateThumb } from '../editor/panels'
import { MAX_SPOTS, templatesFor } from '../lib/cells'
import { frameH, FORMATS, MAX_FRAMES, MIN_FRAMES } from '../lib/scene'
import { createAlbum, createProject, deleteProject, duplicateProject, fillEmptySpots, useStore } from '../lib/store'

const THUMB_H = 132

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function EmptyState({ onNew }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <i /><i /><i />
        <b />
      </div>
      <h2>One photo, many frames</h2>
      <p>Lay your photos across a strip and Seamline slices it into a seamless carousel.</p>
      <button className="primary" onClick={onNew}>
        <Icon name="plus" size={20} /> New carousel
      </button>
    </div>
  )
}

function Albums({ albums, images, onNew }) {
  if (!albums.length) {
    return (
      <div className="empty">
        <div className="pool-art" aria-hidden="true"><i /><i /><i /><i /></div>
        <h2>Keep a pool of photos</h2>
        <p>Albums hold photos inside the app, ready to drop into any carousel or save back to your phone.</p>
        <button className="primary" onClick={onNew}>
          <Icon name="plus" size={20} /> New album
        </button>
      </div>
    )
  }
  return (
    <main className="project-list">
      <div className="album-grid">
        {albums.map((a) => {
          const ids = a.imageIds.filter((id) => images[id])
          return (
            <button key={a.id} className="album-card" onClick={() => navigate(`/album/${a.id}`)}>
              <span className="album-cover">
                {ids.slice(0, 4).map((id) => (
                  <img key={id} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                ))}
              </span>
              <h3>{a.name}</h3>
              <p>{ids.length} photo{ids.length === 1 ? '' : 's'}</p>
            </button>
          )
        })}
      </div>
      <button className="primary fab" onClick={onNew}>
        <Icon name="plus" size={20} /> New album
      </button>
    </main>
  )
}

export default function Home({ tab }) {
  const projects = useStore((s) => s.projects)
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const saveFailed = useStore((s) => s.saveFailed)
  const [namingAlbum, setNamingAlbum] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [frames, setFrames] = useState(3)
  const [format, setFormat] = useState(FORMATS[0])
  const presets = useStore((s) => s.presets)
  const [fillFrom, setFillFrom] = useState(null) // album whose photos fill the new layout
  const fillable = albums.filter((a) => a.imageIds.some((id) => images[id]))
  // Photo count follows the frame count until it is set by hand.
  const [photos, setPhotos] = useState(null)
  const [template, setTemplate] = useState(null)
  const count = photos ?? frames
  const templates = templatesFor(frames, count)
  // A layout picked for other numbers may not exist for these ones.
  const chosen = templates.find((t) => t.id === template)
  const [doomed, setDoomed] = useState(null)

  const create = (preset) => {
    const p = createProject({ name, frames, format: format.id, template: chosen?.id, count, preset })
    const source = fillable.find((a) => a.id === fillFrom)
    if (source) fillEmptySpots(p.id, source.imageIds.filter((id) => images[id]))
    setFillFrom(null)
    setCreating(false)
    setName('')
    setPhotos(null)
    setTemplate(null)
    navigate(`/p/${p.id}`)
  }

  const makeAlbum = () => {
    const a = createAlbum(albumName)
    setNamingAlbum(false)
    setAlbumName('')
    navigate(`/album/${a.id}`)
  }

  return (
    <div className="screen home">
      <header className="home-head">
        <h1>Seamline</h1>
        <nav className="tabs">
          <button className={tab === 'projects' ? 'on' : ''} onClick={() => navigate('/', { replace: true })}>
            Projects
          </button>
          <button className={tab === 'albums' ? 'on' : ''} onClick={() => navigate('/albums', { replace: true })}>
            Albums
          </button>
        </nav>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings">
          <Icon name="gear" size={22} />
        </button>
      </header>
      {saveFailed && (
        <p className="banner" role="alert">
          Changes are not being saved on this device. Storage may be full or blocked (private browsing).
        </p>
      )}

      {tab === 'albums' ? (
        <Albums albums={albums} images={images} onNew={() => setNamingAlbum(true)} />
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => setCreating(true)} />
      ) : (
        <main className="project-list">
          {projects.map((p) => (
            <article key={p.id} className="card">
              <button className="card-open" onClick={() => navigate(`/p/${p.id}`)} aria-label={`Open ${p.name}`}>
                <div className="card-thumb" style={{ height: THUMB_H }}>
                  <StripView project={p} scale={THUMB_H / frameH(p)} />
                </div>
              </button>
              <div className="card-meta">
                <div>
                  <h3>{p.name}</h3>
                  <p>{p.frames === 1 ? 'Single image' : `${p.frames} frames`} · {ago(p.updatedAt)}</p>
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
          <button className="primary fab" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} /> New carousel
          </button>
        </main>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New carousel" modal>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          enterKeyHint="done"
        />
        <div className="row">
          <div>
            <div className="label">Frames</div>
            <div className="hint">{frames === 1 ? 'One image, good for Facebook' : 'Slides to swipe, not photos'}</div>
          </div>
          <Stepper value={frames} min={MIN_FRAMES} max={MAX_FRAMES} onChange={setFrames} />
        </div>
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

      <Sheet open={!!doomed} onClose={() => setDoomed(null)} title="Delete carousel?" modal>
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
