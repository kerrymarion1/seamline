// More seasonal greetings (see Greetings.jsx): three more each for Christmas,
// Halloween and Thanksgiving, and sets of their own for New Year and the
// Fourth of July. Each character drawn here, standing still (MORE_FACES) and
// playing across the screen (MoreStage); their sounds are in lib/sounds.js.

const ACORN = (
  <>
    <path d="M-3.6 -1.2C-3.6 3 -1.6 6 0 6.6 1.6 6 3.6 3 3.6 -1.2Z" fill="#b8763a" />
    <path d="M-4.4 -1C-4.4 -4 4.4 -4 4.4 -1Z" fill="#6b4226" />
    <path d="M0 -3.4V-5.4" stroke="#6b4226" strokeWidth="1" />
  </>
)

// Pseudo-random but steady for one play.
const scatter = (seed, i) => {
  const x = Math.sin(seed * 9301 + i * 49297) * 233280
  return x - Math.floor(x)
}

// ---------- Christmas ----------

// Santa's sleigh, red with a gold runner, two reindeer pulling ahead.
function Sleigh({ size = 150 }) {
  const deer = (x) => (
    <g transform={`translate(${x} 0)`}>
      <path d="M0 14C2 10 8 9 13 10L16 7 17 9 15 12C16 15 14 17 11 17H3C1 17 -1 16 0 14Z" fill="#8a5a33" />
      <path d="M14 7 13 3M14 5 11 4M16 7 18 3M17 5 19 4" stroke="#d9b48a" strokeWidth=".9" strokeLinecap="round" />
      <path className="sl-legs" d="M3 17 1 22M6 17 7 22M10 17 9 22M12 17 14 21" stroke="#8a5a33" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="17.2" cy="10.2" r=".9" fill="#ff3b30" />
    </g>
  )
  return (
    <svg viewBox="0 0 96 32" width={size} height={size / 3} aria-hidden="true">
      <path d="M30 18H44" stroke="#d9b48a" strokeWidth=".7" />
      {deer(44)}
      {deer(66)}
      <path d="M4 14C4 8 10 8 12 12H26C30 12 30 20 26 22H8C5 22 4 18 4 14Z" fill="#d42a2a" />
      <path d="M3 25H28C31 25 32 23 33 21" stroke="#f6cd6b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M8 22 7 25M24 22 25 25" stroke="#f6cd6b" strokeWidth="1.2" />
      <circle cx="16" cy="7" r="4" fill="#f2c9a8" />
      <path d="M12 6C12 1 20 0 21 5Z" fill="#d42a2a" />
      <circle cx="21.4" cy="5.2" r="1.3" fill="#fff" />
      <path d="M13 9C14 13 18 13 19 9" fill="#fff" />
      <rect x="11" y="10" width="10" height="5" rx="2" fill="#d42a2a" />
    </svg>
  )
}

// A reindeer, mid-hop, its red nose glowing.
function Reindeer({ size = 96 }) {
  return (
    <svg viewBox="0 0 56 48" width={size} height={size * 0.86} aria-hidden="true">
      <g stroke="#d9b48a" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M38 10 34 2M36 6 31 4M36 6 38 1" />
        <path d="M44 10 47 2M46 6 51 5M46 6 44 1" />
      </g>
      <ellipse cx="22" cy="30" rx="15" ry="9" fill="#8a5a33" />
      <path d="M33 26C35 20 36 16 38 14L45 15C45 19 41 25 37 30Z" fill="#8a5a33" />
      <ellipse cx="42" cy="13" rx="7" ry="5.4" fill="#9c6a3f" />
      <ellipse cx="34" cy="11" rx="2.6" ry="1.4" fill="#7a4a28" transform="rotate(-30 34 11)" />
      <circle cx="43" cy="11" r="1.1" fill="#1b1012" />
      <circle className="rd-nose" cx="49" cy="14" r="2.6" fill="#ff3b30" />
      <ellipse cx="24" cy="33" rx="9" ry="4.4" fill="#d9b48a" opacity=".55" />
      <path d="M8 27C4 26 3 23 5 21" stroke="#8a5a33" strokeWidth="3" strokeLinecap="round" fill="none" />
      <g className="rd-legs" stroke="#6b4226" strokeWidth="2.6" strokeLinecap="round">
        <path d="M13 37 10 46M18 38 18 47M28 38 30 46M32 36 36 44" />
      </g>
    </svg>
  )
}

