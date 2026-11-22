import { useActiveSeason } from '../lib/theme'

// The seven reactions: love, laugh, dance, smile, wave, like, roll eyes. Each
// is saved by name (lib/social.js) and shown as the character of whatever
// theme is showing: a 3D smiley every day, a jack-o'-lantern at Halloween, a
// turkey at Thanksgiving, Santa at Christmas, a party penguin at New Year and
// an eagle in a stars-and-stripes hat on the Fourth of July. So a love given
// in November is the turkey hugging a heart, and in December it's Santa.
// The stickers are small WebPs in public/reactions/<theme>-<kind>.webp, made
// in Kerry's Artlist account; the movement is CSS (.rf in styles.css), one
// kind of movement each, and stops for anyone who asks for less motion.

export const REACTION_KINDS = ['love', 'laugh', 'dance', 'smile', 'wave', 'like', 'rolleyes']
const THEMES = ['everyday', 'newyear', 'july4', 'halloween', 'thanksgiving', 'christmas']

// Love and Laugh carry a badge on the seasonal characters, a red heart and a
// face laughing to tears (Fluent, public/reactions/LICENSE.txt), so they
// can't be mistaken for the others at a glance. The everyday smiley's own
// face already says it.
const BADGES = { love: 'heart', laugh: 'laugh' }

// One reaction, in the theme showing (or `season`). `still` holds it in place.
// Its size is `size`, unless the place it sits in sets one (.rf width).
export function ReactionFace({ kind, size = 24, season, still = false }) {
  const showing = useActiveSeason()
  const wanted = season ?? showing
  const theme = THEMES.includes(wanted) ? wanted : 'everyday'
  const badge = theme !== 'everyday' && BADGES[kind]
  return (
    <span className={`rf rf-${kind}${still ? ' still' : ''}`} style={{ '--rf-size': `${size}px` }}>
      <img src={`/reactions/${theme}-${kind}.webp`} alt="" draggable={false} decoding="async" />
      {badge && <img className="rf-badge" src={`/reactions/${badge}.webp`} alt="" draggable={false} decoding="async" />}
    </span>
  )
}
