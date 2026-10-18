import { useEffect, useMemo, useState } from 'react'
import { useActiveSeason } from '../lib/theme'

// The front page's seasonal dressing, laid over whichever layout is showing
// and never in the way of a tap (see .season-decor in styles.css). Nothing
// outside a season.

const BAT = 'M32 10c-2-4-5-6-8-6 2 3 2 6 0 8-4-3-10-4-16-2 6 2 10 7 11 12 3-3 7-4 11-3 1-2 2-3 2-5 0 2 1 3 2 5 4-1 8 0 11 3 1-5 5-10 11-12-6-2-12-1-16 2-2-2-2-5 0-8-3 0-6 2-8 6z'
const Bat = ({ className }) => (
  <svg className={className} viewBox="0 0 64 32"><path d={BAT} /></svg>
)

// A maple leaf, and where each falling one starts (% across), how big it is
// and how far through its fall it begins, so they never move in step.
const LEAF = 'M12 2l1.8 3.6 3.2-1-1 3.6 3.6.8-2.6 2.6 2 2.4-3.6.4.4 3.6L12 15.4 8.2 18l.4-3.6-3.6-.4 2-2.4L4.4 9l3.6-.8-1-3.6 3.2 1zM11.4 15h1.2v7h-1.2z'
const LEAVES = [[8, 26, 0], [26, 18, -5], [47, 30, -9], [63, 20, -2], [80, 24, -7], [92, 16, -12]]
const LEAF_COLOURS = ['#e07a2e', '#c2452d', '#f2b45a', '#9c5a2a']

// Where the bulbs hang on the wire, and which colour each is.
const BULBS = [[4, 18], [14, 34], [24, 42], [34, 40], [44, 30], [54, 20], [64, 14], [74, 14], [84, 18], [94, 24]]
const BULB_COLOURS = ['#d7263d', '#e8c372', '#3fb37f', '#6db7ff']

// Snowflakes, each its own: where it falls (% across), its size, how long a
// fall takes, how far through it starts, how far it sways and how bright it
// is. Small ones fall slower and fainter, as if further away.
function makeFlakes(n) {
  const rand = (a, b) => a + Math.random() * (b - a)
  return Array.from({ length: n }, () => {
    const size = rand(2, 6)
    const near = (size - 2) / 4 // 0 far .. 1 near
    return {
      left: `${rand(0, 100)}%`,
      size,
      time: rand(20, 32) - near * 6, // seconds for one fall: about 14 (near) to 32 (far)
      delay: -rand(0, 32),
      sway: `${rand(-40, 40)}px`,
      opacity: 0.35 + near * 0.5,
      y: `${rand(0, 100)}%`,
    }
  })
}

// New Year's confetti, gold and silver, each piece drifting slowly down on
// its own course and spin, 20 to 32 seconds a fall.
const CONFETTI_COLOURS = ['#f5c451', '#fff1c1', '#e6e6ef', '#c9952a', '#ffffff']
function makeConfetti(n) {
  const rand = (a, b) => a + Math.random() * (b - a)
  return Array.from({ length: n }, (_, i) => ({
    left: `${rand(0, 100)}%`,
    w: rand(4, 7),
    h: rand(7, 11),
    time: rand(20, 32),
    delay: -rand(0, 32),
    sway: `${rand(-50, 50)}px`,
    spin: `${rand(360, 900)}deg`,
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    y: `${rand(0, 100)}%`,
  }))
}

// The Fourth of July's bunting along the top: pennants hanging from a
// drooping string (the same curve as the path drawn below), red, white, blue.
const PENNANTS = Array.from({ length: 15 }, (_, i) => {
  const t = (i + 0.5) / 15
  return [t * 100, 6 + 68 * t * (1 - t)]
})
const PENNANT_COLOURS = ['#e63946', '#f4f1ea', '#2f5bd3']

// Fireworks: now and then a single burst somewhere up in the sky, in the
// season's colours, drifting down as it fades. Every 8 to 18 seconds on the
// front page, every 3 to 6 in the welcome page's demo (`often`), and none
// with reduced motion.
const SPARKS = Array.from({ length: 16 }, (_, i) => i * 22.5)
const NEW_YEAR_SPARKS = ['#f5c451', '#fff1c1', '#ffffff', '#e8c372']
const JULY_SPARKS = ['#ff4d5e', '#ffffff', '#5b8cff']

