import { Fragment, useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Avatar from './Avatar'
import Icon from './Icon'
import LiveNow from './LiveNow'
import Logo from './Logo'
import { refreshChats, useUnread } from '../lib/chat'
import { avatarOf, refreshPins, refreshRequests, useCloud } from '../lib/cloud'
import { refreshFeedSocial, useFeedCount, watchFeedSocial } from '../lib/feed'
import { countText } from '../lib/images'
import { fadeIn, morph } from '../lib/motion'
import { placeName } from '../lib/places'
import { lastUpload } from '../lib/store'
import { useActiveSeason } from '../lib/theme'

// The front page's ways of showing the albums, picked in Settings (see
// lib/theme.js). Each draws its own top of the page; Home keeps the newest
// photos at the end, the sheets and everything that changes data.

export function ago(t) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const COVER_SECONDS = 4.5

// How a photo sits when it fills a frame for its album (album.focus, set in
// components/CoverFramer): a style for the <img>, or nothing for the middle.
export const focusStyle = (album, id) => (album.focus?.[id] ? { objectPosition: `${album.focus[id][0]}% ${album.focus[id][1]}%` } : undefined)

// The large picture on the leading album: it moves slowly through the album's
// photos, each fading in over the last. `pics` are the pictures to show in
// turn, each { url, style }.
export function CoverCycle({ pics }) {
  const [step, setStep] = useState(0)
  const moving = pics.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!moving) return
    const t = setInterval(() => !document.hidden && setStep((s) => s + 1), COVER_SECONDS * 1000)
    return () => clearInterval(t)
  }, [moving])
  const now = pics[step % pics.length]
  const before = step > 0 ? pics[(step - 1) % pics.length] : null
  return (
    <span className="cover-main">
      {before && <img key={`was-${step}`} src={before.url} style={before.style} alt="" draggable={false} />}
      <img key={step} className={moving ? 'drift' : undefined} src={now.url} style={now.style} alt="" draggable={false} />
    </span>
  )
}
// A key that changes when the pictures do, so the cycle starts afresh.
export const cycleKey = (pics) => pics.map((p) => p.url).join()

// The photos of an album that are on hand, in order, with the one chosen as
// its cover (album.cover) first, so it stands for the album everywhere.
export function photosOf(album, images) {
  const ids = album.imageIds.filter((id) => images[id])
  const { cover } = album
  return cover && ids.includes(cover) ? [cover, ...ids.filter((id) => id !== cover)] : ids
}

// The small line under an album's name: how many or how old, then where it was.
const meta = (album, ...parts) => [...parts, placeName(album)].filter(Boolean).join(' · ')

const picOf = (album, images, id) => ({ url: images[id].previewUrl, style: focusStyle(album, id) })

// The pictures the leading album's cover moves through: the first, then from
// the fourth on, leaving the second and third for the smaller spots beside it.
const cycleOf = (album, ids, images) => (ids.length ? [ids[0], ...ids.slice(3, 9)].map((id) => picOf(album, images, id)) : null)

// The leading album's photos, and what its big picture shows: the album's
// chosen cover, held still, when it has one; otherwise the cycle.
export function leadOf(album, images) {
  const ids = photosOf(album, images)
  if (album.cover && ids[0] === album.cover) return { ids, cycle: [picOf(album, images, album.cover)] }
  return { ids, cycle: cycleOf(album, ids, images) }
}

// A pinned photo (see usePinned) is the front page's big picture on its own,
// with no album on it; the albums all take their usual places below. Each
// layout draws it its own way from `banner`: { album, id, pic: { url, style } }.
// A tap opens the photo in its album.
export const openBanner = (banner) => navigate(`/album/${banner.album.id}?photo=${encodeURIComponent(banner.id)}`)

// A quiet way to choose Hugpix's cover photos (the banner): any photos from
// any albums, for each season, taking turns one a visit (`count` so far).
// Nothing for those who may not.
export function CoverLine({ onCover, coverFor, count = 0 }) {
  if (!onCover) return null
  const words = !count
    ? `Choose a cover photo${coverFor ? ` for ${coverFor}` : ''}`
    : count === 1 ? 'Add another cover photo' : `Add another cover photo · ${count} take turns`
  return (
    <button className="cover-line" onClick={onCover}>
      <Icon name="photo" size={13} /> {words}
    </button>
  )
}

// `el` zooms out to become the album's own screen.
export function openAlbum(album, el) {
  morph(() => navigate(`/album/${album.id}`, { animate: false }), {
    name: 'album', from: () => el, to: () => document.querySelector('.screen.album'),
  })
}

const Pic = ({ image, style }) => (
  <img className="fade" onLoad={fadeIn} onError={fadeIn} src={image.previewUrl} style={style} alt="" loading="lazy" decoding="async" draggable={false} />
)

