import { Fragment, useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from './Icon'
import Logo from './Logo'
import { refreshChats, useUnread } from '../lib/chat'
import { avatarOf, refreshPins, refreshRequests, useCloud } from '../lib/cloud'
import { countText } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { lastUpload } from '../lib/store'

// The front page's ways of showing the albums, picked in Settings (see
// lib/theme.js). Each draws its own top of the page; Home keeps the collages,
// the sheets and everything that changes data.

export function ago(t) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const COVER_SECONDS = 4.5

// The large picture on the leading album: it moves slowly through the album's
// photos, each fading in over the last. `urls` are the pictures to show in turn.
export function CoverCycle({ urls }) {
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

// The photos of an album that are on hand, in order.
export const photosOf = (album, images) => album.imageIds.filter((id) => images[id])

// The pictures the leading album's cover moves through: the first, then from
// the fourth on, leaving the second and third for the smaller spots beside it.
const cycleOf = (ids, images) => (ids.length ? [ids[0], ...ids.slice(3, 9)].map((id) => images[id].previewUrl) : null)

// The leading album's photos, and what its big picture shows: the pinned
// photo, held still, when there is one (see usePinned); otherwise the cycle.
export function leadOf(album, images, pinned) {
  const ids = photosOf(album, images)
  if (!pinned || !ids.includes(pinned)) return { ids, cycle: cycleOf(ids, images) }
  return { ids: [pinned, ...ids.filter((id) => id !== pinned)], cycle: [images[pinned].previewUrl] }
}

// `el` zooms out to become the album's own screen.
export function openAlbum(album, el) {
  morph(() => navigate(`/album/${album.id}`, { animate: false }), {
    name: 'album', from: () => el, to: () => document.querySelector('.screen.album'),
  })
}

const Pic = ({ image }) => (
  <img className="fade" onLoad={fadeIn} onError={fadeIn} src={image.previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
)

// Who is signed in; the whole thing opens Settings. For the admin, a bell
// beside the initial says how many people are waiting for approval, and a
// tap then goes straight to them in People. Before it, the way to Messages,
// with how many chats have something unread. It looks again whenever the
// app comes back into view, and every minute while it is open.
export function Who({ name }) {
  const { requests, features, session } = useCloud()
  const avatar = avatarOf(session)
  const waiting = requests.length
  const unread = useUnread()
  useEffect(() => {
    // Waiting requests, unread messages, and the pinned photo someone else may have changed.
    const look = () => {
      if (document.hidden) return
      refreshRequests().catch(() => {})
      refreshPins().catch(() => {})
      refreshChats().catch(() => {})
    }
    look()
    const t = setInterval(look, 60000)
    document.addEventListener('visibilitychange', look)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', look)
    }
  }, [])
  const label = [name ? `Settings, signed in as ${name}` : 'Settings', waiting && `${waiting} waiting for approval`]
  return (
    <span className="who-wrap">
    {features.messages && (
      <button className="who-chat" onClick={() => navigate('/messages')} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
        <Icon name="comment" size={20} />
        {unread > 0 && <em>{unread}</em>}
      </button>
    )}
    <button
      className="who"
      onClick={() => navigate(waiting ? '/settings#people' : '/settings')}
      aria-label={label.filter(Boolean).join('. ')}
    >
      {avatar ? (
        <img className="who-photo" src={avatar} alt="" draggable={false} />
      ) : (
        name && <i aria-hidden="true">{name[0].toUpperCase()}</i>
      )}
      {waiting > 0 && (
        <b className="who-bell" aria-hidden="true">
          <Icon name="bell" size={16} />
          <em>{waiting}</em>
        </b>
      )}
      {name && <span>{name}</span>}
      <Icon name="gear" size={20} />
    </button>
    </span>
  )
}

// An album's name, with a padlock when it is secret.
export const AlbumName = ({ album }) => (
  <>
    {album.secret && <span className="album-lock" aria-label="Secret"><Icon name="lock" size={13} /></span>}
    {album.name}
  </>
)

// What others have done since the app was last opened here. Each piece goes
// to `to`, or else to its album.
export function News({ news }) {
  return (
    <div className="news">
      <i className="pulse" aria-hidden="true" />
      {news.map((n) => (
        <button key={n.key} disabled={!n.to && !n.albumId} onClick={() => navigate(n.to ?? `/album/${n.albumId}`)}>
          {n.text}
        </button>
      ))}
    </div>
  )
}

// The greeting stacked a word or two to a line, "Good / evening, / Kerry.",
// the last word of the greeting in italics.
function Hello({ greet, first, className }) {
  const words = greet.split(' ')
  const last = words.pop()
  const stop = <b aria-hidden="true">.</b>
  return (
    <p className={className}>
      {words.length > 0 && <span>{words.join(' ')}</span>}
      <em>{last}{first ? ',' : stop}</em>
      {first && <span>{first}{stop}</span>}
    </p>
  )
}

// Stands in for the albums until there is one. Without `onNew` (a guest,
// who can't make albums) it only says so.
export function AlbumsInvite({ onNew }) {
  return (
    <div className="invite">
      <div className="pool-art" aria-hidden="true"><i /><i /><i /><i /></div>
      <h3>{onNew ? 'Keep a pool of photos' : 'No albums yet'}</h3>
      <p>
        {onNew
          ? 'Albums hold photos inside the app, ready to drop into any collage or save back to your phone.'
          : 'Albums show up here as soon as they are made, and you can add your photos to them.'}
      </p>
      {onNew && (
        <button className="primary" onClick={onNew}>
          <Icon name="plus" size={20} /> New album
        </button>
      )}
    </div>
  )
}

// Stack: the latest album as a small fan of prints, the rest as tilted prints beneath.
export function Stack({ albums, images, who, greet, first, news, summary, onNewAlbum, pinned }) {
  const fan = useRef(null)
  const [lead, ...rest] = albums
  const { ids, cycle } = lead ? leadOf(lead, images, pinned) : { ids: [], cycle: null }
  const open = () => openAlbum(lead, fan.current)
  return (
    <>
      <header className="home-head">
        <Logo />
        <Who name={who} />
      </header>
      <section className="home-intro">
        <p className="greeting">{first ? `${greet}, ${first}` : greet}</p>
        {news.length > 0 ? <News news={news} /> : <p className="home-sub">{summary}</p>}
      </section>

      {!lead ? (
        <AlbumsInvite onNew={onNewAlbum} />
      ) : (
        <section className="fan-lead" aria-label="Latest album">
          <button ref={fan} className="fan" data-album={lead.id} onClick={open} aria-label={`Open ${lead.name}`}>
            {[ids[2], ids[1]].map((id, i) => (
              <span key={i} className={`print back-${i}`}>
                <span className="print-pic">{id && <Pic image={images[id]} />}</span>
              </span>
            ))}
            <span className="print front">
              <span className="print-pic">
                {cycle ? <CoverCycle key={cycle.join()} urls={cycle} /> : <Icon name="photo" size={36} />}
                {ids.length > 0 && <span className="print-count">{countText(ids.map((id) => images[id]))}</span>}
              </span>
              <em>{ids.length ? `added ${ago(lastUpload(lead))}` : 'nothing yet'}</em>
            </span>
          </button>
          <span className="kicker">{pinned && ids[0] === pinned ? 'Pinned' : 'Latest'}</span>
          <h2 className="fan-name"><AlbumName album={lead} /></h2>
          <button className="primary" onClick={open}>
            Open album <Icon name="back" size={16} />
          </button>
        </section>
      )}

      {rest.length > 0 && (
        <section className="prints">
          <div className="section-head">
            <h2>Albums<span className="count">{albums.length}</span></h2>
            {onNewAlbum && (
              <button className="pill-btn" onClick={onNewAlbum}>
                <Icon name="plus" size={16} /> New
              </button>
            )}
          </div>
          <div className="print-grid">
            {rest.map((a, i) => {
              const pics = photosOf(a, images)
              return (
                <button key={a.id} className="print-tile" style={{ '--i': Math.min(i, 8) }} data-album={a.id} onClick={(e) => openAlbum(a, e.currentTarget)}>
                  <span className="print-pic">{pics[0] ? <Pic image={images[pics[0]]} /> : <Icon name="photo" size={24} />}</span>
                  <b><AlbumName album={a} /></b>
                  <small>{countText(pics.map((id) => images[id]))}</small>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

// Editorial: the greeting set large, then the albums as a numbered index.
export function Editorial({ albums, images, who, greet, first, stats, news, onNewAlbum, onCollages, pinned }) {
  return (
    <>
      <header className="home-head">
        <Logo />
        <Who name={who} />
      </header>
      <Hello greet={greet} first={first} className="ed-hello" />
      <div className="ed-stats">
        {stats.map((s) => <span key={s}>{s}</span>)}
      </div>
      {news.length > 0 && <News news={news} />}

      {albums.length === 0 ? (
        <AlbumsInvite onNew={onNewAlbum} />
      ) : (
        <>
          <ol className="ed-list">
            {albums.map((a, i) => {
              const { ids, cycle } = i === 0 ? leadOf(a, images, pinned) : { ids: photosOf(a, images), cycle: null }
              const n = String(i + 1).padStart(2, '0')
              return (
                <li key={a.id} style={{ '--i': Math.min(i, 8) }}>
                  {i === 0 ? (
                    <button className="ed-row lead" data-album={a.id} onClick={(e) => openAlbum(a, e.currentTarget)}>
                      <span className="ed-top">
                        <i>{n}</i>
                        <strong><AlbumName album={a} /></strong>
                        <small>{ids.length ? ago(lastUpload(a)) : 'empty'}</small>
                      </span>
                      {cycle && (
                        <span className="ed-strip">
                          <CoverCycle key={cycle.join()} urls={cycle} />
                          {ids.slice(1, 3).map((id, j) => (
                            <span key={id} className="ed-cell">
                              <Pic image={images[id]} />
                              {j === 1 && ids.length > 3 && <b>+{ids.length - 3}</b>}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  ) : (
                    <button className="ed-row" data-album={a.id} onClick={(e) => openAlbum(a, e.currentTarget)}>
                      <i>{n}</i>
                      <span className="ed-name">
                        <strong><AlbumName album={a} /></strong>
                        <small>{countText(ids.map((id) => images[id]))}</small>
                      </span>
                      <span className="ed-thumb">{ids[0] && <Pic image={images[ids[0]]} />}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
          {(onNewAlbum || onCollages) && (
            <div className="ed-actions">
              {onNewAlbum && (
                <button className="primary" onClick={onNewAlbum}>
                  <Icon name="plus" size={18} /> New album
                </button>
              )}
              {onCollages && (
                <button className="ed-ghost" onClick={onCollages}>
                  Collages <Icon name="back" size={16} />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

// Mosaic: every album a photo tile, edge to edge, the latest one wide across the top.
export function Mosaic({ albums, images, who, greet, first, news, collageCount, onNewAlbum, onCollages, pinned }) {
  const [lead, ...rest] = albums
  const { ids, cycle } = lead ? leadOf(lead, images, pinned) : { ids: [], cycle: null }
  // Only once there is a collage to go to.
  const collages = collageCount > 0 && (
    <button className="mo-tile mo-collages" onClick={onCollages}>
      <span className="mo-big">{collageCount}</span>
      <span className="mo-go">Collages <Icon name="back" size={18} /></span>
    </button>
  )
  return (
    <div className={`mosaic ${lead ? '' : 'bare'}`}>
      <header className="mo-head">
        <span className="mo-brand"><Logo /></span>
        <Who name={who} />
      </header>
      <Hello greet={greet} first={first} className="mo-hello" />

      {lead ? (
        <button className="mo-tile mo-hero" data-album={lead.id} onClick={(e) => openAlbum(lead, e.currentTarget)}>
          {cycle ? <CoverCycle key={cycle.join()} urls={cycle} /> : <Icon name="photo" size={40} />}
          <span className="mo-caption">
            <span className="eyebrow">{pinned && ids[0] === pinned ? 'Pinned' : 'Latest'}</span>
            <strong><AlbumName album={lead} /></strong>
            <small>
              {countText(ids.map((id) => images[id]))}
              {ids.length > 0 && ` · added ${ago(lastUpload(lead))}`}
            </small>
          </span>
          {ids.length > 1 && (
            <span className="mo-dots" aria-hidden="true">
              {ids.slice(1, 3).map((id) => <Pic key={id} image={images[id]} />)}
              {ids.length > 3 && <i>+{ids.length - 3}</i>}
            </span>
          )}
        </button>
      ) : (
        <div className="mo-span"><AlbumsInvite onNew={onNewAlbum} /></div>
      )}

      {news.length > 0 && <div className="mo-span mo-news"><News news={news} /></div>}

      {rest.map((a, i) => {
        const pics = photosOf(a, images)
        return (
          <Fragment key={a.id}>
            <button
              className={`mo-tile mo-album ${i % 5 === 0 ? 'tall' : ''}`}
              style={{ '--i': Math.min(i, 8) }}
              data-album={a.id}
              onClick={(e) => openAlbum(a, e.currentTarget)}
            >
              {pics[0] ? <Pic image={images[pics[0]]} /> : <Icon name="photo" size={28} />}
              <span className="mo-label">
                <b><AlbumName album={a} /></b>
                <small>{countText(pics.map((id) => images[id]))}</small>
              </span>
            </button>
            {i === 0 && collages}
          </Fragment>
        )
      })}
      {rest.length === 0 && collages}
      {lead && onNewAlbum && (
        <button className="mo-tile mo-new" onClick={onNewAlbum}>
          <Icon name="plus" size={24} /> New album
        </button>
      )}
    </div>
  )
}

// Floats at the foot of the Stack and Mosaic pages: jump between the two
// halves of the page, or make something new.
export function Dock({ on, onAlbums, onCollages, onNew, icons }) {
  const tab = (id, label, icon, go) => (
    <button className={on === id ? 'on' : ''} aria-current={on === id || undefined} aria-label={icons ? label : undefined} onClick={go}>
      {icons ? <Icon name={icon} size={22} /> : label}
    </button>
  )
  return (
    <nav className={`dock ${icons ? 'icons' : ''}`} aria-label="Sections">
      {tab('albums', 'Albums', 'photo', onAlbums)}
      {tab('collages', 'Collages', 'layout', onCollages)}
      <button className="dock-new" onClick={onNew} aria-label="New album or collage">
        <Icon name="plus" size={22} />
      </button>
    </nav>
  )
}
