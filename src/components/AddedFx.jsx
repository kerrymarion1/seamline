import { useEffect, useState } from 'react'
import { BAT, LEAF, LEAF_COLOURS } from './SeasonDecor'
import { stillPlease } from '../lib/feedback'
import { preloadSeason } from '../lib/sounds'
import { useActiveSeason } from '../lib/theme'

// The burst on screen when photos go into an album (see celebrateAdded in
// lib/feedback.js), over whatever is showing and never in the way of a tap:
// hearts rising on an everyday, and on a season its own: lightning and bats
// for Halloween, a fall of leaves for Thanksgiving, snow for Christmas,
// confetti and a firework for New Year, fireworks for the Fourth of July.
// Gone in under three seconds; nothing at all when the phone asks for less
// motion.

const HEART = 'M12 21C5 15 1 11.5 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 4.5-4 8-11 14z'
const BOLT = 'M24 0L14 44h10L8 86h9L2 120M14 44L4 60M17 86l10 12'
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const SPARKS = Array.from({ length: 16 }, (_, i) => i * 22.5)

function burstAt(x, y, colours, delay) {
  return { kind: 'burst', x: `${x}%`, y: `${y}%`, colour: pick(colours), reach: `${rand(60, 95)}px`, delay: `${delay}s` }
}

// What one burst is made of, every piece placed at random.
function partsFor(season) {
  if (season === 'halloween') {
    return [
      { kind: 'flash' },
      { kind: 'bolt', x: `${rand(15, 75)}%` },
      ...Array.from({ length: 6 }, () => ({
        kind: 'bat', x: `${rand(10, 85)}%`, size: rand(36, 60), time: `${rand(1.4, 2.2)}s`, delay: `${rand(0, 0.5)}s`, dx: `${rand(-30, 30)}vw`,
      })),
    ]
  }
  if (season === 'thanksgiving') {
    return Array.from({ length: 16 }, () => ({
      kind: 'leaf', x: `${rand(0, 95)}%`, size: rand(16, 32), colour: pick(LEAF_COLOURS), time: `${rand(1.6, 2.5)}s`,
      delay: `${rand(0, 0.5)}s`, dx: `${rand(-20, 20)}vw`, spin: `${rand(-540, 540)}deg`,
    }))
  }
  if (season === 'christmas') {
    return Array.from({ length: 34 }, () => ({
      kind: 'snow', x: `${rand(0, 100)}%`, size: rand(4, 10), time: `${rand(1.5, 2.5)}s`, delay: `${rand(0, 0.6)}s`, dx: `${rand(-8, 8)}vw`,
    }))
  }
  if (season === 'newyear') {
    const colours = ['#f5c451', '#fff1c1', '#e6e6ef', '#c9952a', '#ffffff']
    return [
      burstAt(rand(25, 75), rand(12, 28), colours, 0.35),
      ...Array.from({ length: 34 }, () => ({
        kind: 'confetti', colour: pick(colours), w: rand(5, 9), h: rand(9, 15), time: `${rand(1.6, 2.4)}s`, delay: `${rand(0, 0.15)}s`,
        dx: `${rand(-42, 42)}vw`, up: `${-rand(45, 75)}vh`, spin: `${rand(-720, 720)}deg`,
      })),
    ]
  }
  if (season === 'july4') {
    const colours = ['#ff4d5e', '#ffffff', '#5b8cff']
    return [burstAt(rand(15, 40), rand(12, 30), colours, 0), burstAt(rand(55, 85), rand(10, 26), colours, 0.35), burstAt(rand(35, 65), rand(26, 40), colours, 0.7)]
  }
  return Array.from({ length: 10 }, () => ({
    kind: 'heart', x: `${rand(30, 70)}%`, size: rand(16, 32), time: `${rand(1.3, 2)}s`, delay: `${rand(0, 0.35)}s`,
    dx: `${rand(-22, 22)}vw`, spin: `${rand(-25, 25)}deg`, colour: pick(['var(--accent)', 'var(--accent-2)', '#ff6b8b']),
  }))
}

function Part({ p }) {
  switch (p.kind) {
    case 'flash':
      return <i className="fx-flash" />
    case 'bolt':
      return (
        <svg className="fx-bolt" style={{ left: p.x }} viewBox="0 0 40 120" preserveAspectRatio="none" fill="none">
          <path d={BOLT} />
        </svg>
      )
    case 'bat':
      return (
        <svg className="fx-bat" viewBox="0 0 64 32" style={{ left: p.x, width: p.size, '--t': p.time, '--d': p.delay, '--dx': p.dx }}>
          <path d={BAT} />
        </svg>
      )
    case 'leaf':
      return (
        <svg
          className="fx-fall"
          viewBox="0 0 24 24"
          style={{ left: p.x, width: p.size, fill: p.colour, '--t': p.time, '--d': p.delay, '--dx': p.dx, '--r': p.spin }}
        >
          <path d={LEAF} />
        </svg>
      )
    case 'snow':
      return <i className="fx-fall fx-snow" style={{ left: p.x, width: p.size, height: p.size, '--t': p.time, '--d': p.delay, '--dx': p.dx, '--r': '0deg' }} />
    case 'confetti':
      return (
        <i
          className="fx-confetti"
          style={{ width: p.w, height: p.h, background: p.colour, '--t': p.time, '--d': p.delay, '--dx': p.dx, '--up': p.up, '--r': p.spin }}
        />
      )
    case 'burst':
      return (
        <span className="fx-burst" style={{ left: p.x, top: p.y, color: p.colour, '--reach': p.reach, '--d': p.delay }}>
          {SPARKS.map((a) => <i key={a} style={{ '--a': `${a}deg` }} />)}
        </span>
      )
    default:
      return (
        <svg className="fx-heart" viewBox="0 0 24 22" style={{ left: p.x, width: p.size, color: p.colour, '--t': p.time, '--d': p.delay, '--dx': p.dx, '--r': p.spin }}>
          <path d={HEART} fill="currentColor" />
        </svg>
      )
  }
}

export default function AddedFx() {
  const season = useActiveSeason()
  const [shows, setShows] = useState([])

  // Christmas's two recordings, ready before the first photo goes in.
  useEffect(() => preloadSeason(season), [season])

  useEffect(() => {
    let n = 0
    const timers = new Set()
    const added = (e) => {
      if (stillPlease()) return
      const id = ++n
      setShows((s) => [...s.slice(-1), { id, parts: partsFor(e.detail?.season) }])
      const t = setTimeout(() => {
        timers.delete(t)
        setShows((s) => s.filter((x) => x.id !== id))
      }, 2900)
      timers.add(t)
    }
    window.addEventListener('hugpix:added', added)
    return () => {
      window.removeEventListener('hugpix:added', added)
      timers.forEach(clearTimeout)
    }
  }, [])

  return shows.map((show) => (
    <div key={show.id} className="added-fx" aria-hidden="true">
      {show.parts.map((p, i) => <Part key={i} p={p} />)}
    </div>
  ))
}
