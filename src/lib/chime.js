// A short two-note chime for a new message, made on the spot with Web Audio,
// so there is no sound file to fetch. Browsers only let a page make sound
// after it has been touched, so the first tap anywhere unlocks it (see
// main.jsx); until then the chime is silently skipped.

let ctx = null

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  } catch {
    // No Web Audio here: messages just arrive quietly.
  }
}

export function chime() {
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  for (const [freq, at] of [[880, 0], [1318.5, 0.13]]) {
    const tone = ctx.createOscillator()
    const level = ctx.createGain()
    tone.type = 'sine'
    tone.frequency.value = freq
    level.gain.setValueAtTime(0.0001, now + at)
    level.gain.exponentialRampToValueAtTime(0.22, now + at + 0.02)
    level.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.4)
    tone.connect(level).connect(ctx.destination)
    tone.start(now + at)
    tone.stop(now + at + 0.45)
  }
  // A buzz too, where the phone can (Android).
  navigator.vibrate?.([120, 60, 120])
}
