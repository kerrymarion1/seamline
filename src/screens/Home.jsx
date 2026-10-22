import { useEffect, useState } from 'react'
import { navigate } from '../App'
import {
  AlbumName, AlbumsInvite, ago, CoverCycle, CoverLine, cycleKey, Editorial, focusStyle, Greet, leadOf, Mosaic, News, openAlbum, openBanner, photosOf,
  Stack, Who,
} from '../components/HomeLayouts'
import AlbumChooser from '../components/AlbumChooser'
import AlbumPhotoPicker from '../components/AlbumPhotoPicker'
import Avatar from '../components/Avatar'
import Camera from '../components/Camera'
import CoverFramer from '../components/CoverFramer'
import Icon from '../components/Icon'
import LiveNow from '../components/LiveNow'
import Logo from '../components/Logo'
import NotifyNudge from '../components/NotifyNudge'
import PeoplePicker from '../components/PeoplePicker'
import SeasonDecor from '../components/SeasonDecor'
import Sheet from '../components/Sheet'
import { greeting, newsSince, rememberNow } from '../lib/activity'
import { favouritePhotos, refreshFavourites, useReactionCounts } from '../lib/collections'
import { me as adder, setPinned, useCloud, useCovers, usePinned, userName } from '../lib/cloud'
import { countText, importMedia, isVideo } from '../lib/images'
import { fadeIn } from '../lib/motion'
import { adderOf, usePeople } from '../lib/people'
import { albumSpot } from '../lib/places'
import { announceAlbum, announceUpload } from '../lib/push'
import { celebrateAdded } from '../lib/feedback'
import { SEASONS, useActiveSeason, useLayout } from '../lib/theme'
import { addedAt, addImages, addToAlbum, createAlbum, lastUpload, setCoverFocus, useStore } from '../lib/store'
import { ensureLocal } from '../lib/sync'

// The Classic layout: the newest album leads as one wide cover; the rest follow in a grid.
function AlbumCard({ album, images, featured, index }) {
  // The leading cover keeps two photos at the side and cycles the rest in the
  // large spot, or holds the album's chosen cover there.
  const lead = featured ? leadOf(album, images) : null
  const ids = lead ? lead.ids : photosOf(album, images)
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
        {cycle && <CoverCycle key={cycleKey(cycle)} pics={cycle} />}
        {ids.slice(cycle ? 1 : 0, featured ? 3 : 4).map((id) => (
          <img
            key={id} className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} style={focusStyle(album, id)}
            alt="" loading="lazy" decoding="async" draggable={false}
          />
        ))}
        {ids.length === 0 && <Icon name="photo" size={featured ? 36 : 28} />}
      </span>
      <div className="album-caption">
        {featured && <span className="eyebrow">Latest</span>}
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

// With a pinned photo, it leads as a wide picture on its own and every album
// follows as an ordinary card.
function Albums({ albums, images, onNew, banner }) {
  if (!albums.length && !banner) return <AlbumsInvite onNew={onNew} />
  return (
    <div className="album-grid">
      {banner && (
        <button className="album-card featured banner-card" onClick={() => openBanner(banner)} aria-label="Open the pinned photo">
          <span className="album-cover"><img src={banner.pic.url} style={banner.pic.style} alt="" draggable={false} /></span>
        </button>
      )}
      {albums.map((a, i) => (
        <AlbumCard key={a.id} album={a} images={images} featured={!banner && i === 0} index={i} />
      ))}
    </div>
  )
}

