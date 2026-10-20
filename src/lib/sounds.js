// The sounds Hugpix makes, made on the spot with Web Audio (nothing to fetch
// or license), except Christmas's two, which are public-domain recordings in
// public/sounds (the same as Plait's: "Sleigh_Bells (7-22-12 edit)" by
// jsm1963, freesound.org/s/453202, and "santa - ho ho ho #1" by
// canucklovingbrit, freesound.org/s/110641, both CC0).
//
// Photos added to an album make the season's sound, two that take turns,
// each a little different every time, as a food logged does in Plait:
// Halloween's thunder and a ghost, Thanksgiving's gobble and clinking glasses,
// Christmas's sleigh bells and "ho, ho, ho", New Year's party popper and a
// firework, the Fourth of July's firework and firecrackers, and every other
// day a camera shutter and a sparkle. Settings' Sounds switch turns them off.
//
// A phone lets a page make sound only once it has been touched, so the first
// tap anywhere wakes it (main.jsx). An iPhone on silent stays silent.

const SOUND = 'seamline:sounds'
let ctx = null
let white = null
let brown = null

export const soundOn = () => {
  try {
    return localStorage.getItem(SOUND) !== 'off'
  } catch {
    return true
  }
}
export function setSoundOn(on) {
  try {
    localStorage.setItem(SOUND, on ? 'on' : 'off')
  } catch {
    // Storage blocked: it stays on for now.
  }
}

export function audio() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
  } catch {
    return null
  }
  return ctx
}

// From a tap: let the page make sound.
export function unlockAudio() {
  const c = audio()
  if (c && c.state !== 'running') c.resume().catch(() => {})
}

// A context ready to play now, or null.
function ready() {
  const c = audio()
  if (!c) return null
  if (c.state !== 'running') c.resume().catch(() => {})
  return c
}

// `secs` of noise: white, or brown (each sample leaning on the last: a low roar).
function noise(c, secs, kind) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate)
  const d = b.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    if (kind === 'white') {
      d[i] = w
      continue
    }
    last = (last + 0.02 * w) / 1.02
    d[i] = last * 3.5
  }
  return b
}
const whiteOf = (c) => (white ??= noise(c, 1, 'white'))

// Everything goes through a gentle limiter at `level`.
function master(c, level) {
  const out = c.createDynamicsCompressor()
  out.connect(c.destination)
  const g = c.createGain()
  g.gain.value = level
  g.connect(out)
  return g
}

// A short burst of noise through a filter: a click, a pop, a crack.
function burst(c, to, at, { type = 'bandpass', freq = 2000, q = 1, level = 0.5, decay = 0.05 }) {
  const src = c.createBufferSource()
  src.buffer = whiteOf(c)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(level, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  src.connect(f).connect(g).connect(to)
  src.start(at, Math.random() * 0.5)
  src.stop(at + decay + 0.02)
}

// A bell-like note: a sine and its fainter overtone, ringing away.
function ping(c, to, at, freq, level = 0.2, decay = 0.6) {
  for (const [ratio, part] of [[1, 1], [2.76, 0.25]]) {
    const o = c.createOscillator()
    o.frequency.value = freq * ratio
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(level * part, at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * (ratio === 1 ? 1 : 0.5))
    o.connect(g).connect(to)
    o.start(at)
    o.stop(at + decay + 0.05)
  }
}

// ---------- Halloween ----------

// A crack of bright noise over a long roll that loses its top as it goes.
export function thunder() {
  const c = ready()
  if (!c) return
  brown ??= noise(c, 4.5, 'brown')
  const t = c.currentTime + 0.03
  const long = 2.6 + Math.random() * 1.2
  const out = master(c, 0.85)
  burst(c, out, t, { type: 'lowpass', freq: 2600 + Math.random() * 1400, level: 0.4, decay: 0.28 })
  const roll = c.createBufferSource()
  roll.buffer = brown
  const dark = c.createBiquadFilter()
  dark.type = 'lowpass'
  dark.Q.value = 0.7
  dark.frequency.setValueAtTime(1400, t)
  dark.frequency.exponentialRampToValueAtTime(380, t + long * 0.6)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(1, t + 0.14)
  let at = t + 0.14
  for (let i = 0; i < 3; i++) {
    at += 0.25 + Math.random() * 0.35
    g.gain.linearRampToValueAtTime(0.45 + Math.random() * 0.5, at)
  }
  g.gain.exponentialRampToValueAtTime(0.001, t + long)
  roll.connect(dark).connect(g).connect(out)
  roll.start(t, Math.random() * 0.4)
  roll.stop(t + long + 0.05)
}

// A ghost's "wooOOooo": rising and falling away, wavering, with an echo.
export function ghost() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const long = 2.2 + Math.random() * 0.6
  const low = 260 + Math.random() * 70
  const out = master(c, 0.7)
  const echo = c.createDelay(1)
  echo.delayTime.value = 0.24
  const back = c.createGain()
  back.gain.value = 0.35
  const wet = c.createGain()
  wet.gain.value = 0.4
  echo.connect(back).connect(echo)
  echo.connect(wet).connect(out)
  const voice = c.createGain()
  voice.gain.setValueAtTime(0.0001, t)
  voice.gain.exponentialRampToValueAtTime(0.5, t + 0.4)
  voice.gain.setValueAtTime(0.5, t + long * 0.55)
  voice.gain.exponentialRampToValueAtTime(0.001, t + long)
  const oo = c.createBiquadFilter()
  oo.type = 'lowpass'
  oo.frequency.value = 950
  oo.Q.value = 1.4
  voice.connect(oo)
  oo.connect(out)
  oo.connect(echo)
  const lfo = c.createOscillator()
  lfo.frequency.value = 5 + Math.random() * 1.5
  const depth = c.createGain()
  depth.gain.value = low * 0.035
  lfo.connect(depth)
  for (const [type, detune] of [['sine', 0], ['triangle', 7]]) {
    const o = c.createOscillator()
    o.type = type
    o.detune.value = detune
    o.frequency.setValueAtTime(low, t)
    o.frequency.exponentialRampToValueAtTime(low * 1.75, t + long * 0.4)
    o.frequency.exponentialRampToValueAtTime(low * 0.8, t + long)
    depth.connect(o.frequency)
    o.connect(voice)
    o.start(t)
    o.stop(t + long + 0.05)
  }
  lfo.start(t)
  lfo.stop(t + long + 0.05)
}