function Fireworks({ colours, often }) {
  const [bursts, setBursts] = useState([])
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let t
    let n = 0
    const next = (wait) => {
      t = setTimeout(() => {
        if (!document.hidden) {
          n += 1
          const burst = {
            id: n,
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 30}%`,
            colour: colours[Math.floor(Math.random() * colours.length)],
            reach: `${36 + Math.random() * 40}px`,
          }
          setBursts((b) => [...b.slice(-1), burst])
        }
        next(often ? 3000 + Math.random() * 3000 : 8000 + Math.random() * 10000)
      }, wait)
    }
    next(often ? 800 : 4000)
    return () => clearTimeout(t)
  }, [colours, often])
  return bursts.map((b) => (
    <span key={b.id} className="burst" style={{ left: b.left, top: b.top, color: b.colour, '--reach': b.reach }}>
      {SPARKS.map((a) => <i key={a} style={{ '--a': `${a}deg` }} />)}
    </span>
  ))
}

// Halloween's bats that now and then flit across the page: each at its own
// height, size, speed and direction, and off-screen most of the time.
function makeFlyers(n) {
  const rand = (a, b) => a + Math.random() * (b - a)
  return Array.from({ length: n }, () => ({
    top: `${rand(12, 70)}%`,
    size: rand(14, 24),
    time: rand(22, 38),
    delay: -rand(0, 38),
    reverse: Math.random() < 0.5,
  }))
}

// `show` names a season to dress up as instead of the one that is on, for the
// demo on the welcome page; there the first lightning comes almost at once.
export default function SeasonDecor({ show }) {
  const active = useActiveSeason()
  const season = show ?? active
  const flakes = useMemo(() => makeFlakes(42), [])
  const flyers = useMemo(() => makeFlyers(4), [])
  const confetti = useMemo(() => makeConfetti(26), [])

  // Halloween's lightning: at a random moment every 15 to 40 seconds, a soft
  // double flicker and a faint bolt somewhere in the sky. Dim and brief on
  // purpose (well inside safe-flash limits), and never with reduced motion.
  const [strike, setStrike] = useState(null) // { n, left } for the latest
  useEffect(() => {
    if (season !== 'halloween' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let t
    const next = (wait) => {
      t = setTimeout(() => {
        if (!document.hidden) setStrike((s) => ({ n: (s?.n ?? 0) + 1, left: `${15 + Math.random() * 65}%` }))
        next(15000 + Math.random() * 25000)
      }, wait)
    }
    next(show ? 1200 : 15000 + Math.random() * 25000)
    return () => clearTimeout(t)
  }, [season, show])
  if (season === 'halloween') {
    return (
      <div className="season-decor halloween" aria-hidden="true">
        {strike && (
          <>
            <i key={`flash-${strike.n}`} className="lightning" />
            <svg key={`bolt-${strike.n}`} className="bolt" style={{ left: strike.left }} viewBox="0 0 40 120" fill="none">
              <path d="M24 0L14 44h10L8 86h9L2 120M14 44L4 60M17 86l10 12" />
            </svg>
          </>
        )}
        <svg className="web" viewBox="0 0 80 80" fill="none">
          <path d="M0 0L70 10M0 0L76 40M0 0L40 76M0 0L10 70" />
          <path d="M18 3Q16 12 4 17M34 5Q30 24 7 33M52 8Q46 38 9 50M68 10Q60 52 11 66" />
        </svg>
        {flyers.map((f, i) => (
          <span
            key={i}
            className={`flyer ${f.reverse ? 'reverse' : ''}`}
            style={{ top: f.top, width: f.size, animationDuration: `${f.time}s`, animationDelay: `${f.delay}s` }}
          >
            <Bat />
          </span>
        ))}
      </div>
    )
  }
  if (season === 'thanksgiving') {
    return (
      <div className="season-decor thanksgiving" aria-hidden="true">
        {LEAVES.map(([x, size, delay], i) => (
          <svg
            key={i}
            className="leaf"
            viewBox="0 0 24 24"
            style={{ left: `${x}%`, width: size, fill: LEAF_COLOURS[i % 4], animationDelay: `${delay}s` }}
          >
            <path d={LEAF} />
          </svg>
        ))}
      </div>
    )
  }
  if (season === 'newyear') {
    return (
      <div className="season-decor newyear" aria-hidden="true">
        <Fireworks colours={NEW_YEAR_SPARKS} often={!!show} />
        {confetti.map((c, i) => (
          <i
            key={i}
            className="confetti"
            style={{
              left: c.left, width: c.w, height: c.h, background: c.colour,
              animationDuration: `${c.time}s`, animationDelay: `${c.delay}s`, '--sway': c.sway, '--spin': c.spin, '--y': c.y,
            }}
          />
        ))}
      </div>
    )
  }
  if (season === 'july4') {
    return (
      <div className="season-decor july4" aria-hidden="true">
        <Fireworks colours={JULY_SPARKS} often={!!show} />
        <svg className="string" viewBox="0 0 100 50" preserveAspectRatio="none">
          <path d="M-2 6 Q50 40 102 6" fill="none" />
        </svg>
        <div className="bunting">
          {PENNANTS.map(([x, y], i) => (
            <i key={i} style={{ left: `${x}%`, top: `${y}px`, background: PENNANT_COLOURS[i % 3], '--d': `${(i % 5) * -0.5}s` }} />
          ))}
        </div>
      </div>
    )
  }
  if (season === 'christmas') {
    return (
      <div className="season-decor christmas" aria-hidden="true">
        <svg className="lights" viewBox="0 0 100 50" preserveAspectRatio="none">
          <path d="M-2 10 Q 25 52 50 22 T 102 18" fill="none" />
        </svg>
        <div className="bulbs">
          {BULBS.map(([x, y], i) => (
            <i
              key={i}
              style={{ left: `${x}%`, top: `${y}px`, background: BULB_COLOURS[i % 4], color: BULB_COLOURS[i % 4], '--d': `${(i % 4) * 0.5}s` }}
            />
          ))}
        </div>
        {flakes.map((f, i) => (
          <i
            key={i}
            className="flake"
            style={{
              left: f.left, width: f.size, height: f.size, opacity: f.opacity,
              animationDuration: `${f.time}s`, animationDelay: `${f.delay}s`, '--sway': f.sway, '--y': f.y,
            }}
          />
        ))}
      </div>
    )
  }
  return null
}
