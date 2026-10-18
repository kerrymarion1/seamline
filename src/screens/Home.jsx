import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import {
  AlbumName, AlbumsInvite, ago, CoverCycle, Dock, Editorial, leadOf, Mosaic, News, openAlbum, Stack, Who,
} from '../components/HomeLayouts'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import NotifyNudge from '../components/NotifyNudge'
import PeoplePicker from '../components/PeoplePicker'
import SeasonDecor from '../components/SeasonDecor'
import Sheet from '../components/Sheet'
import StripView from '../components/StripView'
import { FormatPicker, Stepper, TemplateThumb } from '../editor/panels'
import { MAX_SPOTS, templatesFor } from '../lib/cells'
import { greeting, newsSince, rememberNow } from '../lib/activity'
import { useCloud, usePinned, userName } from '../lib/cloud'
import { usePeople } from '../lib/people'
import { announceAlbum } from '../lib/push'
import { countText, isVideo } from '../lib/images'
import { fadeIn } from '../lib/motion'
import { FRAME_W, frameH, FORMATS } from '../lib/scene'
import { useActiveSeason, useLayout } from '../lib/theme'
import { lastUpload, createAlbum, createProject, deleteProject, duplicateProject, fillEmptySpots, useStore } from '../lib/store'

// A collage's thumbnail is fitted inside this box.
const THUMB_W = 124
const THUMB_H = 140

// The Classic layout: the newest album leads as one wide cover; the rest follow in a grid.
function AlbumCard({ album, images, featured, index, pinned }) {
  // The leading cover keeps two photos at the side and cycles the rest in the
  // large spot, or holds the pinned photo there.
  const lead = featured ? leadOf(album, images, pinned) : null
  const ids = lead ? lead.ids : album.imageIds.filter((id) => images[id])
  const cycle = lead?.cycle ?? null
  return (
    <button
      className={`album-card ${featured ? 'featured' : ''}`}
      style={{ '--i': Math.min(index, 8) }}
      data-album={album.id}
      // The card zooms out to become the album's own screen.
      onClick={(e) => openAlbum(album, e.currentTarget)}
    >
      <span className="album-cover">
        {cycle && <CoverCycle key={cycle.join()} urls={cycle} />}
        {ids.slice(cycle ? 1 : 0, featured ? 3 : 4).map((id) => (
          <img key={id} className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
        ))}
        {ids.length === 0 && <Icon name="photo" size={featured ? 36 : 28} />}
      </span>
      <div className="album-caption">
        {featured && <span className="eyebrow">{pinned && ids[0] === pinned ? 'Pinned' : 'Latest'}</span>}
        <h3><AlbumName album={album} /></h3>
        <p>
          {countText(ids.map((id) => images[id]))}
          {featured && ids.length > 0 && ` · added ${ago(lastUpload(album))}`}
        </p>
      </div>
      {featured && <span className="open-pill" aria-hidden="true">Open <Icon name="back" size={14} /></span>}
    </button>
  )
}