// A Christmas tree, its lights twinkling, a star on top.
function Tree({ size = 110 }) {
  const lights = [[22, 16, '#ff4d5e'], [28, 22, '#f6cd6b'], [18, 26, '#6db7ff'], [26, 31, '#3fb37f'], [14, 35, '#f6cd6b'], [32, 37, '#ff4d5e'], [22, 40, '#6db7ff'], [11, 44, '#ff4d5e'], [35, 45, '#3fb37f'], [24, 47, '#f6cd6b']]
  return (
    <svg viewBox="0 0 48 60" width={size} height={size * 1.25} aria-hidden="true">
      <rect x="20" y="49" width="8" height="8" rx="1" fill="#6b4226" />
      <path d="M24 6 12 22H18L8 34H15L4 50H44L33 34H40L30 22H36Z" fill="#2e8b57" />
      <path d="M24 6 30 22H36L24 10Z M33 34H40L30 22 34 30Z" fill="#24704a" opacity=".7" />
      <path d="M12 26Q24 30 34 24M9 38Q24 43 38 36" stroke="#f6cd6b" strokeWidth=".8" fill="none" opacity=".8" />
      {lights.map(([x, y, c], i) => (
        <circle key={i} className="tr-light" cx={x} cy={y} r="1.7" fill={c} style={{ animationDelay: `${(i % 5) * 0.18}s` }} />
      ))}
      <path className="tr-star" d="M24 0 25.6 4.2 30 4.4 26.5 7 27.8 11.4 24 8.8 20.2 11.4 21.5 7 18 4.4 22.4 4.2Z" fill="#f6cd6b" />
    </svg>
  )
}

// ---------- Halloween ----------

// A witch on her broom, cape streaming, hat pointed.
function Witch({ size = 130 }) {
  return (
    <svg viewBox="0 0 80 44" width={size} height={size * 0.55} aria-hidden="true">
      <path d="M4 25 22 28 22 34 3 38Z" fill="#c99a4a" />
      <path d="M6 29 20 30M6 33 20 32" stroke="#9c7434" strokeWidth=".7" />
      <path d="M20 31 74 23" stroke="#8b5a2b" strokeWidth="2.4" strokeLinecap="round" />
      <path className="wt-cape" d="M44 26C38 25 30 24 24 30 30 29 34 30 38 32Z" fill="#5b2d82" />
      <path d="M40 28 52 26 50 12 44 12Z" fill="#3b2452" />
      <path d="M50 18 58 24" stroke="#3b2452" strokeWidth="3" strokeLinecap="round" />
      <circle cx="59" cy="24.4" r="1.6" fill="#8fd16a" />
      <circle cx="48" cy="10" r="4.2" fill="#8fd16a" />
      <path d="M51.6 10.6 54.4 11.4 51.6 12.2Z" fill="#7ab95a" />
      <circle cx="49.4" cy="9" r=".8" fill="#1b1012" />
      <path d="M44 9C42 12 41 15 40 16M45 11 43 15" stroke="#ff8a3d" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="47.6" cy="6.6" rx="8" ry="1.7" fill="#1e1530" />
      <path d="M42.6 6.2 52.4 6.2 47.2 -5Z" fill="#1e1530" />
      <path d="M43.4 4.8 51.6 4.8 51.2 6 43.8 6Z" fill="#ff8a3d" />
    </svg>
  )
}

