// A person's profile photo, or, when they haven't set one, their initials on
// a colour of their own (the same colour for them everywhere, picked from
// their account, else their name). `person` is { id, name, avatar }.
// A photo opens big when tapped (AvatarZoom), even inside a button, unless
// `zoom` is false: where tapping it already means something else (your own
// picture as the way to Settings, picking someone, changing your photo).
import { zoomAvatar } from './AvatarZoom'

const COLOURS = [
  ['#ff8a4c', '#e8456b'],
  ['#f5a524', '#e5603a'],
  ['#3b82f6', '#22b8cf'],
  ['#10b981', '#0d9488'],
  ['#8b5cf6', '#d946ef'],
  ['#ec4899', '#f43f5e'],
  ['#14b8a6', '#6366f1'],
  ['#f97316', '#c2410c'],
]

const pick = (key) => COLOURS[[...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLOURS.length]

// "Kerry Marion" → "KM", "Kmarion" → "K"; one letter when it's small.
function initials(name, two) {
  const words = name.split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const letters = two && words.length > 1 ? words[0][0] + words.at(-1)[0] : words[0][0]
  return letters.toUpperCase()
}

export default function Avatar({ person, size = 30, className = '', zoom = true }) {
  const box = { width: size, height: size }
  if (person?.avatar) {
    const open = (e) => {
      e.preventDefault()
      e.stopPropagation()
      zoomAvatar(person)
    }
    return (
      <img
        className={`avatar ${zoom ? 'zooms' : ''} ${className}`} src={person.avatar} alt="" style={box} draggable={false}
        onClick={zoom ? open : undefined}
      />
    )
  }
  const name = (person?.name ?? '').trim()
  const text = name ? initials(name, size >= 26) : '?'
  const [from, to] = pick(person?.id || name || '?')
  const style = {
    ...box,
    background: `linear-gradient(135deg, ${from}, ${to})`,
    fontSize: Math.round(size * (text.length > 1 ? 0.38 : 0.46)),
  }
  return <span className={`avatar ${className}`} style={style} aria-hidden="true">{text}</span>
}
