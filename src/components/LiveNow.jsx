import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../App'
import Avatar from './Avatar'
import { ago } from './HomeLayouts'
import { useCloud, userName } from '../lib/cloud'
import { buildFeed, useFeedSocial } from '../lib/feed'
import { countText } from '../lib/images'
import { personIn, usePeople } from '../lib/people'
import { useHere } from '../lib/presence'
import { useStore } from '../lib/store'

// Life on the front page: who has Hugpix open right now, and the latest
// thing someone did, as it happens. People here now are a row of small faces
// with a soft pulse (a tap goes to Messages); the day's happenings take turns
// on one quiet line, and a new one steps to the front, marked, as it arrives.
// Kept small and grey on purpose: it should never shout over the photos.

const DAY = 864e5
const TURN = 6500 // ms each happening shows before the next
const EMOJI = /\p{Extended_Pictographic}/u

// What someone did, after their name.
function lineOf(item, images) {
  const album = item.album.name
  switch (item.kind) {
    case 'added': return `added ${countText(item.photos.map((id) => images[id] ?? {}))} to ${album}`
    case 'album': return `made a new album, ${album}`
    case 'shared': return `shared ${album} with you`
    case 'reaction': return EMOJI.test(item.emoji ?? '') ? `${item.emoji} your photo in ${album}` : `reacted to your photo in ${album}`
    case 'comment': return `commented in ${album}: “${item.text}”`
    default: return ''
  }
}

const firstOf = (p) => (p?.name ?? 'Someone').split(' ')[0]

export default function LiveNow() {
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const { session, features } = useCloud()
  const me = session?.user.id
  const people = usePeople()
  const here = useHere()
  const social = useFeedSocial()
  // The clock, every half minute, so "3 min ago" keeps up.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const others = here.filter((id) => id !== me).map((id) => personIn(people, id)).filter(Boolean)

  const items = useMemo(() => {
    const since = Date.now() - DAY
    return buildFeed({ albums, me, myName: userName(session), social }).filter((it) => it.at > since).slice(0, 6)
    // `tick` only moves the day along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums, me, session, social, tick])

  // Whose turn it is; something that happened since the page opened goes
  // first and glows for a while.
  const [turn, setTurn] = useState(0)
  const [fresh, setFresh] = useState(null)
  const known = useRef(null) // keys seen so far; null before the first list
  const opened = useRef(Date.now())
  useEffect(() => {
    if (known.current) {
      const arrived = items.find((it) => !known.current.has(it.key) && it.at > opened.current - 60000)
      if (arrived) {
        setTurn(0)
        setFresh(arrived.key)
      }
    }
    known.current = new Set(items.map((it) => it.key))
  }, [items])
  useEffect(() => {
    if (!fresh) return
    const t = setTimeout(() => setFresh(null), 8000)
    return () => clearTimeout(t)
  }, [fresh])
  useEffect(() => {
    if (items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => !document.hidden && setTurn((n) => n + 1), TURN)
    return () => clearInterval(t)
  }, [items.length])

  if (!others.length && !items.length) return null
  const item = items.length ? items[turn % items.length] : null
  const who = item ? (personIn(people, item.who) ?? { id: item.who ?? item.whoName, name: item.whoName ?? 'Someone' }) : null
  const hereText = others.length === 1
    ? `${firstOf(others[0])} is here`
    : others.length === 2
      ? `${firstOf(others[0])} and ${firstOf(others[1])} are here`
      : `${firstOf(others[0])}, ${firstOf(others[1])} and ${others.length - 2} more are here`

  return (
    <div className="live">
      {others.length > 0 && (
        <button className="live-here" onClick={() => navigate('/messages')} disabled={!features.messages}>
          <span className="live-faces">
            {others.slice(0, 4).map((p) => <Avatar key={p.id} person={p} size={18} zoom={false} />)}
          </span>
          <i className="live-dot" aria-hidden="true" />
          <span>{hereText}</span>
        </button>
      )}
      {item && (
        <button
          key={item.key}
          className={`live-line ${item.key === fresh ? 'fresh' : ''}`}
          onClick={() =>
            navigate(item.kind === 'reaction' || item.kind === 'comment'
              ? `/album/${item.album.id}?photo=${encodeURIComponent(item.photos[0])}`
              : `/album/${item.album.id}`)}
        >
          <Avatar person={who} size={18} zoom={false} />
          <span className="live-text"><b>{firstOf(who)}</b> {lineOf(item, images)}</span>
          <small>{ago(item.at)}</small>
        </button>
      )}
    </div>
  )
}
