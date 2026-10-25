import { Fragment, useEffect, useState } from 'react'
import { navigate } from '../App'
import Avatar from '../components/Avatar'
import { AlbumName, ago } from '../components/HomeLayouts'
import Icon from '../components/Icon'
import PauseBar from '../components/PauseBar'
import { Emoji } from '../components/Reactions'
import { useCloud, userName } from '../lib/cloud'
import { buildFeed, feedSeenAt, markFeedSeen, refreshFeedSocial, useFeedSocial } from '../lib/feed'
import { countText } from '../lib/images'
import { personIn, usePeople } from '../lib/people'
import { useStore } from '../lib/store'

// What's new: photos others added, albums they made, reactions to my photos
// and comments, newest first, grouped by day. What came since I last looked
// carries a dot; opening the page counts as looking.

const dayLabel = (t) => {
  const d = new Date(t)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function News() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { session } = useCloud()
  const me = session?.user.id
  const people = usePeople()
  const social = useFeedSocial()
  // What counts as new is fixed when the page opens, so the dots stay put.
  const [seenAt] = useState(feedSeenAt)
  useEffect(() => {
    refreshFeedSocial().catch(() => {})
    markFeedSeen()
  }, [])

  const items = buildFeed({ albums, me, myName: userName(session), social })
  const first = (item) => (personIn(people, item.who)?.name ?? item.whoName ?? 'Someone').split(' ')[0]
  const open = (item) =>
    navigate(item.kind === 'reaction' || item.kind === 'comment'
      ? `/album/${item.album.id}?photo=${encodeURIComponent(item.photos[0])}`
      : `/album/${item.album.id}`)

  return (
    // Not "news": that is the front page's row of news pills in styles.css.
    <div className="screen whats-new">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="preview-title">What's new</div>
        <span className="topbar-spacer" />
      </header>
      <main className="news-list">
        <PauseBar />
        {items.length === 0 && (
          <div className="empty">
            <h2>Nothing new yet</h2>
            <p>When the family adds photos, makes albums, reacts or comments, it shows up here.</p>
          </div>
        )}
        {items.map((item, i) => {
          const newDay = i === 0 || new Date(items[i - 1].at).toDateString() !== new Date(item.at).toDateString()
          const pics = item.photos?.filter((id) => images[id]) ?? []
          return (
            <Fragment key={item.key}>
              {newDay && <p className="news-day">{dayLabel(item.at)}</p>}
              <button className={`news-item ${item.at > seenAt ? 'new' : ''}`} onClick={() => open(item)}>
                <Avatar person={personIn(people, item.who) ?? { name: item.whoName }} size={40} />
                <span className="news-main">
                  <span className="news-text">
                    <b>{first(item)}</b>{' '}
                    {item.kind === 'added' && <>added {countText(item.photos.map((id) => images[id] ?? {}))} to <b><AlbumName album={item.album} /></b></>}
                    {item.kind === 'album' && <>made a new album, <b><AlbumName album={item.album} /></b></>}
                    {item.kind === 'shared' && <>shared an album with you, <b><AlbumName album={item.album} /></b></>}
                    {item.kind === 'reaction' && <>reacted <Emoji emoji={item.emoji} size={18} /> to your photo in <b><AlbumName album={item.album} /></b></>}
                    {item.kind === 'comment' && <>commented in <b><AlbumName album={item.album} /></b>: “{item.text}”</>}
                  </span>
                  <small>{ago(item.at)}</small>
                  {pics.length > 0 && (
                    <span className="news-pics">
                      {pics.slice(0, 4).map((id) => <img key={id} src={images[id].previewUrl} alt="" loading="lazy" draggable={false} />)}
                      {pics.length > 4 && <i>+{pics.length - 4}</i>}
                    </span>
                  )}
                </span>
                {item.at > seenAt && <i className="news-dot" aria-label="New" />}
              </button>
            </Fragment>
          )
        })}
      </main>
    </div>
  )
}
