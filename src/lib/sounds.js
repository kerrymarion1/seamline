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

// ---------- the sounds of the further greetings (components/GreetingsMore.jsx) ----------

// A buzzy voice note: `type` through a vowel-like filter, gliding `from` to `to`.
function voice(c, to, at, len, from, end, { type = 'sawtooth', formant = 1200, q = 4, level = 0.4 } = {}) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(from, at)
  o.frequency.exponentialRampToValueAtTime(end, at + len)
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = formant
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(level, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  o.connect(f).connect(g).connect(to)
  o.start(at)
  o.stop(at + len + 0.02)
  return { o, f }
}

// A witch's cackle: "heh-heh-heh-heh", quick and falling.
function cackle() {
  const c = ready()
  if (!c) return
  const out = master(c, 1.2)
  const t = c.currentTime + 0.03
  for (let i = 0; i < 7; i++) {
    const f = 900 - i * 45 + Math.random() * 40
    voice(c, out, t + i * 0.12, 0.09, f * 1.1, f * 0.85, { formant: 1500, q: 3, level: 0.5 })
  }
}

// A cat's meow: rising, then falling, through an opening mouth.
function meow() {
  const c = ready()
  if (!c) return
  const out = master(c, 1.1)
  const t = c.currentTime + 0.03
  const { o, f } = voice(c, out, t, 0.7, 520, 460, { formant: 1100, q: 3, level: 0.45 })
  o.frequency.setValueAtTime(520, t)
  o.frequency.exponentialRampToValueAtTime(800, t + 0.25)
  o.frequency.exponentialRampToValueAtTime(440, t + 0.7)
  f.frequency.setValueAtTime(900, t)
  f.frequency.exponentialRampToValueAtTime(1900, t + 0.25)
  f.frequency.exponentialRampToValueAtTime(800, t + 0.7)
}

// Sweets landing: bright little plinks, all over.
function plinks(n = 10) {
  const c = ready()
  if (!c) return
  const out = master(c, 0.9)
  const t = c.currentTime + 0.03
  for (let i = 0; i < n; i++) ping(c, out, t + 0.1 + Math.random() * 1.4, 1800 + Math.random() * 1800, 0.08, 0.3)
}

// A horn set down with a thump, the fruit tumbling out.
function thump() {
  const c = ready()
  if (!c) return
  const out = master(c, 1)
  const t = c.currentTime + 0.03
  const o = c.createOscillator()
  o.frequency.setValueAtTime(190, t)
  o.frequency.exponentialRampToValueAtTime(70, t + 0.25)
  const g = c.createGain()
  g.gain.setValueAtTime(0.6, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.32)
  for (let i = 0; i < 8; i++) burst(c, out, t + 0.45 + i * 0.09 + Math.random() * 0.05, { type: 'bandpass', freq: 600 + Math.random() * 500, q: 3, level: 0.25, decay: 0.06 })
}

// A crow's "caw, caw": harsh, falling.
function caw() {
  const c = ready()
  if (!c) return
  const out = master(c, 1.1)
  const t = c.currentTime + 0.03
  for (const at of [0, 0.38]) {
    voice(c, out, t + at, 0.26, 520, 380, { formant: 1300, q: 2, level: 0.5 })
    burst(c, out, t + at, { type: 'bandpass', freq: 1600, q: 1.5, level: 0.12, decay: 0.24 })
  }
}

// Acorns: wooden tocks, bouncing quicker as they settle.
function tocks() {
  const c = ready()
  if (!c) return
  const out = master(c, 1)
  let at = c.currentTime + 0.3
  for (let i = 0; i < 9; i++) {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = 650 + Math.random() * 350
    const g = c.createGain()
    g.gain.setValueAtTime(0.35, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
    o.connect(g).connect(out)
    o.start(at)
    o.stop(at + 0.07)
    at += 0.08 + Math.random() * 0.22
  }
}

// Hooves clip-clopping, and a jingle of harness bells.
function hooves() {
  const c = ready()
  if (!c) return
  const out = master(c, 1)
  const t = c.currentTime + 0.03
  for (let i = 0; i < 8; i++) burst(c, out, t + i * 0.18, { type: 'bandpass', freq: i % 2 ? 900 : 1300, q: 6, level: 0.5, decay: 0.05 })
  for (let i = 0; i < 10; i++) ping(c, out, t + 0.1 + Math.random() * 1.3, 2600 + Math.random() * 900, 0.05, 0.25)
}

// A music box: a little run of bell notes up and back.
function musicBox() {
  const c = ready()
  if (!c) return
  const out = master(c, 0.9)
  const t = c.currentTime + 0.03
  ;[1047, 1319, 1568, 2093, 1568, 1319, 1760, 2093].forEach((f, i) => ping(c, out, t + i * 0.16, f, 0.13, 1.1))
}

// A clock striking: three deep bongs, then a sparkle.
function bongs() {
  const c = ready()
  if (!c) return
  const out = master(c, 1)
  const t = c.currentTime + 0.4
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.55
    for (const [ratio, level, decay] of [[1, 0.35, 1.8], [2.76, 0.12, 1], [5.4, 0.05, 0.6]]) {
      const o = c.createOscillator()
      o.frequency.value = 196 * ratio
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(level, at + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
      o.connect(g).connect(out)
      o.start(at)
      o.stop(at + decay + 0.05)
    }
  }
  for (let i = 0; i < 6; i++) ping(c, out, t + 1.7 + i * 0.07, 2093 + i * 260, 0.07, 0.5)
}

// A cork pops and the bottle fizzes.
function champagnePop() {
  const c = ready()
  if (!c) return
  const out = master(c, 1)
  const t = c.currentTime + 0.6
  burst(c, out, t, { type: 'bandpass', freq: 800, q: 1.2, level: 1, decay: 0.08 })
  const fizz = c.createBufferSource()
  fizz.buffer = whiteOf(c)
  fizz.loop = true
  const hi = c.createBiquadFilter()
  hi.type = 'highpass'
  hi.frequency.value = 5000
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.2)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
  fizz.connect(hi).connect(g).connect(out)
  fizz.start(t + 0.05)
  fizz.stop(t + 1.65)
}

