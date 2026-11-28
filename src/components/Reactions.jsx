import { GreetingFace, isGreeting } from './Greetings'
import Icon from './Icon'
import { ReactionFace } from './ReactionFaces'
import { EXTRA_REACTIONS, isKind, KIND_NAMES, KINDS, reactionChoices, REACTIONS } from '../lib/social'

// The reactions drawn as Microsoft's soft 3D Fluent emoji (MIT licence, see
// public/reactions/LICENSE.txt), the same on every phone, rather than each
// device's own. 96 px WebP, shown at up to a third of that.
const FILES = {
  '❤️': 'heart', '😂': 'laugh', '😮': 'wow', '😢': 'sad', '👍': 'thumbs', '🎉': 'party',
  '🤗': 'hug', '🔥': 'fire', '✨': 'sparkles', '👏': 'clap',
}
// A seasonal greeting given as a reaction shows as its character, and one of
// the seven as its animated sticker (`still` holds it still): in the theme it
// was given in (`look`; null for one from before looks were kept, shown as
// the everyday one), or with no `look` at all, in the theme showing.
export function Emoji({ emoji, size = 22, still = false, look }) {
  if (isGreeting(emoji)) return <GreetingFace kind={emoji} size={size} />
  if (isKind(emoji)) return <ReactionFace kind={emoji} size={size} still={still} season={look === null ? 'everyday' : look} />
  const file = FILES[emoji]
  if (!file) return <span>{emoji}</span>
  return <img className="emoji" src={`/reactions/${file}.webp`} alt={emoji} width={size} height={size} draggable={false} />
}

// The reactions as a row of buttons, each with how many people chose it:
// the seven animated ones, or before those the six (with `more` the four
// more). Mine is lit; tapping mine again takes it back, tapping another
// changes it. `reactions` are [{ user_id, emoji }]; `onPick(emoji | null)`.
// With `onGreet` and a `season` showing, a last button, More, opens the
// season's greetings (components/Greetings); it is lit when mine is one.
export function ReactionRow({ reactions, me, onPick, compact = false, season = null, onGreet = null, more = false, pop = false }) {
  const mine = reactions.find((r) => r.user_id === me)?.emoji ?? null
  const greeted = isGreeting(mine) ? mine : null
  const kinds = reactionChoices(more)
  // With `pop`, the buttons arrive one after another (see .reaction-row.pop).
  return (
    <div className={`reaction-row ${compact ? 'compact' : ''} ${kinds.length > 8 ? 'more' : ''} ${pop ? 'pop' : ''}`} role="group" aria-label="React">
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
            aria-label={`${KIND_NAMES[emoji] ?? emoji}${n ? `, ${n}` : ''}`}
          >
            <span className="reaction-emoji"><Emoji emoji={emoji} size={compact ? 26 : 24} /></span>
            {/* The sticker's name under it, where there is room. */}
            {!compact && isKind(emoji) && <span className="reaction-name">{KIND_NAMES[emoji]}</span>}
            {n > 0 && <small>{n}</small>}
          </button>
        )
      })}
      {/* More: a plain button (not a character, so it isn't read as one more
          reaction) for the season's greetings, with the reactions again. */}
      {onGreet && (season || !compact) && (
        <button
          className={`greet-btn more-btn ${greeted ? 'on' : ''}`}
          style={{ '--i': kinds.length }}
          onClick={onGreet}
          aria-label="More: seasonal greetings"
        >
          <span className="reaction-emoji"><Icon name="more" size={compact ? 20 : 24} /></span>
          {!compact && isKind(kinds[0]) && <span className="reaction-name">More</span>}
        </button>
      )}
    </div>
  )
}

// Under a message: only the reactions given, "❤️ 2  😂 1", mine lit; any
// seasonal greetings given come after, as their faces.
export function ReactionChips({ reactions, me, onPick }) {
  const kinds = [...KINDS, ...REACTIONS, ...EXTRA_REACTIONS, ...new Set(reactions.map((r) => r.emoji).filter(isGreeting))]
  const counts = kinds.map((emoji) => ({ emoji, n: reactions.filter((r) => r.emoji === emoji).length })).filter((c) => c.n)
  if (!counts.length) return null
  const mine = reactions.find((r) => r.user_id === me)?.emoji
  // Each chip in the look of the latest one given of its kind.
  const lookOf = (emoji) => reactions.findLast((r) => r.emoji === emoji)?.look
  return (
    <div className="reaction-chips">
      {counts.map(({ emoji, n }) => (
        <button key={emoji} className={mine === emoji ? 'on' : ''} onClick={() => onPick(mine === emoji ? null : emoji)}>
          <Emoji emoji={emoji} size={16} look={lookOf(emoji)} />{n > 1 && <small>{n}</small>}
        </button>
      ))}
    </div>
  )
}
