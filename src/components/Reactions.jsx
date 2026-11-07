import { GreetingFace, isGreeting, SeasonFace } from './Greetings'
import { EXTRA_REACTIONS, REACTIONS } from '../lib/social'

// The reactions drawn as Microsoft's soft 3D Fluent emoji (MIT licence, see
// public/reactions/LICENSE.txt), the same on every phone, rather than each
// device's own. 96 px WebP, shown at up to a third of that.
const FILES = {
  '❤️': 'heart', '😂': 'laugh', '😮': 'wow', '😢': 'sad', '👍': 'thumbs', '🎉': 'party',
  '🤗': 'hug', '🔥': 'fire', '✨': 'sparkles', '👏': 'clap',
}
// A seasonal greeting given as a reaction shows as its character.
export function Emoji({ emoji, size = 22 }) {
  if (isGreeting(emoji)) return <GreetingFace kind={emoji} size={size} />
  const file = FILES[emoji]
  if (!file) return <span>{emoji}</span>
  return <img className="emoji" src={`/reactions/${file}.webp`} alt={emoji} width={size} height={size} draggable={false} />
}

// The reactions as a row of buttons, each with how many people chose it:
// the six, and with `more` the four more. Mine is lit; tapping mine again
// takes it back, tapping another changes it. `reactions` are
// [{ user_id, emoji }]; `onPick(emoji | null)`. With `onGreet`, a last
// button for seasonal greetings (components/Greetings): the season's own
// face (`season`), or the greeting I gave, with how many greetings the photo
// has had.
export function ReactionRow({ reactions, me, onPick, compact = false, season = null, onGreet = null, more = false, pop = false }) {
  const mine = reactions.find((r) => r.user_id === me)?.emoji ?? null
  const greetings = reactions.filter((r) => isGreeting(r.emoji))
  const greeted = isGreeting(mine) ? mine : null
  const kinds = more ? [...REACTIONS, ...EXTRA_REACTIONS] : REACTIONS
  // With `pop`, the buttons arrive one after another (see .reaction-row.pop).
  return (
    <div className={`reaction-row ${compact ? 'compact' : ''} ${more ? 'more' : ''} ${pop ? 'pop' : ''}`} role="group" aria-label="React">
      {kinds.map((emoji, i) => {
        const n = reactions.filter((r) => r.emoji === emoji).length
        const on = mine === emoji
        return (
          <button
            key={emoji}
            className={`${on ? 'on' : ''} ${n ? 'has' : ''}`}
            style={{ '--i': i }}
            onClick={() => onPick(on ? null : emoji)}
            aria-pressed={on}
            aria-label={`${emoji}${n ? `, ${n}` : ''}`}
          >
            <span className="reaction-emoji"><Emoji emoji={emoji} size={compact ? 26 : 24} /></span>
            {n > 0 && <small>{n}</small>}
          </button>
        )
      })}
      {onGreet && (season || greetings.length > 0) && (
        <button
          className={`greet-btn ${greeted ? 'on' : ''} ${greetings.length ? 'has' : ''}`}
          style={{ '--i': kinds.length }}
          onClick={onGreet}
          aria-label={`Seasonal greetings${greetings.length ? `, ${greetings.length}` : ''}`}
        >
          <span className="reaction-emoji">
            {greeted ? <GreetingFace kind={greeted} size={22} /> : season ? <SeasonFace season={season} size={20} /> : <GreetingFace kind={greetings.at(-1).emoji} size={22} />}
          </span>
          {greetings.length > 0 && <small>{greetings.length}</small>}
        </button>
      )}
    </div>
  )
}

// Under a message: only the reactions given, "❤️ 2  😂 1", mine lit; any
// seasonal greetings given come after, as their faces.
export function ReactionChips({ reactions, me, onPick }) {
  const kinds = [...REACTIONS, ...EXTRA_REACTIONS, ...new Set(reactions.map((r) => r.emoji).filter(isGreeting))]
  const counts = kinds.map((emoji) => ({ emoji, n: reactions.filter((r) => r.emoji === emoji).length })).filter((c) => c.n)
  if (!counts.length) return null
  const mine = reactions.find((r) => r.user_id === me)?.emoji
  return (
    <div className="reaction-chips">
      {counts.map(({ emoji, n }) => (
        <button key={emoji} className={mine === emoji ? 'on' : ''} onClick={() => onPick(mine === emoji ? null : emoji)}>
          <Emoji emoji={emoji} size={16} />{n > 1 && <small>{n}</small>}
        </button>
      ))}
    </div>
  )
}