// A fanfare on brass: four notes up, the last held.
function fanfare() {
  const c = ready()
  if (!c) return
  const out = master(c, 0.8)
  const t = c.currentTime + 0.05
  ;[[392, 0, 0.18], [523, 0.2, 0.18], [659, 0.4, 0.18], [784, 0.6, 0.8]].forEach(([f, at, len]) => {
    for (const detune of [-6, 6]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = detune
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(800, t + at)
      lp.frequency.linearRampToValueAtTime(2400, t + at + 0.06)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t + at)
      g.gain.exponentialRampToValueAtTime(0.16, t + at + 0.04)
      g.gain.setValueAtTime(0.16, t + at + len * 0.8)
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len + 0.1)
      o.connect(lp).connect(g).connect(out)
      o.start(t + at)
      o.stop(t + at + len + 0.15)
    }
  })
}

// An eagle's cry: high, gliding up and down, a little ragged.
function screech() {
  const c = ready()
  if (!c) return
  const out = master(c, 0.9)
  const t = c.currentTime + 0.3
  const { o } = voice(c, out, t, 0.9, 2000, 1500, { formant: 2400, q: 2, level: 0.35 })
  o.frequency.setValueAtTime(2000, t)
  o.frequency.exponentialRampToValueAtTime(2700, t + 0.2)
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.9)
  const lfo = c.createOscillator()
  lfo.frequency.value = 22
  const depth = c.createGain()
  depth.gain.value = 60
  lfo.connect(depth).connect(o.frequency)
  lfo.start(t)
  lfo.stop(t + 0.92)
}

// A sparkler: a hiss with crackles through it.
function sparklerHiss() {
  const c = ready()
  if (!c) return
  const out = master(c, 0.9)
  const t = c.currentTime + 0.03
  const hiss = c.createBufferSource()
  hiss.buffer = whiteOf(c)
  hiss.loop = true
  const hi = c.createBiquadFilter()
  hi.type = 'highpass'
  hi.frequency.value = 4000
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.2)
  g.gain.setValueAtTime(0.1, t + 2.2)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  hiss.connect(hi).connect(g).connect(out)
  hiss.start(t)
  hiss.stop(t + 2.65)
  for (let i = 0; i < 22; i++) burst(c, out, t + Math.random() * 2.4, { type: 'highpass', freq: 3000 + Math.random() * 3000, level: 0.1, decay: 0.02 })
}

const MORE_SOUNDS = {
  sleigh: () => sleighBells(),
  reindeer: hooves,
  tree: musicBox,
  witch: cackle,
  cat: meow,
  candy: () => plinks(12),
  harvest: thump,
  scarecrow: caw,
  acorns: tocks,
  midnight: bongs,
  champagne: champagnePop,
  confetti: () => popper(),
  goldworks: () => firework(),
  fireworks: () => {
    firework()
    setTimeout(() => soundOn() && firecrackers(), 1300)
  },
  flag: fanfare,
  eagle: screech,
  sparkler: sparklerHiss,
}

// ---------- seasonal greetings (components/Greetings.jsx) ----------

