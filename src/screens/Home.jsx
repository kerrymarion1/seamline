import { useEffect, useState } from 'react'
import { navigate } from '../App'
import {
  AlbumName, AlbumsInvite, ago, CoverCycle, Editorial, leadOf, Mosaic, News, openAlbum, Stack, Who,
} from '../components/HomeLayouts'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import NotifyNudge from '../components/NotifyNudge'
import PeoplePicker from '../components/PeoplePicker'
import SeasonDecor from '../components/SeasonDecor'
import Sheet from '../components/Sheet'
import { greeting, newsSince, rememberNow } from '../lib/activity'
import { useCloud, usePinned, userName } from '../lib/cloud'
import { countText, isVideo } from '../lib/images'
import { fadeIn } from '../lib/motion'
import { usePeople } from '../lib/people'
import { announceAlbum } from '../lib/push'
import { useActiveSeason, useLayout } from '../lib/theme'
import { addedAt, createAlbum, lastUpload, uploaderName, useStore } from '../lib/store'

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

// The end of the page: the latest photos and videos from every album, newest
// first, each with who added it and where. A tap opens it in its album.
function NewestPhotos({ albums, images }) {
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
        {shown.map(({ id, album }) => {
          const by = uploaderName(album.addedBy?.[id]).split(' ')[0]
          return (
            <button key={id} className="newest-tile" onClick={() => navigate(`/album/${album.id}?photo=${encodeURIComponent(id)}`)}>
              <img className="fade" onLoad={fadeIn} onError={fadeIn} src={images[id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
              {isVideo(images[id]) && <span className="newest-clip"><Icon name="play" size={12} /></span>}
              <span className="newest-label">
                {by && <b>{by}</b>}
                <small><AlbumName album={album} /></small>
              </span>
            </button>
          )
        })}
      </div>
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
  useActiveSeason() // redraws with the season's greeting when it changes
  const [namingAlbum, setNamingAlbum] = useState(false)
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
            <Albums albums={latestFirst} images={images} onNew={shared.onNewAlbum} pinned={pinned} />
          </section>
        ) : (
          <div className="home-layout">
            {layout === 'editorial' && <Editorial {...shared} stats={stats} />}
            {layout === 'stack' && <Stack {...shared} summary={summary} />}
            {layout === 'mosaic' && <Mosaic {...shared} />}
          </div>
        )}

        <NewestPhotos albums={latestFirst} images={images} />
      </main>

      {/* New here, or notifications still off on this device: ask once in a while. */}
      <NotifyNudge />

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