function Albums({ albums, images, onNew, pinned }) {
  if (!albums.length) return <AlbumsInvite onNew={onNew} />
  return (
    <div className="album-grid">
      {albums.map((a, i) => (
        <AlbumCard key={a.id} album={a} images={images} featured={i === 0} index={i} pinned={pinned} />
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
  const layout = useLayout()
  useActiveSeason() // redraws with the season's greeting when it changes
  const [namingAlbum, setNamingAlbum] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [creating, setCreating] = useState(false)
  const [choosing, setChoosing] = useState(false) // the dock's New: album or collage
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
  const stats = albums.length || projects.length
    ? [
        say(albums.length, 'album'), say(kept.length - clips, 'photo'), clips && say(clips, 'video'),
        say(projects.length, 'collage'),
      ].filter(Boolean)
    : ['Albums and collages']
  const summary = stats.join(' · ')

  const signedInAs = userName(session)
  const first = signedInAs ? signedInAs.split(' ')[0] : ''
  // What visitors have done since the app was last opened here.
  // People waiting for the admin's approval lead, whenever there are any.
  const { requests } = cloud
  const asking = requests.length === 0 ? [] : [{
    key: 'requests',
    to: '/settings',
    text: requests.length === 1
      ? `${(requests[0].name || requests[0].email).split(' ')[0]} is waiting for approval`
      : `${requests.length} people are waiting for approval`,
  }]
  const news = [...asking, ...(cloud.activityLoaded ? newsSince(cloud, albums, images) : [])]
  useEffect(() => {
    if (cloud.activityLoaded) rememberNow(cloud)
  }, [cloud])
  const hello = first ? `${greeting()}, ${first}` : greeting()
  // The album something was added to most recently leads; the rest follow in
  // the same order. A pinned photo's album leads instead, while that photo is
  // still in it.
  const pin = usePinned()
  const pinnedAlbum = pin && images[pin.image] && albums.find((a) => a.id === pin.album && a.imageIds.includes(pin.image))
  const pinned = pinnedAlbum ? pin.image : null
  const byLatest = [...albums].sort((a, b) => lastUpload(b) - lastUpload(a))
  const latestFirst = pinnedAlbum ? [pinnedAlbum, ...byLatest.filter((a) => a !== pinnedAlbum)] : byLatest
  const heroId = pinned ?? latestFirst[0]?.imageIds.find((id) => images[id])
  const heroUrl = heroId && images[heroId].previewUrl

  // A new album is everyone's, or secret: only the people chosen (and the
  // admin) ever see it.
  const [secret, setSecret] = useState(false)
  const [chosenPeople, setChosenPeople] = useState([])
  const people = usePeople()
  const me = session?.user.id

  const makeAlbum = () => {
    const a = createAlbum(albumName, me, secret ? [me, ...chosenPeople.filter((id) => id !== me)] : null)
    // Everyone else hears about it, or just its own people when it is secret.
    // (The share sheet's new albums don't: the photos added to them straight
    // away are told instead.)
    announceAlbum(a)
    setNamingAlbum(false)
    setAlbumName('')
    setSecret(false)
    setChosenPeople([])
    navigate(`/album/${a.id}`)
  }

  // A guest sees the albums, adds to them and makes their own; no collages.
  const { guest } = cloud
  // Stack and Mosaic have a dock at the foot that jumps between the albums and
  // the collages further down, and shows which of the two is in view.
  const docked = !guest && (layout === 'stack' || layout === 'mosaic')
  const body = useRef(null)
  const shelf = useRef(null)
  const [inView, setInView] = useState('albums')
  const onScroll = () => {
    const b = body.current
    const top = b.getBoundingClientRect().top
    const atEnd = b.scrollTop > 0 && b.scrollTop + b.clientHeight >= b.scrollHeight - 4
    const past = b.scrollTop > 0 && shelf.current.getBoundingClientRect().top < top + b.clientHeight / 2
    setInView(atEnd || past ? 'collages' : 'albums')
  }
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  const toCollages = () => shelf.current.scrollIntoView({ behavior, block: 'start' })
  const toAlbums = () => body.current.scrollTo({ top: 0, behavior })

  const shared = {
    albums: latestFirst, images, who: signedInAs, greet: greeting(), first, news, pinned,
    onNewAlbum: () => setNamingAlbum(true),
  }

  return (
    <div className={`screen home ambient home-${layout}`}>
      <SeasonDecor />
      {layout === 'classic' && (
        <>
          <div className="hero-wash" style={heroUrl ? { backgroundImage: `url("${heroUrl}")` } : undefined} aria-hidden="true" />
          <header className="home-head">
            <Logo />
            <Who name={signedInAs} />
          </header>
          <section className="home-intro">
            <p className="greeting">{hello}</p>
            {news.length > 0 ? <News news={news} /> : <p className="home-sub">{summary}</p>}
          </section>
        </>
      )}
      {saveFailed && (
        <p className="banner" role="alert">
          Changes are not being saved on this device. Storage may be full or blocked (private browsing).
        </p>
      )}

      <main className="home-body" ref={body} onScroll={docked ? onScroll : undefined}>
        {layout === 'classic' ? (
          <section>
            <div className="section-head">
              <h2>Albums{albums.length > 0 && <span className="count">{albums.length}</span>}</h2>
              {albums.length > 0 && (
                <button className="pill-btn" onClick={() => setNamingAlbum(true)}>
                  <Icon name="plus" size={16} /> New
                </button>
              )}
            </div>
            <Albums albums={latestFirst} images={images} onNew={shared.onNewAlbum} pinned={pinned} />
          </section>
        ) : (
          <div className="home-layout">
            {layout === 'editorial' && <Editorial {...shared} stats={stats} onCollages={guest ? null : toCollages} />}
            {layout === 'stack' && <Stack {...shared} summary={summary} />}
            {layout === 'mosaic' && (
              <Mosaic {...shared} collageCount={guest ? 0 : projects.length} onCollages={toCollages} />
            )}
          </div>
        )}

        {!guest && <section ref={shelf} className="collages">
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
        </section>}
      </main>

      {docked && (
        <Dock on={inView} onAlbums={toAlbums} onCollages={toCollages} onNew={() => setChoosing(true)} icons={layout === 'mosaic'} />
      )}
      {/* New here, or notifications still off on this device: ask once in a while. */}
      <NotifyNudge raised={docked} />

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="New" modal>
        <div className="new-choice">
          <button onClick={() => { setChoosing(false); setNamingAlbum(true) }}>
            <Icon name="photo" size={26} />
            <b>Album</b>
            <span>A pool of photos and videos</span>
          </button>
          <button onClick={() => { setChoosing(false); setCreating(true) }}>
            <Icon name="layout" size={26} />
            <b>Collage</b>
            <span>Photos laid out on one page</span>
          </button>
        </div>
      </Sheet>

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
          onKeyDown={(e) => e.key === 'Enter' && !secret && makeAlbum()}
        />
        {cloud.features.secret && (
          <>
            <div className="chips" role="radiogroup" aria-label="Who can see it">
              <button role="radio" aria-checked={!secret} className={`chip small ${secret ? '' : 'on'}`} onClick={() => setSecret(false)}>
                Everyone
              </button>
              <button role="radio" aria-checked={secret} className={`chip small ${secret ? 'on' : ''}`} onClick={() => setSecret(true)}>
                <Icon name="lock" size={14} /> Only people I choose
              </button>
            </div>
            {secret && (
              <>
                <PeoplePicker
                  people={people.filter((p) => p.id !== me)}
                  value={chosenPeople}
                  onChange={setChosenPeople}
                  placeholder="Who's in it? Type a name"
                />
                <p className="note">A secret album: only you and the people you choose can see it, add to it or hear about it.</p>
              </>
            )}
          </>
        )}
        <button className="primary block" onClick={makeAlbum}>{secret ? 'Create secret album' : 'Create album'}</button>
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