// Who is signed in; the whole thing opens Settings. For the admin, a bell
// beside the initial says how many people are waiting for approval, and a
// tap then goes straight to them in People. Before it, the ways to What's
// new and to Messages, with how much is new and how many chats have
// something unread. It looks again whenever the app comes back into view,
// and every minute while it is open.
export function Who({ name }) {
  const { requests, features, session } = useCloud()
  const avatar = avatarOf(session)
  const waiting = requests.length
  const fresh = useFeedCount()
  const unread = useUnread()
  const count = (n) => n > 0 && <em>{n > 99 ? '99+' : n}</em>
  useEffect(() => {
    // Waiting requests, unread messages, what's new, and the pinned photo someone else may have changed.
    const look = () => {
      if (document.hidden) return
      refreshRequests().catch(() => {})
      refreshPins().catch(() => {})
      refreshChats().catch(() => {})
      refreshFeedSocial().catch(() => {})
    }
    look()
    const stop = watchFeedSocial()
    const t = setInterval(look, 60000)
    document.addEventListener('visibilitychange', look)
    return () => {
      stop()
      clearInterval(t)
      document.removeEventListener('visibilitychange', look)
    }
  }, [])
  const label = [name ? `Settings, signed in as ${name}` : 'Settings', waiting && `${waiting} waiting for approval`]
  return (
    <span className="who-wrap">
    {features.social && (
      <button className="who-chat" onClick={() => navigate('/news')} aria-label={fresh ? `What's new, ${fresh} new` : "What's new"}>
        <Icon name="photos" size={18} />
        {count(fresh)}
      </button>
    )}
    {features.messages && (
      <button className="who-chat" onClick={() => navigate('/messages')} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
        <Icon name="comment" size={18} />
        {count(unread)}
      </button>
    )}
    <button
      className="who"
      onClick={() => navigate(waiting ? '/settings#people' : '/settings')}
      aria-label={label.filter(Boolean).join('. ')}
    >
      {(avatar || name) && <Avatar person={{ id: session?.user.id, name, avatar }} size={28} zoom={false} />}
      {waiting > 0 && (
        <b className="who-bell" aria-hidden="true">
          <Icon name="bell" size={16} />
          <em>{waiting}</em>
        </b>
      )}
      {name && <span className="who-name">{name}</span>}
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

// The greeting's last word, "Halloween" given a shiver now and then (see
// .spooky in styles.css), the rest as they are.
function LastWord({ word }) {
  const spooky = useActiveSeason() === 'halloween'
  return spooky ? <span className="spooky">{word}</span> : word
}

// The greeting as one line, "Happy Halloween, Kerry".
export function Greet({ greet, first }) {
  const words = greet.split(' ')
  const last = words.pop()
  return (
    <>
      {words.length > 0 && `${words.join(' ')} `}
      <LastWord word={last} />
      {first && `, ${first}`}
    </>
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
      <em><LastWord word={last} />{first ? ',' : stop}</em>
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
          ? "Albums hold the family's photos and videos, ready to look through, share or save back to your phone."
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

// Stack: the latest album as a small fan of prints, the rest as tilted prints
// beneath; or a pinned photo as one print, with every album beneath.
export function Stack({ albums, images, who, greet, first, news, summary, onNewAlbum, banner, onCover, coverFor, coverCount }) {
  const fan = useRef(null)
  const lead = banner ? null : albums[0]
  const rest = banner ? albums : albums.slice(1)
  const { ids, cycle } = lead ? leadOf(lead, images) : { ids: [], cycle: null }
  const open = () => openAlbum(lead, fan.current)
  return (
    <>
      <header className="home-head">
        <Logo />
        <Who name={who} />
      </header>
      <section className="home-intro">
        <p className="greeting"><Greet greet={greet} first={first} /></p>
        {news.length > 0 ? <News news={news} /> : <p className="home-sub">{summary}</p>}
        <LiveNow />
        <CoverLine onCover={onCover} coverFor={coverFor} count={coverCount} />
      </section>

      {banner ? (
        <section className="fan-lead" aria-label="The pinned photo">
          <button className="fan" onClick={() => openBanner(banner)} aria-label="Open the pinned photo">
            <span className="print front">
              <span className="print-pic"><img src={banner.pic.url} style={banner.pic.style} alt="" draggable={false} /></span>
            </span>
          </button>
          <span className="kicker">Pinned</span>
        </section>
      ) : !lead ? (
        <AlbumsInvite onNew={onNewAlbum} />
      ) : (
        <section className="fan-lead" aria-label="Latest album">
          <button ref={fan} className="fan" data-album={lead.id} onClick={open} aria-label={`Open ${lead.name}`}>
            {[ids[2], ids[1]].map((id, i) => (
              <span key={i} className={`print back-${i}`}>
                <span className="print-pic">{id && <Pic image={images[id]} style={focusStyle(lead, id)} />}</span>
              </span>
            ))}
            <span className="print front">
              <span className="print-pic">
                {cycle ? <CoverCycle key={cycleKey(cycle)} pics={cycle} /> : <Icon name="photo" size={36} />}
                {ids.length > 0 && <span className="print-count">{countText(ids.map((id) => images[id]))}</span>}
              </span>
              <em>{ids.length ? meta(lead, `added ${ago(lastUpload(lead))}`) : 'nothing yet'}</em>
            </span>
          </button>
          <span className="kicker">Latest</span>
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
                  <span className="print-pic">{pics[0] ? <Pic image={images[pics[0]]} style={focusStyle(a, pics[0])} /> : <Icon name="photo" size={24} />}</span>
                  <b><AlbumName album={a} /></b>
                  <small>{meta(a, countText(pics.map((id) => images[id])))}</small>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

// Editorial: the greeting set large, then the albums as a numbered index; a
// pinned photo sits as a wide picture between them.
export function Editorial({ albums, images, who, greet, first, stats, news, onNewAlbum, banner, onCover, coverFor, coverCount }) {
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
      <LiveNow />
      <CoverLine onCover={onCover} coverFor={coverFor} count={coverCount} />
      {banner && (
        <button className="ed-banner" onClick={() => openBanner(banner)} aria-label="Open the pinned photo">
          <img src={banner.pic.url} style={banner.pic.style} alt="" draggable={false} />
        </button>
      )}

      {albums.length === 0 ? (
        <AlbumsInvite onNew={onNewAlbum} />
      ) : (
        <>
          <ol className="ed-list">
            {albums.map((a, i) => {
              const lead = !banner && i === 0
              const { ids, cycle } = lead ? leadOf(a, images) : { ids: photosOf(a, images), cycle: null }
              const n = String(i + 1).padStart(2, '0')
              return (
                <li key={a.id} style={{ '--i': Math.min(i, 8) }}>
                  {lead ? (
                    <button className="ed-row lead" data-album={a.id} onClick={(e) => openAlbum(a, e.currentTarget)}>
                      <span className="ed-top">
                        <i>{n}</i>
                        <strong><AlbumName album={a} /></strong>
                        <small>{ids.length ? meta(a, ago(lastUpload(a))) : 'empty'}</small>
                      </span>
                      {cycle && (
                        <span className="ed-strip">
                          <CoverCycle key={cycleKey(cycle)} pics={cycle} />
                          {ids.slice(1, 3).map((id, j) => (
                            <span key={id} className="ed-cell">
                              <Pic image={images[id]} style={focusStyle(a, id)} />
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
                        <small>{meta(a, countText(ids.map((id) => images[id])))}</small>
                      </span>
                      <span className="ed-thumb">{ids[0] && <Pic image={images[ids[0]]} style={focusStyle(a, ids[0])} />}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
          {onNewAlbum && (
            <div className="ed-actions">
              <button className="primary" onClick={onNewAlbum}>
                <Icon name="plus" size={18} /> New album
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

// Mosaic: every album a photo tile, edge to edge, the latest one wide across
// the top; or a pinned photo across the top, with every album a tile.
export function Mosaic({ albums, images, who, greet, first, news, onNewAlbum, banner, onCover, coverFor, coverCount }) {
  const lead = banner ? null : albums[0]
  const rest = banner ? albums : albums.slice(1)
  const { ids, cycle } = lead ? leadOf(lead, images) : { ids: [], cycle: null }
  return (
    <div className={`mosaic ${lead || banner ? '' : 'bare'}`}>
      <header className="mo-head">
        <span className="mo-brand"><Logo /></span>
        <Who name={who} />
      </header>
      <Hello greet={greet} first={first} className="mo-hello" />

      {banner ? (
        <button className="mo-tile mo-hero mo-banner" onClick={() => openBanner(banner)} aria-label="Open the pinned photo">
          <img src={banner.pic.url} style={banner.pic.style} alt="" draggable={false} />
        </button>
      ) : lead ? (
        <button className="mo-tile mo-hero" data-album={lead.id} onClick={(e) => openAlbum(lead, e.currentTarget)}>
          {cycle ? <CoverCycle key={cycleKey(cycle)} pics={cycle} /> : <Icon name="photo" size={40} />}
          <span className="mo-caption">
            <span className="eyebrow">Latest</span>
            <strong><AlbumName album={lead} /></strong>
            <small>{meta(lead, countText(ids.map((id) => images[id])), ids.length > 0 && `added ${ago(lastUpload(lead))}`)}</small>
          </span>
          {ids.length > 1 && (
            <span className="mo-dots" aria-hidden="true">
              {ids.slice(1, 3).map((id) => <Pic key={id} image={images[id]} style={focusStyle(lead, id)} />)}
              {ids.length > 3 && <i>+{ids.length - 3}</i>}
            </span>
          )}
        </button>
      ) : (
        <div className="mo-span"><AlbumsInvite onNew={onNewAlbum} /></div>
      )}

      <div className="mo-span mo-live">
        <LiveNow />
        <CoverLine onCover={onCover} coverFor={coverFor} count={coverCount} />
      </div>
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
              {pics[0] ? <Pic image={images[pics[0]]} style={focusStyle(a, pics[0])} /> : <Icon name="photo" size={28} />}
              <span className="mo-label">
                <b><AlbumName album={a} /></b>
                <small>{meta(a, countText(pics.map((id) => images[id])))}</small>
              </span>
            </button>
          </Fragment>
        )
      })}
      {(lead || banner) && onNewAlbum && (
        <button className="mo-tile mo-new" onClick={onNewAlbum}>
          <Icon name="plus" size={24} /> New album
        </button>
      )}
    </div>
  )
}
