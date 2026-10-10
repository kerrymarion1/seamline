// The scene is measured in export pixels: N frames side by side, each 1080 wide.
// One frame makes a single collage image; two or more make a carousel.
export const FRAME_W = 1080
export const FORMATS = [
  { id: 'portrait', name: '4:5', h: 1350 },
  { id: 'square', name: '1:1', h: 1080 },
  { id: 'story', name: '9:16', h: 1920 },
]
export const MIN_FRAMES = 1

// Height of a project's frames in pixels.
export const frameH = (project) => project.frameH ?? FORMATS[0].h
export const MAX_FRAMES = 10

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export const sceneWidth = (frames) => frames * FRAME_W

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const rad = (deg) => (deg * Math.PI) / 180

// Half extents of the axis-aligned box around a rotated w x h rectangle.
export function halfExtents(w, h, rotation) {
  const c = Math.abs(Math.cos(rad(rotation)))
  const s = Math.abs(Math.sin(rad(rotation)))
  return { hw: (w * c + h * s) / 2, hh: (w * s + h * c) / 2 }
}

function nearest(offsets, targets, base, threshold) {
  let best = null
  for (const o of offsets) {
    for (const t of targets[o.kind]) {
      const d = t - (base + o.value)
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) {
        best = { d, pos: t }
      }
    }
  }
  return best
}

// Snap a moving layer to frame seams, frame centres, canvas centre and edges.
// Returns the adjusted centre plus the guide lines to draw.
export function snapMove({ x, y, w, h, rotation, frames, height, threshold }) {
  const { hw, hh } = halfExtents(w, h, rotation)
  const seams = Array.from({ length: frames + 1 }, (_, i) => i * FRAME_W)
  const centres = Array.from({ length: frames }, (_, i) => (i + 0.5) * FRAME_W)
  const guides = []

  const sx = nearest(
    [{ kind: 'edge', value: -hw }, { kind: 'centre', value: 0 }, { kind: 'edge', value: hw }],
    { edge: seams, centre: [...seams, ...centres, sceneWidth(frames) / 2] },
    x,
    threshold,
  )
  if (sx) {
    x += sx.d
    guides.push({ axis: 'x', pos: sx.pos })
  }

  const sy = nearest(
    [{ kind: 'edge', value: -hh }, { kind: 'centre', value: 0 }, { kind: 'edge', value: hh }],
    { edge: [0, height], centre: [height / 2] },
    y,
    threshold,
  )
  if (sy) {
    y += sy.d
    guides.push({ axis: 'y', pos: sy.pos })
  }

  return { x, y, guides }
}

// Snap rotation to right angles when within a few degrees.
export function snapRotation(deg) {
  const norm = ((deg % 360) + 360) % 360
  const q = Math.round(norm / 90) * 90
  return Math.abs(norm - q) < 3 ? { rotation: q % 360, snapped: true } : { rotation: norm, snapped: false }
}