// ---------- Thanksgiving ----------

// "Gobble-obble-obble": quick buzzy syllables, each dropping, the run fading.
export function gobble() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const n = 7 + Math.floor(Math.random() * 3)
  const step = 0.075 + Math.random() * 0.015
  const top = 620 + Math.random() * 120
  const end = t + n * step + 0.05
  const out = master(c, 1.3)
  const throat = c.createBiquadFilter()
  throat.type = 'bandpass'
  throat.frequency.value = 1100
  throat.Q.value = 1.2
  const soft = c.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 3200
  throat.connect(soft).connect(out)
  const voice = c.createGain()
  voice.gain.setValueAtTime(0.0001, t)
  voice.connect(throat)
  const oscs = ['sawtooth', 'square'].map((type, k) => {
    const o = c.createOscillator()
    o.type = type
    o.detune.value = k * 12
    o.connect(voice)
    return o
  })
  for (let i = 0; i < n; i++) {
    const at = t + i * step
    const f = top * (1 - i * 0.035)
    for (const o of oscs) {
      o.frequency.setValueAtTime(f * 1.15, at)
      o.frequency.exponentialRampToValueAtTime(f * 0.8, at + step * 0.9)
    }
    voice.gain.setValueAtTime(0.0001, at)
    voice.gain.linearRampToValueAtTime(0.5 * (1 - i / (n * 1.6)), at + 0.012)
    voice.gain.exponentialRampToValueAtTime(0.0001, at + step * 0.85)
  }
  for (const o of oscs) {
    o.start(t)
    o.stop(end)
  }
}

// Two glasses touching, "clink-clink", ringing on, a little apart in pitch.
export function clink() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const f = 1850 + Math.random() * 250
  const out = master(c, 0.9)
  for (const [at, hard] of [[t, 1], [t + 0.11 + Math.random() * 0.03, 0.55]]) {
    burst(c, out, at, { type: 'highpass', freq: 3000, level: 0.25 * hard, decay: 0.03 })
    ping(c, out, at, f, 0.22 * hard, 1.6)
    ping(c, out, at, f * (1.045 + Math.random() * 0.02), 0.2 * hard, 1.4)
  }
}

// ---------- Christmas: two recordings ----------

const RECORDINGS = { bells: '/sounds/sleigh-bells.mp3', santa: '/sounds/ho-ho-ho.mp3' }
const decoded = {}
function playRecording(name, level, secs) {
  const c = ready()
  if (!c) return
  decoded[name] ??= fetch(RECORDINGS[name])
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    // The callback form: older Safari has no promise from decodeAudioData.
    .then((b) => (b ? new Promise((done) => c.decodeAudioData(b, done, () => done(null))) : null))
    .catch(() => null)
  decoded[name].then((buffer) => {
    if (!buffer) {
      delete decoded[name]
      return
    }
    const t = c.currentTime + 0.02
    const g = master(c, level)
    const s = c.createBufferSource()
    s.buffer = buffer
    s.connect(g)
    if (secs && secs < buffer.duration) {
      g.gain.setValueAtTime(level, t + secs - Math.min(0.5, secs / 4))
      g.gain.linearRampToValueAtTime(0.0001, t + secs)
      s.start(t, 0, secs)
    } else s.start(t)
  })
}
export const sleighBells = () => playRecording('bells', 1, 1.5)
export const hoHoHo = () => playRecording('santa', 1.5)

// ---------- New Year and the Fourth of July ----------