// A black cat, sitting, eyes glowing, tail curling.
function Cat({ size = 92 }) {
  const fur = '#1c1622'
  return (
    <svg viewBox="0 0 48 52" width={size} height={size * 1.08} aria-hidden="true">
      <path className="ct-tail" d="M33 44C42 44 46 36 42 30 40 27 37 29 39 31 41 34 39 39 33 40Z" fill={fur} stroke="#b9acdf" strokeWidth=".6" />
      <path d="M12 50C10 38 13 28 24 28S38 38 36 50Z" fill={fur} stroke="#b9acdf" strokeWidth=".6" />
      <circle cx="24" cy="19" r="11" fill={fur} stroke="#b9acdf" strokeWidth=".6" />
      <path d="M14 13 13 3 21 9ZM34 13 35 3 27 9Z" fill={fur} stroke="#b9acdf" strokeWidth=".6" />
      <path d="M15.2 10.6 14.8 5.6 18.8 8.6ZM32.8 10.6 33.2 5.6 29.2 8.6Z" fill="#f2a7c3" opacity=".7" />
      <g className="ct-eyes">
        <ellipse cx="19.4" cy="18" rx="3" ry="3.4" fill="#ffd45c" />
        <ellipse cx="28.6" cy="18" rx="3" ry="3.4" fill="#ffd45c" />
        <ellipse cx="19.4" cy="18" rx=".9" ry="2.8" fill="#1b1012" />
        <ellipse cx="28.6" cy="18" rx=".9" ry="2.8" fill="#1b1012" />
      </g>
      <path d="M23 23 24 24 25 23Z" fill="#f2a7c3" />
      <path d="M22 25.4Q24 27 26 25.4" stroke="#b9acdf" strokeWidth=".6" fill="none" />
      <path d="M15 24 8 23M15 25.6 8 27M33 24 40 23M33 25.6 40 27" stroke="#b9acdf" strokeWidth=".5" />
      <ellipse cx="18" cy="50" rx="4" ry="1.8" fill={fur} />
      <ellipse cx="30" cy="50" rx="4" ry="1.8" fill={fur} />
    </svg>
  )
}

// Candy corn, and a wrapped sweet.
function CandyCorn({ size = 22 }) {
  return (
    <svg viewBox="0 0 20 22" width={size} height={size * 1.1} aria-hidden="true">
      <path d="M10 1 19 20H1Z" fill="#fff6e0" />
      <path d="M6.2 9.4 13.8 9.4 17.3 16.8H2.7Z" fill="#f28c28" />
      <path d="M2.7 16.8H17.3L19 20H1Z" fill="#f6c84b" />
    </svg>
  )
}
function Sweet({ size = 26, colour = '#e2364f' }) {
  return (
    <svg viewBox="0 0 30 14" width={size} height={size * 0.47} aria-hidden="true">
      <path d="M8 7 1 2 3 7 1 12ZM22 7 29 2 27 7 29 12Z" fill={colour} opacity=".75" />
      <ellipse cx="15" cy="7" rx="8" ry="6" fill={colour} />
      <path d="M10 4Q15 2 20 4" stroke="#fff" strokeWidth="1.2" fill="none" opacity=".6" />
    </svg>
  )
}

// ---------- Thanksgiving ----------

// A horn of plenty, its fruit spilling out.
function Horn({ size = 120 }) {
  return (
    <svg viewBox="0 0 64 40" width={size} height={size * 0.62} aria-hidden="true">
      <path d="M4 8C6 4 10 6 12 9 18 18 30 22 42 18 46 26 44 34 36 36 22 38 10 26 4 8Z" fill="#c9893f" />
      <path d="M12 12 14 20M18 18 20 27M25 21 26 31M32 22 32 33M38 20 39 32" stroke="#a5682b" strokeWidth="1.2" />
      <ellipse cx="40" cy="27" rx="6" ry="9" fill="#7a4a1e" />
      <circle cx="44" cy="22" r="5" fill="#d8323a" />
      <path d="M44 17 45 14" stroke="#4c6b2a" strokeWidth="1" />
      <circle cx="51" cy="30" r="4.4" fill="#f4b942" />
      <g fill="#7b4a9e"><circle cx="46" cy="33" r="2" /><circle cx="49" cy="35" r="2" /><circle cx="44" cy="36" r="2" /><circle cx="47" cy="38" r="2" /></g>
      <path d="M53 20C55 16 60 16 61 20 60 24 55 25 53 20Z" fill="#e8c46a" />
    </svg>
  )
}

