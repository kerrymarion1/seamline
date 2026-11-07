import { useEffect } from 'react'
import { navigate } from '../App'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import { favouritePhotos, refreshFavourites, tagName, taggedPhotos, useReactionCounts } from '../lib/collections'
import { useCloud } from '../lib/cloud'
import { countText, isVideo } from '../lib/images'
import { fadeIn } from '../lib/motion'
import { usePeople } from '../lib/people'
import { isPersonTag, useStore } from '../lib/store'

// Pages of photos gathered from every album: one person's, and the family's
// favourites. A tap opens the photo in its own album.

function Wall({ title, lead, sub, items, empty, badge }) {
  const images = useStore((s) => s.images)
  return (
    <div className="screen wall">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="preview-title">{title}</div>
        <span className="topbar-spacer" />
      </header>
      <main className="wall-body">
        {lead}
        {items.length > 0 && <p className="wall-sub">{sub ?? countText(items.map((it) => images[it.id]))}</p>}
        {items.length === 0 ? (
          empty
        ) : (
          <div className="wall-grid">
            {items.map((it) => (
              <button
                key={it.id}
                className="wall-tile"
                onClick={() => navigate(`/album/${it.album.id}?photo=${encodeURIComponent(it.id)}`)}
                aria-label={`Open in ${it.album.name}`}
              >
                <img className="fade" onLoad={fadeIn} onError={fadeIn} src={images[it.id].previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                {isVideo(images[it.id]) && <span className="wall-clip"><Icon name="play" size={12} /></span>}
                {badge?.(it)}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export function Favourites() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { hearts } = useCloud()
  const reactionCounts = useReactionCounts()
  useEffect(() => {
    refreshFavourites(true).catch(() => {})
  }, [])
  const items = favouritePhotos(albums, images, reactionCounts, hearts.byItem)
  return (
    <Wall
      title="Favourites"
      items={items}
      sub={`${countText(items.map((it) => images[it.id]))}, the most loved first`}
      badge={(it) => <span className="wall-score"><Icon name="heart" size={11} /> {it.score}</span>}
      empty={
        <div className="empty">
          <h2>No favourites yet</h2>
          <p>Photos fill this page as the family reacts to them, the most loved first.</p>
        </div>
      }
    />
  )
}

// `tag` is a person's account id, or a name as it was tagged.
export function Person({ tag }) {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const people = usePeople()
  const name = tagName(tag, people)
  const person = isPersonTag(tag) ? people.find((p) => p.id === tag) : { id: tag, name }
  const items = taggedPhotos(albums, images, tag)
  return (
    <Wall
      title={name}
      items={items}
      lead={
        <div className="wall-person">
          <Avatar person={person} size={64} />
          <h2>{name}</h2>
        </div>
      }
      empty={
        <div className="empty">
          <h2>No photos of {name.split(' ')[0]} yet</h2>
          <p>Open a photo and tap Tag to say who is in it.</p>
        </div>
      }
    />
  )
}