// A firework: a whistle climbing, a deep boom, then a shower of crackles.
export function firework() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const out = master(c, 0.9)
  const rise = 0.55 + Math.random() * 0.2
  const whistle = c.createOscillator()
  whistle.type = 'sine'
  whistle.frequency.setValueAtTime(700, t)
  whistle.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 600, t + rise)
  const wg = c.createGain()
  wg.gain.setValueAtTime(0.0001, t)
  wg.gain.exponentialRampToValueAtTime(0.06, t + 0.08)
  wg.gain.exponentialRampToValueAtTime(0.0001, t + rise)
  whistle.connect(wg).connect(out)
  whistle.start(t)
  whistle.stop(t + rise + 0.02)
  const boom = t + rise
  burst(c, out, boom, { type: 'lowpass', freq: 900, level: 1, decay: 0.7 })
  burst(c, out, boom, { type: 'bandpass', freq: 2400, q: 0.8, level: 0.35, decay: 0.12 })
  for (let i = 0; i < 18; i++) {
    const at = boom + 0.25 + Math.random() * 1.1
    burst(c, out, at, { type: 'highpass', freq: 3500 + Math.random() * 2500, level: 0.08 + Math.random() * 0.1, decay: 0.02 + Math.random() * 0.03 })
  }
}

// A string of firecrackers: quick uneven pops, louder and softer.
export function firecrackers() {
  const c = ready()
  if (!c) return
  const out = master(c, 0.9)
  let at = c.currentTime + 0.03
  const n = 10 + Math.floor(Math.random() * 6)
  for (let i = 0; i < n; i++) {
    burst(c, out, at, { type: 'bandpass', freq: 1500 + Math.random() * 1500, q: 0.7, level: 0.35 + Math.random() * 0.45, decay: 0.05 + Math.random() * 0.04 })
    at += 0.05 + Math.random() * 0.11
  }
}

// A party popper: a sharp pop, then the confetti's rustle and a few bright pings.
export function popper() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const out = master(c, 0.9)
  burst(c, out, t, { type: 'bandpass', freq: 1200, q: 0.6, level: 0.9, decay: 0.09 })
  const rustle = c.createBufferSource()
  rustle.buffer = whiteOf(c)
  const hiss = c.createBiquadFilter()
  hiss.type = 'highpass'
  hiss.frequency.value = 4000
  const rg = c.createGain()
  rg.gain.setValueAtTime(0.0001, t + 0.05)
  rg.gain.exponentialRampToValueAtTime(0.05, t + 0.15)
  rg.gain.exponentialRampToValueAtTime(0.0001, t + 1)
  rustle.connect(hiss).connect(rg).connect(out)
  rustle.start(t + 0.05)
  rustle.stop(t + 1.05)
  const notes = [1568, 2093, 2637, 3136]
  for (let i = 0; i < 4; i++) ping(c, out, t + 0.12 + i * 0.07 + Math.random() * 0.03, notes[i], 0.08, 0.5)
}

// ---------- every other day ----------

// A camera's shutter: two crisp clicks, the blades closing and opening.
export function shutter() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const out = master(c, 1)
  burst(c, out, t, { type: 'highpass', freq: 2500, level: 0.6, decay: 0.025 })
  burst(c, out, t + 0.002, { type: 'bandpass', freq: 900, q: 2, level: 0.35, decay: 0.04 })
  const gap = 0.07 + Math.random() * 0.02
  burst(c, out, t + gap, { type: 'highpass', freq: 3000, level: 0.45, decay: 0.03 })
  burst(c, out, t + gap + 0.002, { type: 'bandpass', freq: 1100, q: 2, level: 0.25, decay: 0.05 })
}

// A sparkle: three bright notes climbing, a little shimmer on each.
export function sparkle() {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const out = master(c, 0.9)
  const lift = Math.random() < 0.5 ? 1 : 1.122
  ;[1047, 1319, 1568].forEach((f, i) => ping(c, out, t + i * 0.085, f * lift, 0.16, 0.7))
  ping(c, out, t + 0.3, 2093 * lift, 0.07, 0.9)
}

// ---------- what photos added sound like ----------

const TURNS = {
  halloween: [thunder, ghost],
  thanksgiving: [gobble, clink],
  christmas: [sleighBells, hoHoHo],
  newyear: [popper, firework],
  july4: [firework, firecrackers],
  everyday: [shutter, sparkle],
}
const turn = {}
export function addedSound(season) {
  if (!soundOn()) return
  const sounds = TURNS[season] ?? TURNS.everyday
  const key = TURNS[season] ? season : 'everyday'
  const i = turn[key] ?? 0
  sounds[i % sounds.length]()
  turn[key] = i + 1
}

// Christmas's recordings, fetched ahead so the first one plays on time.
export function preloadSeason(season) {
  if (season !== 'christmas') return
  for (const url of Object.values(RECORDINGS)) fetch(url).catch(() => {})
}