// Fruit for the horn to spill: an apple, a pear, grapes, an ear of corn.
const FRUIT = [
  (s) => <svg viewBox="0 0 12 12" width={s} height={s}><circle cx="6" cy="7" r="5" fill="#d8323a" /><path d="M6 2 7 0" stroke="#4c6b2a" strokeWidth="1" /></svg>,
  (s) => <svg viewBox="0 0 12 14" width={s} height={s * 1.15}><path d="M6 2C8 2 8 5 9 7 11 10 9 13 6 13S1 10 3 7C4 5 4 2 6 2Z" fill="#b6c94a" /></svg>,
  (s) => <svg viewBox="0 0 12 14" width={s} height={s * 1.15} fill="#7b4a9e"><circle cx="4" cy="4" r="2.2" /><circle cx="8" cy="4" r="2.2" /><circle cx="6" cy="7.6" r="2.2" /><circle cx="3.6" cy="7.6" r="2.2" /><circle cx="8.4" cy="7.6" r="2.2" /><circle cx="6" cy="11" r="2.2" /></svg>,
  (s) => <svg viewBox="0 0 8 16" width={s * 0.6} height={s * 1.2}><ellipse cx="4" cy="8" rx="3.4" ry="7" fill="#f6c84b" /><path d="M1 12C1 15 3 16 4 16S7 15 7 12" fill="#8fbf5a" /></svg>,
]

// A scarecrow on his pole, straw hat, arms out and waving.
function Scarecrow({ size = 110 }) {
  return (
    <svg viewBox="0 0 56 68" width={size} height={size * 1.21} aria-hidden="true">
      <path d="M28 34V68" stroke="#7a4a28" strokeWidth="3" />
      <g className="sc-arms">
        <path d="M4 30H52" stroke="#7a4a28" strokeWidth="2.4" />
        <path d="M3 27 0 25M3 30H-1M3 33 0 35M53 27 56 25M53 30H57M53 33 56 35" stroke="#e8c46a" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <path d="M14 26H42L40 46H16Z" fill="#c0392b" />
      <path d="M14 32H42M15 38H41M20 26V46M28 26V46M36 26V46" stroke="#8e2a20" strokeWidth=".9" opacity=".7" />
      <path d="M16 46 14 52 20 48 24 53 28 47 32 53 36 48 42 52 40 46Z" fill="#e8c46a" />
      <circle cx="28" cy="18" r="9" fill="#e4c58a" />
      <path d="M22 21Q28 26 34 21" stroke="#6b4226" strokeWidth="1" fill="none" />
      <path d="M23 22.2 23.6 23.4M26 23.6 26.2 25M29.8 23.6 29.6 25M33 22.2 32.4 23.4" stroke="#6b4226" strokeWidth=".7" />
      <path d="M23 15 26 18M26 15 23 18M30 15 33 18M33 15 30 18" stroke="#3a2418" strokeWidth="1.1" />
      <path d="M27 19 28 21 29 19Z" fill="#f28c28" />
      <ellipse cx="28" cy="10.4" rx="15" ry="3" fill="#d9a35c" />
      <path d="M20 10C20 3 36 3 36 10Z" fill="#c9893f" />
      <path d="M20.4 8.4H35.6" stroke="#c0392b" strokeWidth="1.6" />
    </svg>
  )
}

// A crow, wings up.
function Crow({ size = 30 }) {
  return (
    <svg viewBox="0 0 30 16" width={size} height={size * 0.53} aria-hidden="true">
      <path className="cr-wing" d="M15 8C11 2 5 1 1 3 5 4 8 6 10 9ZM15 8C19 2 25 1 29 3 25 4 22 6 20 9Z" fill="#1c1622" />
      <ellipse cx="15" cy="10" rx="5" ry="3" fill="#1c1622" />
      <path d="M19.4 9 23 9.6 19.6 10.6Z" fill="#e8a33a" />
    </svg>
  )
}

function AcornFace({ size = 30 }) {
  return (
    <svg viewBox="-6 -7 12 14" width={size * 0.86} height={size} aria-hidden="true">
      {ACORN}
    </svg>
  )
}

// ---------- New Year ----------