// One sound to each character, as in Plait. The seasons' own for the ones
// that come from them: Christmas's sleigh bells for the snow, Halloween's
// ghost and thunder, Thanksgiving's gobble and clinking glasses.
export function effectSound(kind) {
  if (!soundOn()) return
  if (MORE_SOUNDS[kind]) return MORE_SOUNDS[kind]()
  if (kind === 'flurry') return sleighBells()
  if (kind === 'ghost') return ghost()
  if (kind === 'pumpkin') return thunder()
  if (kind === 'turkey') return gobble()
  if (kind === 'pie') return clink()
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.03
  const out = master(c, 0.9)
  // One short note: `type` at `f`, from `at`, ringing `len`.
  const note = (f, at, len, level, type = 'sine') => {
    const o = c.createOscillator()
    o.type = type
    o.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(level, at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    o.connect(g).connect(out)
    o.start(at)
    o.stop(at + len + 0.02)
    return o
  }
  if (kind === 'gingerbread') {
    // Little wooden feet running, a quick pitter-patter, and a hop at the end.
    for (let i = 0; i < 8; i++) note(1150 + (i % 2) * 240 + Math.random() * 60, t + i * 0.085, 0.07, 0.22, 'triangle')
    const hop = note(320, t + 0.75, 0.32, 0.3)
    hop.frequency.setValueAtTime(320, t + 0.75)
    hop.frequency.exponentialRampToValueAtTime(980, t + 0.98)
  } else if (kind === 'penguin') {
    // A slide whistle: up as it pushes off, a wobble as it glides, down to a stop.
    const o = c.createOscillator()
    o.type = 'sine'
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.06)
    g.gain.setValueAtTime(0.3, t + 1.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
    o.frequency.setValueAtTime(480, t)
    o.frequency.exponentialRampToValueAtTime(1350, t + 0.45)
    o.frequency.setValueAtTime(1350, t + 0.8)
    o.frequency.exponentialRampToValueAtTime(620, t + 1.35)
    const lfo = c.createOscillator()
    lfo.frequency.value = 6
    const depth = c.createGain()
    depth.gain.value = 22
    lfo.connect(depth).connect(o.frequency)
    o.connect(g).connect(out)
    o.start(t)
    lfo.start(t)
    o.stop(t + 1.45)
    lfo.stop(t + 1.45)
  } else if (kind === 'bats') {
    // Squeaks, high and quick, from all over, as the flock goes past.
    for (let i = 0; i < 9; i++) {
      const at = t + Math.random() * 1.4
      const o = note(3200 + Math.random() * 900, at, 0.07, 0.12)
      o.frequency.exponentialRampToValueAtTime(2100, at + 0.06)
    }
  } else if (kind === 'spider') {
    // Down the thread with a zip, and a springy bounce at the bottom.
    const zip = note(1500, t, 0.5, 0.16)
    zip.frequency.exponentialRampToValueAtTime(260, t + 0.48)
    const boing = note(170, t + 0.52, 0.55, 0.3)
    const wob = c.createOscillator()
    wob.frequency.value = 9
    const wd = c.createGain()
    wd.gain.value = 26
    wob.connect(wd).connect(boing.frequency)
    wob.start(t + 0.52)
    wob.stop(t + 1.1)
  } else if (kind === 'leaves') {
    // A gust: air rising and falling through a sweeping filter, and a rustle.
    const air = c.createBufferSource()
    air.buffer = whiteOf(c)
    air.loop = true
    const sweep = c.createBiquadFilter()
    sweep.type = 'bandpass'
    sweep.Q.value = 0.9
    sweep.frequency.setValueAtTime(380, t)
    sweep.frequency.exponentialRampToValueAtTime(1900, t + 0.7)
    sweep.frequency.exponentialRampToValueAtTime(520, t + 1.6)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7)
    air.connect(sweep).connect(g).connect(out)
    air.start(t)
    air.stop(t + 1.75)
    for (let i = 0; i < 6; i++) burst(c, out, t + 0.3 + Math.random(), { type: 'highpass', freq: 3500, level: 0.12, decay: 0.05 })
  } else if (kind === 'squirrel') {
    // A chitter: two quick bursts of little clicks.
    for (const [start, n] of [[0, 7], [0.55, 5]]) {
      for (let i = 0; i < n; i++) note(2300 + Math.random() * 500, t + start + i * 0.045, 0.03, 0.14, 'triangle')
    }
  } else if (kind === 'snowman') {
    // "Hel-lo there": three warm notes, rising, the last one held.
    for (const [f, at, len] of [[392, 0, 0.3], [523, 0.18, 0.3], [659, 0.36, 0.9]]) {
      note(f, t + at, len, 0.26, 'triangle')
      note(f * 2, t + at, len * 0.6, 0.05)
    }
  } else {
    // The gift: the lid pops, then the stars inside sparkle out.
    burst(c, out, t, { type: 'bandpass', freq: 900, level: 0.5, decay: 0.07 })
    const thump = note(520, t, 0.12, 0.35)
    thump.frequency.exponentialRampToValueAtTime(110, t + 0.1)
    for (let i = 0; i < 7; i++) note(2100 + Math.random() * 1500, t + 0.12 + i * 0.075 + Math.random() * 0.03, 0.35, 0.09)
  }
}

// Christmas's recordings, fetched ahead so the first one plays on time.
export function preloadSeason(season) {
  if (season !== 'christmas') return
  for (const url of Object.values(RECORDINGS)) fetch(url).catch(() => {})
}
