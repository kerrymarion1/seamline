import { REACTIONS } from '../lib/social'

// The reactions drawn as Microsoft's soft 3D Fluent emoji (MIT licence, see
// public/reactions/LICENSE.txt), the same on every phone, rather than each
// device's own. 96 px WebP, shown at up to a third of that.
const FILES = { '❤️': 'heart', '😂': 'laugh', '😮': 'wow', '😢': 'sad', '👍': 'thumbs', '🎉': 'party' }
export function Emoji({ emoji, size = 22 }) {
  const file = FILES[emoji]
  if (!file) return <span>{emoji}</span>
  return <img className="emoji" src={`/reactions/${file}.webp`} alt={emoji} width={size} height={size} draggable={false} />
}

// The six reactions as a row of buttons, each with how many people chose it.
// Mine is lit; tapping mine again takes it back, tapping another changes it.
// `reactions` are [{ user_id, emoji }]; `onPick(emoji | null)`.
export function ReactionRow({ reactions, me, onPick, compact = false }) {
  const mine = reactions.find((r) => r.user_id === me)?.emoji ?? null
  return (
    <div className={`reaction-row ${compact ? 'compact' : ''}`} role="group" aria-label="React">
      {REACTIONS.map((emoji) => {
        const n = reactions.filter((r) => r.emoji === emoji).length
        const on = mine === emoji
        return (
          <button
            key={emoji}
            className={`${on ? 'on' : ''} ${n ? 'has' : ''}`}
            onClick={() => onPick(on ? null : emoji)}
            aria-pressed={on}
            aria-label={`${emoji}${n ? `, ${n}` : ''}`}
          >
            <span className="reaction-emoji"><Emoji emoji={emoji} size={compact ? 26 : 24} /></span>
            {n > 0 && <small>{n}</small>}
          </button>
        )
      })}
    </div>
  )
}

// Under a message: only the reactions given, "❤️ 2  😂 1", mine lit.
export function ReactionChips({ reactions, me, onPick }) {
  const counts = REACTIONS.map((emoji) => ({ emoji, n: reactions.filter((r) => r.emoji === emoji).length })).filter((c) => c.n)
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