// A clock about to strike twelve.
function Clock({ size = 110, hands = false }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="#f8f3e6" stroke="#c9952a" strokeWidth="2.4" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        const r1 = i % 3 === 0 ? 15.6 : 17
        return <path key={i} d={`M${24 + Math.sin(a) * r1} ${24 - Math.cos(a) * r1}L${24 + Math.sin(a) * 18.6} ${24 - Math.cos(a) * 18.6}`} stroke="#3a3326" strokeWidth={i % 3 === 0 ? 1.6 : 0.8} />
      })}
      <text x="24" y="12.6" fontSize="5" fontWeight="700" textAnchor="middle" fill="#c9952a" fontFamily="system-ui, sans-serif">12</text>
      <g className={hands ? 'ck-hour' : ''} style={{ transformOrigin: '24px 24px' }}><path d="M24 24V14" stroke="#3a3326" strokeWidth="2" strokeLinecap="round" /></g>
      <g className={hands ? 'ck-minute' : ''} style={{ transformOrigin: '24px 24px' }}><path d="M24 24V8" stroke="#3a3326" strokeWidth="1.3" strokeLinecap="round" /></g>
      <circle cx="24" cy="24" r="1.6" fill="#c9952a" />
    </svg>
  )
}

// A bottle of something sparkling, its cork about to go.
function Champagne({ size = 70, cork = true }) {
  return (
    <svg viewBox="0 0 24 64" width={size * 0.375} height={size} aria-hidden="true" overflow="visible">
      {cork && <g className="cp-cork"><rect x="9" y="-1" width="6" height="7" rx="2" fill="#d9a35c" /></g>}
      <path d="M9 6H15V16C15 20 21 22 21 30V60C21 62 20 63 18 63H6C4 63 3 62 3 60V30C3 22 9 20 9 16Z" fill="#1f5b3a" />
      <path d="M9 6H15V16C15 18 17 19.4 18.4 21H5.6C7 19.4 9 18 9 16Z" fill="#e8c372" />
      <rect x="3" y="34" width="18" height="14" fill="#f8f3e6" />
      <path d="M7 41H17" stroke="#c9952a" strokeWidth="1.4" />
      <path d="M6 24V58" stroke="#fff" strokeWidth="1.2" opacity=".25" />
    </svg>
  )
}

// A starburst of gold, for the New Year buttons.
function Starburst({ size = 22, colour = '#f5c451' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke={colour} strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5" />
      <circle cx="12" cy="12" r="2.2" fill={colour} stroke="none" />
    </svg>
  )
}

// ---------- the Fourth of July ----------

// The stars and stripes.
function Flag({ size = 130 }) {
  return (
    <svg viewBox="0 0 76 40" width={size} height={size * 0.53} aria-hidden="true">
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x="0" y={(i * 40) / 13} width="76" height={40 / 13 + 0.1} fill={i % 2 ? '#f4f1ea' : '#d22b3a'} />
      ))}
      <rect x="0" y="0" width="31" height={(7 * 40) / 13} fill="#2f4fb0" />
      {Array.from({ length: 20 }, (_, i) => (
        <circle key={i} cx={3 + (i % 5) * 6.2 + (Math.floor(i / 5) % 2) * 3} cy={2.6 + Math.floor(i / 5) * 5.2} r=".95" fill="#fff" />
      ))}
    </svg>
  )
}

// A bald eagle, wings spread.
function Eagle({ size = 130 }) {
  return (
    <svg viewBox="0 0 80 36" width={size} height={size * 0.45} aria-hidden="true">
      <g className="eg-wing eg-wing-l"><path d="M34 16C26 6 14 4 2 8 8 9 10 11 8 14 14 13 16 15 14 18 20 17 24 19 24 22 28 20 32 20 36 21Z" fill="#5b3420" /></g>
      <g className="eg-wing eg-wing-r"><path d="M46 16C54 6 66 4 78 8 72 9 70 11 72 14 66 13 64 15 66 18 60 17 56 19 56 22 52 20 48 20 44 21Z" fill="#5b3420" /></g>
      <ellipse cx="40" cy="20" rx="8" ry="6" fill="#5b3420" />
      <path d="M36 24 40 32 44 24Z" fill="#f4f1ea" />
      <circle cx="40" cy="12" r="5" fill="#f4f1ea" />
      <path d="M42 12 47 13.4 43 15.4Z" fill="#f0a63a" />
      <circle cx="41.4" cy="11" r=".9" fill="#1b1012" />
    </svg>
  )
}

