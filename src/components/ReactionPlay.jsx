import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import { isGreeting } from './Greetings'
import { Emoji } from './Reactions'
import { reactionFxOn, stillPlease } from '../lib/feedback'

// The reactions a photo has had, played over it for a moment when it opens:
// each person's face and their emoji, with a movement of its own (hearts
// float up, laughs bounce, fire rises, hands clap...). Each plays once on a
// device; a tap skips what is left; `replay` (a count) plays them all again.
// Seasonal greetings have their own stage (components/Greetings) and are
// left to it. `reactions` are others' [{ user_id, emoji }]; `token` names the
// photo (album:photo) for remembering what has played; `nameOf(id)` is a
// name for a face the app doesn't know.

const PLAYED = 'seamline:reactionsPlayed'
const played = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(PLAYED) || '[]'))
  } catch {
    return new Set()
  }
}
const remember = (keys) => {
  try {
    localStorage.setItem(PLAYED, JSON.stringify([...new Set([...played(), ...keys])].slice(-600)))
  } catch {
    // Storage blocked: they play again next time.
  }
}

const STEP = 420 // ms from one to the next
const LAST = 1900 // ms the last one gets
const MOST = 8
// How each one moves (see .react-fx in styles.css).
const KIND = { '❤️': 'heart', '😂': 'laugh', '😮': 'wow', '😢': 'sad', '👍': 'thumbs', '🎉': 'party', '🤗': 'hug', '🔥': 'fire', '✨': 'sparkles', '👏': 'clap' }

export default function ReactionPlay({ reactions, people, token, replay = 0, nameOf }) {
  const [show, setShow] = useState(null) // the ones playing, or null
  const timer = useRef(null)
  const given = reactions.filter((r) => !isGreeting(r.emoji))
  const keys = given.map((r) => `${token}:${r.user_id}:${r.emoji}`)
  const sig = keys.join('|')

  // New ones as the photo opens (or as they arrive); all of them on replay.
  useEffect(() => {
    const seen = played()
    const fresh = replay ? given : given.filter((r, i) => !seen.has(keys[i]))
    remember(keys)
    if (!fresh.length || !reactionFxOn() || stillPlease()) return
    const items = fresh.slice(0, MOST).map((r, i) => ({ key: `${r.user_id}:${r.emoji}:${i}`, ...r, left: 12 + ((i * 37) % 64) }))
    setShow(items)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShow(null), STEP * items.length + LAST)
    return () => clearTimeout(timer.current)
    // `sig` stands for the reactions; `given` and `keys` follow from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, replay, sig])

  if (!show) return null
  return (
    <div className="react-play" onClick={() => setShow(null)} aria-hidden="true">
      {show.map((it, i) => {
        const person = people.find((p) => p.id === it.user_id) ?? { id: it.user_id, name: nameOf(it.user_id) }
        return (
          <span key={it.key} className={`react-fx ${KIND[it.emoji] ?? 'wow'}`} style={{ left: `${it.left}%`, '--d': `${i * STEP}ms` }}>
            <span className="react-fx-emoji"><Emoji emoji={it.emoji} size={64} /></span>
            <span className="react-fx-who"><Avatar person={person} size={22} zoom={false} /> {(person.name ?? 'Someone').split(' ')[0]}</span>
          </span>
        )
      })}
    </div>
  )
}
