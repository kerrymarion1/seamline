import { addedSound } from './sounds'
import { activeSeason } from './theme'

// What happens when photos or videos go into an album, the way a food logged
// in Plait answers: a pulse in the hand in the season's rhythm (Android; an
// iPhone has no vibration for web pages), the season's sound (lib/sounds.js),
// a burst on screen (components/AddedFx.jsx), and on a seasonal theme the
// page giving a little shake, which an iPhone does too. Settings has a switch
// for the sound and one for the pulse; nothing moves when the phone asks for
// reduced motion.

const VIBRATE = 'seamline:vibrate'

export const vibrateOn = () => {
  try {
    return localStorage.getItem(VIBRATE) !== 'off'
  } catch {
    return true
  }
}
export function setVibrateOn(on) {
  try {
    localStorage.setItem(VIBRATE, on ? 'on' : 'off')
  } catch {
    // Storage blocked: it stays on for now.
  }
}

// A short double pulse, or a pattern of its own.
export function buzz(pattern = [14, 40, 20]) {
  if (!vibrateOn()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not supported.
  }
}

// Each season's rhythm: thunder's crack and roll, a gobble, jingling bells,
// a pop and crackle, a boom and crackle, and the everyday double tap.
const PATTERNS = {
  halloween: [30, 60, 90, 40, 160],
  thanksgiving: [18, 45, 18, 45, 18, 45, 18],
  christmas: [12, 30, 12, 30, 12, 30, 12, 30, 40],
  newyear: [10, 30, 60, 50, 12, 25, 12, 25, 12],
  july4: [70, 50, 12, 25, 12, 25, 12, 25, 12],
  everyday: [14, 40, 20],
}

export const stillPlease = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let quaking = 0
function quake() {
  const root = document.documentElement
  window.clearTimeout(quaking)
  delete root.dataset.quake
  void root.offsetWidth // a second add in a row starts the shake over
  root.dataset.quake = ''
  quaking = window.setTimeout(() => delete root.dataset.quake, 550)
}

// `count` photos and videos were just added.
export function celebrateAdded(count = 1) {
  const season = activeSeason()?.id ?? 'everyday'
  buzz(PATTERNS[season] ?? PATTERNS.everyday)
  addedSound(season)
  window.dispatchEvent(new CustomEvent('hugpix:added', { detail: { season, count } }))
  if (season !== 'everyday' && !stillPlease()) quake()
}