// A sparkler, its tip throwing sparks.
function Sparkler({ size = 70, sparks = false }) {
  return (
    <svg viewBox="0 0 40 60" width={size * 0.67} height={size} aria-hidden="true" overflow="visible">
      <path d="M8 58 26 14" stroke="#9aa3ad" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M22 24 28 9" stroke="#5b5f66" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="28" cy="9" r="4" fill="#fff6c4" />
      <circle cx="28" cy="9" r="7" fill="#ffd45c" opacity=".35" />
      {!sparks && <path d="M28 1V-3M28 17V21M20 9H16M36 9H40M22 3 19 0M34 15 37 18M22 15 19 18M34 3 37 0" stroke="#ffd45c" strokeWidth="1.2" strokeLinecap="round" />}
    </svg>
  )
}

// A five-pointed star, for the Fourth of July buttons.
function Star({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 2.5 14.6 9.3 21.8 9.6 16.2 14.1 18.1 21.1 12 17.1 5.9 21.1 7.8 14.1 2.2 9.6 9.4 9.3Z" fill="#2f4fb0" stroke="#f4f1ea" strokeWidth="1.2" />
    </svg>
  )
}
export const SeasonStar = Star
export const SeasonBurst = Starburst

// ---------- standing still ----------

export const MORE_FACES = {
  sleigh: (s) => <Sleigh size={s * 1.5} />,
  reindeer: (s) => <Reindeer size={s} />,
  tree: (s) => <Tree size={s * 0.8} />,
  witch: (s) => <Witch size={s * 1.3} />,
  cat: (s) => <Cat size={s * 0.9} />,
  candy: (s) => <CandyCorn size={s * 0.8} />,
  harvest: (s) => <Horn size={s * 1.3} />,
  scarecrow: (s) => <Scarecrow size={s * 0.85} />,
  acorns: (s) => <AcornFace size={s * 0.9} />,
  midnight: (s) => <Clock size={s} />,
  champagne: (s) => <Champagne size={s} />,
  confetti: (s) => <Starburst size={s * 0.8} colour="#f5c451" />,
  goldworks: (s) => <Starburst size={s * 0.9} colour="#ffe08a" />,
  fireworks: (s) => <Starburst size={s * 0.9} colour="#ff4d5e" />,
  flag: (s) => <Flag size={s * 1.2} />,
  eagle: (s) => <Eagle size={s * 1.3} />,
  sparkler: (s) => <Sparkler size={s} />,
}

// ---------- playing ----------

const SPARKS = Array.from({ length: 16 }, (_, i) => i * 22.5)
function Bursts({ seed, colours, count, top = [10, 40] }) {
  return Array.from({ length: count }, (_, i) => (
    <span
      key={i}
      className="gr-burst"
      style={{
        left: `${12 + scatter(seed, i) * 76}%`,
        top: `${top[0] + scatter(seed, i + 10) * (top[1] - top[0])}%`,
        color: colours[i % colours.length],
        '--reach': `${70 + scatter(seed, i + 20) * 50}px`,
        '--d': `${i * 0.45 + scatter(seed, i + 30) * 0.2}s`,
      }}
    >
      {SPARKS.map((a) => <i key={a} style={{ '--a': `${a}deg` }} />)}
    </span>
  ))
}

const CONFETTI = ['#f5c451', '#fff1c1', '#e6e6ef', '#ff6b8b', '#6db7ff', '#3fb37f']