// The end of the page: the latest photos and videos from every album, newest
// first, each with who added it and where. A tap opens it in its album.
function NewestPhotos({ albums, images }) {
  const people = usePeople()
  const seen = new Set()
  const newest = []
  for (const album of albums) {
    for (const id of album.imageIds) {
      if (!images[id] || seen.has(id)) continue
      seen.add(id)
      newest.push({ id, album, at: addedAt(id) })
    }
  }
  newest.sort((a, b) => b.at - a.at)
  const shown = newest.slice(0, 24)
  if (!shown.length) return null
  return (
    <section className="newest">
      <div className="section-head"><h2>Newest photos</h2></div>
      <div className="newest-row">
        {shown.map(({ id, album }, i) => {
          const by = (adderOf(people, album.addedBy?.[id])?.name ?? '').split(' ')[0]
          return (
            <button key={id} className="newest-tile" style={{ '--i': i }} onClick={() => navigate(`/album/${album.id}?photo=${encodeURIComponent(id)}`)}>
              <img className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
              {isVideo(images[id]) && <span className="newest-clip"><Icon name="play" size={12} /></span>}
              <span className="newest-label">
                {by && <b className="newest-by"><Avatar person={adderOf(people, album.addedBy[id])} size={18} />{by}</b>}
                <small><AlbumName album={album} /></small>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// After the newest: the family's favourites, the most loved first, and the
// way to all of them.
function FavouritePhotos({ albums, images }) {
  const { hearts, features } = useCloud()
  const reactionCounts = useReactionCounts()
  useEffect(() => {
    refreshFavourites().catch(() => {})
  }, [])
  const items = features.social ? favouritePhotos(albums, images, reactionCounts, hearts.byItem) : []
  if (!items.length) return null
  return (
    <section className="newest">
      <div className="section-head">
        <h2>Favourites<span className="count">{items.length}</span></h2>
        <button className="pill-btn" onClick={() => navigate('/favourites')}>See all</button>
      </div>
      <div className="newest-row">
        {items.slice(0, 24).map(({ id, album, score }, i) => (
          <button key={id} className="newest-tile" style={{ '--i': i }} onClick={() => navigate(`/album/${album.id}?photo=${encodeURIComponent(id)}`)}>
            <img className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
            {isVideo(images[id]) && <span className="newest-clip"><Icon name="play" size={12} /></span>}
            <span className="newest-label">
              <b className="newest-score"><Icon name="heart" size={12} /> {score}</b>
              <small><AlbumName album={album} /></small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

const THUMB = 48 // the glimpse of the map, in pixels, square

// A glimpse of the map for the Places card: OpenStreetMap's tiles around the
// middle of everything placed, as close in as still shows every album, with
// a dot for each. Darkened like the map itself (see .places-thumb in styles.css).
function MapThumb({ spots }) {
  // Web Mercator: a point's pixel on a world 256·2^z pixels across.
  const px = (lat, lng, z) => {
    const n = 256 * 2 ** z
    const r = (lat * Math.PI) / 180
    return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n]
  }
  // Zoom out from town level until every dot fits.
  const room = THUMB / 2 - 5
  let z = 10
  let mid
  for (;;) {
    const pts = spots.map(([lat, lng]) => px(lat, lng, z))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    if (z === 1 || pts.every((p) => Math.abs(p[0] - mid[0]) <= room && Math.abs(p[1] - mid[1]) <= room)) break
    z--
  }
  const n = 2 ** z
  const left = mid[0] - THUMB / 2
  const top = mid[1] - THUMB / 2
  const tiles = []
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + THUMB - 1) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + THUMB - 1) / 256); ty++) {
      if (ty < 0 || ty >= n) continue
      tiles.push({ key: `${tx},${ty}`, url: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, x: tx * 256 - left, y: ty * 256 - top })
    }
  }
  const dots = spots.map(([lat, lng]) => {
    const [x, y] = px(lat, lng, z)
    return { x: x - left, y: y - top }
  })
  return (
    <span className="places-thumb" aria-hidden="true">
      {tiles.map((t) => <img key={t.key} src={t.url} alt="" style={{ left: t.x, top: t.y }} loading="lazy" draggable={false} />)}
      {dots.map((d, i) => <i key={i} style={{ left: d.x, top: d.y }} />)}
    </span>
  )
}

// The very end: the way to the map of where the albums were, with a glimpse of it.
function PlacesCard({ albums }) {
  const spots = albums.map(albumSpot).filter(Boolean)
  if (!albums.length) return null
  return (
    <section>
      <button className="places-card" onClick={() => navigate('/map')}>
        {spots.length ? <MapThumb spots={spots} /> : <span className="places-icon"><Icon name="pin" size={22} /></span>}
        <span className="places-text">
          <b>Places</b>
          <small>{spots.length ? `${spots.length} album${spots.length === 1 ? '' : 's'} on the map · © OpenStreetMap` : 'Put your albums on a map'}</small>
        </span>
        <span className="places-go" aria-hidden="true"><Icon name="back" size={16} /></span>
      </button>
    </section>
  )
}

export default function Home() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const saveFailed = useStore((s) => s.saveFailed)
  const cloud = useCloud()
  const { session } = cloud
  const layout = useLayout()
  const season = useActiveSeason() // redraws with the season's greeting when it changes
  const [namingAlbum, setNamingAlbum] = useState(false)
  // Hugpix's cover photo (the banner): any photo from any album, one for each
  // season, chosen here by a member, then framed, then kept for everyone.
  const coverFor = season ? SEASONS.find((s) => s.id === season)?.name ?? '' : ''
  const [choosingCover, setChoosingCover] = useState(false)
  const [framingCover, setFramingCover] = useState(null) // { album, id } chosen, being framed
  const onCover = !cloud.guest && cloud.features.pins ? () => setChoosingCover(true) : null
  const coverCount = useCovers().length // they take turns, one a visit
  // The camera: first which album (the last one used leads), then the camera.
  const [cameraFor, setCameraFor] = useState(null) // 'choose', or the album
  const lastCameraAlbum = () => {
    try {
      return localStorage.getItem('seamline:cameraAlbum')
    } catch {
      return null
    }
  }
  const sendFromCamera = async (file) => {
    const album = cameraFor
    const record = await importMedia(file)
    addImages([record])
    addToAlbum(album.id, [record.id], adder())
    announceUpload(album, [record])
    celebrateAdded(1)
    setCameraFor(null)
    navigate(`/album/${album.id}`)
  }
  const [albumName, setAlbumName] = useState('')

  // "3 albums · 41 photos · 2 videos", under the logo.
  const say = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const kept = [...new Set(albums.flatMap((a) => a.imageIds.filter((id) => images[id])))]
  const clips = kept.filter((id) => isVideo(images[id])).length
  const stats = albums.length
    ? [say(albums.length, 'album'), say(kept.length - clips, 'photo'), clips && say(clips, 'video')].filter(Boolean)
    : ['Albums of family photos']
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
  // The album something was added to most recently leads; the rest follow in
  // the same order. A pinned photo, while it is still in its album, is the
  // big picture on its own (see openBanner); its album keeps its usual place.
  const pin = usePinned()
  const pinnedAlbum = pin && images[pin.image] && albums.find((a) => a.id === pin.album && a.imageIds.includes(pin.image))
  const banner = pinnedAlbum
    ? {
        album: pinnedAlbum,
        id: pin.image,
        pic: {
          url: images[pin.image].previewUrl,
          // Framed as a cover, or else as it is for its album.
          style: pin.focus ? { objectPosition: `${pin.focus[0]}% ${pin.focus[1]}%` } : focusStyle(pinnedAlbum, pin.image),
        },
      }
    : null
  const latestFirst = [...albums].sort((a, b) => lastUpload(b) - lastUpload(a))
  const heroId = banner?.id ?? (latestFirst[0] && photosOf(latestFirst[0], images)[0])
  const heroUrl = heroId && images[heroId].previewUrl

  // Shown large, the big picture should be sharp: the ones this device holds
  // only a small copy of (added elsewhere) are fetched in full, once, and
  // kept (lib/sync.js). The pinned photo, the held cover, or the whole cycle.
  const lead = banner ? null : latestFirst[0]
  const large = lead ? leadOf(lead, images) : null
  const largeKey = banner ? banner.id : large ? (large.cycle?.length > 1 ? [large.ids[0], ...large.ids.slice(3, 9)] : large.ids.slice(0, 1)).join() : ''
  useEffect(() => {
    if (largeKey) ensureLocal(largeKey.split(','))
  }, [largeKey])

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

  const shared = {
    albums: latestFirst, images, who: signedInAs, greet: greeting(), first, news, banner, onCover, coverFor, coverCount,
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
            <p className="greeting"><Greet greet={greeting()} first={first} /></p>
            {news.length > 0 ? <News news={news} /> : <p className="home-sub">{summary}</p>}
            <LiveNow />
            <CoverLine onCover={onCover} coverFor={coverFor} count={coverCount} />
          </section>
        </>
      )}
      {saveFailed && (
        <p className="banner" role="alert">
          Changes are not being saved on this device. Storage may be full or blocked (private browsing).
        </p>
      )}

      <main className="home-body">
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
            <Albums albums={latestFirst} images={images} onNew={shared.onNewAlbum} banner={banner} />
          </section>
        ) : (
          <div className="home-layout">
            {layout === 'editorial' && <Editorial {...shared} stats={stats} />}
            {layout === 'stack' && <Stack {...shared} summary={summary} />}
            {layout === 'mosaic' && <Mosaic {...shared} />}
          </div>
        )}

        <NewestPhotos albums={latestFirst} images={images} />
        <FavouritePhotos albums={latestFirst} images={images} />
        <PlacesCard albums={latestFirst} />
      </main>

      {/* The cover photo: pick one from any album, frame it, and it is everyone's. */}
      <AlbumPhotoPicker
        open={choosingCover}
        onClose={() => setChoosingCover(false)}
        max={1}
        title={`${coverCount ? 'Another cover' : "Hugpix's cover"}${coverFor ? ` for ${coverFor}` : ''}`}
        action={(n) => (n ? 'Use this photo' : 'Tap a photo')}
        onPick={(ids) => {
          setChoosingCover(false)
          const album = albums.find((a) => a.imageIds.includes(ids[0]))
          if (album) setFramingCover({ album, id: ids[0] })
        }}
      />
      {framingCover && images[framingCover.id] && (
        <CoverFramer
          image={images[framingCover.id]}
          at={framingCover.album.focus?.[framingCover.id]}
          onCancel={() => setFramingCover(null)}
          onSave={(at) => {
            setCoverFocus(framingCover.album.id, framingCover.id, at)
            setPinned(framingCover.album.id, framingCover.id, at).catch(() => {})
            setFramingCover(null)
          }}
        />
      )}

      {/* New here, or notifications still off on this device: ask once in a while. */}
      <NotifyNudge />

      {albums.length > 0 && (
        <button className="primary home-camera" onClick={() => setCameraFor('choose')} aria-label="Take a photo or video">
          <Icon name="camera" size={24} />
        </button>
      )}
      <AlbumChooser
        open={cameraFor === 'choose'}
        onClose={() => setCameraFor(null)}
        title="Which album is it for?"
        first={lastCameraAlbum()}
        onPick={(a) => {
          try {
            localStorage.setItem('seamline:cameraAlbum', a.id)
          } catch {
            // Storage blocked: the newest album leads next time.
          }
          setCameraFor(a)
        }}
      />
      {cameraFor && cameraFor !== 'choose' && (
        <Camera albumName={cameraFor.name} onSend={sendFromCamera} onClose={() => setCameraFor(null)} />
      )}

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
    </div>
  )
}