export function MoreStage({ kind, seed }) {
  switch (kind) {
    case 'sleigh':
      return <div className="gr-actor"><Sleigh size={190} /></div>
    case 'reindeer':
      return <div className="gr-actor"><div className="gr-hop"><Reindeer size={110} /></div></div>
    case 'tree':
      return <div className="gr-actor"><Tree size={150} /></div>
    case 'witch':
      return <div className="gr-actor"><Witch size={170} /></div>
    case 'cat':
      return <div className="gr-actor"><Cat size={130} /></div>
    case 'candy':
      return Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          className="gr-flake gr-candy"
          style={{
            left: `${scatter(seed, i) * 100}%`,
            animationDelay: `${scatter(seed, i + 40) * 1.1}s`,
            animationDuration: `${1.8 + scatter(seed, i + 80) * 1.1}s`,
            '--drift': `${(scatter(seed, i + 120) - 0.5) * 70}px`,
          }}
        >
          {i % 2 ? <CandyCorn size={18 + Math.round(scatter(seed, i + 160) * 10)} /> : <Sweet size={26} colour={['#e2364f', '#7b4a9e', '#3fb37f', '#f28c28'][i % 4]} />}
        </span>
      ))
    case 'harvest':
      return (
        <div className="gr-actor">
          <Horn size={170} />
          {Array.from({ length: 10 }, (_, i) => {
            const a = -Math.PI * (0.05 + scatter(seed, i) * 0.6)
            const d = 90 + scatter(seed, i + 10) * 80
            return (
              <span
                key={i}
                className="gr-fruit"
                style={{ '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, animationDelay: `${0.5 + i * 0.08}s` }}
              >
                {FRUIT[i % FRUIT.length](16 + Math.round(scatter(seed, i + 20) * 8))}
              </span>
            )
          })}
        </div>
      )
    case 'scarecrow':
      return (
        <>
          <div className="gr-actor"><Scarecrow size={150} /></div>
          {[0, 1, 2].map((i) => (
            <span key={i} className="gr-crow" style={{ top: `${30 + i * 8}%`, animationDelay: `${1.1 + i * 0.2}s` }}><Crow size={34 - i * 4} /></span>
          ))}
        </>
      )
    case 'acorns':
      return Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="gr-acorn"
          style={{
            left: `${6 + scatter(seed, i) * 88}%`,
            animationDelay: `${scatter(seed, i + 40) * 1.2}s`,
            '--spin': `${(scatter(seed, i + 60) - 0.5) * 120}deg`,
          }}
        >
          <AcornFace size={22 + Math.round(scatter(seed, i + 80) * 12)} />
        </span>
      ))
    case 'midnight':
      return (
        <>
          <div className="gr-actor"><Clock size={150} hands /></div>
          <Bursts seed={seed} colours={['#f5c451', '#fff1c1', '#ffffff']} count={3} top={[12, 30]} />
        </>
      )
    case 'champagne':
      return (
        <div className="gr-actor">
          <Champagne size={150} />
          {Array.from({ length: 16 }, (_, i) => (
            <i
              key={i}
              className="gr-bubble"
              style={{
                left: `${20 + scatter(seed, i) * 20}px`,
                width: `${4 + scatter(seed, i + 10) * 6}px`,
                height: `${4 + scatter(seed, i + 10) * 6}px`,
                animationDelay: `${0.7 + scatter(seed, i + 20) * 1.2}s`,
                '--dx': `${(scatter(seed, i + 30) - 0.5) * 60}px`,
              }}
            />
          ))}
        </div>
      )
    case 'confetti':
      return Array.from({ length: 48 }, (_, i) => {
        const left = i % 2 === 0
        return (
          <i
            key={i}
            className={`gr-confetti ${left ? 'from-left' : 'from-right'}`}
            style={{
              background: CONFETTI[i % CONFETTI.length],
              width: `${5 + scatter(seed, i) * 5}px`,
              height: `${8 + scatter(seed, i + 10) * 8}px`,
              '--dx': `${(left ? 1 : -1) * (25 + scatter(seed, i + 20) * 55)}vw`,
              '--up': `${-(45 + scatter(seed, i + 30) * 40)}vh`,
              '--spin': `${(scatter(seed, i + 40) - 0.5) * 1440}deg`,
              animationDelay: `${scatter(seed, i + 50) * 0.25}s`,
            }}
          />
        )
      })
    case 'goldworks':
      return <Bursts seed={seed} colours={['#f5c451', '#fff1c1', '#ffffff', '#e8c372']} count={5} />
    case 'fireworks':
      return <Bursts seed={seed} colours={['#ff4d5e', '#ffffff', '#5b8cff']} count={6} />
    case 'flag':
      return <div className="gr-actor"><div className="gr-wave"><Flag size={190} /></div></div>
    case 'eagle':
      return <div className="gr-actor"><Eagle size={190} /></div>
    case 'sparkler':
      return (
        <div className="gr-actor">
          <Sparkler size={120} sparks />
          <span className="gr-spray">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ '--a': `${scatter(seed, i) * 360}deg`, '--r': `${20 + scatter(seed, i + 10) * 40}px`, animationDelay: `${scatter(seed, i + 20) * 0.6}s` }} />
            ))}
          </span>
        </div>
      )
    default:
      return null
  }
}
