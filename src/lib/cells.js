import { clamp, frameH, FRAME_W, sceneWidth } from './scene'

// A collage layout is a set of cells that tile the strip. Each cell stores its
// tile bounds (x0, y0, x1, y1 in scene pixels, neighbours share exact edges);
// the visible rectangle is that tile inset by the layout's gap and margin.
// A cell holds at most one photo, cropped to fill, with a pan (ox, oy in
// -1..1 of the available slack) and a zoom (1 = just covers the cell).

export const DEFAULT_LAYOUT = { gap: 24, margin: 24, radius: 0 }
export const MIN_TILE = 160
export const MAX_ZOOM = 6
const EPS = 1

const range = (n) => Array.from({ length: n }, (_, i) => i)

// Repeat a two-frame pattern along the strip; an odd last frame gets one full
// cell. A single frame gets the whole pattern squeezed into it.
const pairs = (n, pattern) => {
  if (n === 1) return pattern(0).map(([x0, y0, x1, y1]) => [x0 / 2, y0, x1 / 2, y1])
  const out = []
  let x = 0
  for (; n - x >= 2; x += 2) out.push(...pattern(x))
  if (n - x === 1) out.push([x, 0, x + 1, 1])
  return out
}

// `count` cells side by side between x0 and x1.
const row = (count, y0, y1, x0, x1) =>
  range(count).map((i) => [x0 + ((x1 - x0) * i) / count, y0, x0 + ((x1 - x0) * (i + 1)) / count, y1])

// Stacked rows across the whole strip, e.g. rows(n, [3, 2], [0.5, 0.5]).
const rows = (n, counts, heights) => {
  let y = 0
  return counts.flatMap((c, i) => row(c, y, (y += heights[i]), 0, n))
}

// Fill the region x0..x1 with `count` cells: one, a stack of two, or two rows.
const block = (count, x0, x1) =>
  count === 1
    ? [[x0, 0, x1, 1]]
    : count === 2
      ? [[x0, 0, x1, 0.5], [x0, 0.5, x1, 1]]
      : [...row(Math.ceil(count / 2), 0, 0.5, x0, x1), ...row(Math.floor(count / 2), 0.5, 1, x0, x1)]

const mirror = (n, tiles) => tiles.map(([x0, y0, x1, y1]) => [n - x1, y0, n - x0, y1])
const hero = (n, k) => [[0, 0, n * 0.5, 1], ...block(k - 1, n * 0.5, n)]

export const MAX_SPOTS = 12

// Layouts built for an exact number of photos (k) on any number of frames (n).
// A maker returns nothing when it has no sensible arrangement for that k.
const BY_COUNT = [
  { id: 'columns', name: 'Columns', make: (n, k) => row(k, 0, 1, 0, n) },
  { id: 'stack', name: 'Two rows', make: (n, k) => k >= 2 && rows(n, [Math.ceil(k / 2), Math.floor(k / 2)], [0.5, 0.5]) },
  { id: 'stack-b', name: 'Two rows', make: (n, k) => k >= 3 && rows(n, [Math.floor(k / 2), Math.ceil(k / 2)], [0.5, 0.5]) },
  { id: 'stagger', name: 'Stagger', make: (n, k) => k >= 4 && k % 2 === 0 && rows(n, [k / 2 + 1, k / 2 - 1], [0.5, 0.5]) },
  { id: 'stagger-b', name: 'Stagger', make: (n, k) => k >= 4 && k % 2 === 0 && rows(n, [k / 2 - 1, k / 2 + 1], [0.5, 0.5]) },
  { id: 'header', name: 'Header', make: (n, k) => k >= 3 && rows(n, [1, k - 1], [0.6, 0.4]) },
  { id: 'footer', name: 'Footer', make: (n, k) => k >= 3 && rows(n, [k - 1, 1], [0.4, 0.6]) },
  { id: 'hero-left', name: 'Hero left', make: (n, k) => k >= 3 && hero(n, k) },
  { id: 'hero-right', name: 'Hero right', make: (n, k) => k >= 3 && mirror(n, hero(n, k)) },
  {
    id: 'thirds',
    name: 'Three rows',
    make: (n, k) => {
      const base = Math.floor(k / 3)
      const extra = k % 3
      return k >= 5 && rows(n, [base + (extra > 0), base + (extra > 1), base], [1 / 3, 1 / 3, 1 / 3])
    },
  },
  { id: 'bands', name: 'Bands', make: (n, k) => k >= 2 && k <= 4 && rows(n, Array(k).fill(1), Array(k).fill(1 / k)) },
]

// Fixed patterns whose number of cells follows from the number of frames.
// Tiles are in frame units: x runs 0..frames, y runs 0..1.
export const TEMPLATES = [
  { id: 'frames', name: 'Frames', make: (n) => range(n).map((i) => [i, 0, i + 1, 1]) },
  { id: 'pano', name: 'Panorama', make: (n) => [[0, 0, n, 1]] },
  {
    id: 'bridge',
    name: 'Bridge',
    make: (n) => [[0, 0, 0.5, 1], ...range(n - 1).map((i) => [i + 0.5, 0, i + 1.5, 1]), [n - 0.5, 0, n, 1]],
  },
  { id: 'split', name: 'Split', make: (n) => range(n).flatMap((i) => [[i, 0, i + 1, 0.5], [i, 0.5, i + 1, 1]]) },
  {
    id: 'brick',
    name: 'Brick',
    make: (n) => [
      ...range(n).map((i) => [i, 0, i + 1, 0.5]),
      [0, 0.5, 0.5, 1],
      ...range(n - 1).map((i) => [i + 0.5, 0.5, i + 1.5, 1]),
      [n - 0.5, 0.5, n, 1],
    ],
  },
  { id: 'banner', name: 'Banner', make: (n) => [[0, 0, n, 0.6], ...range(n).map((i) => [i, 0.6, i + 1, 1])] },
  {
    id: 'hero',
    name: 'Hero',
    make: (n) => pairs(n, (x) => [[x, 0, x + 1.5, 1], [x + 1.5, 0, x + 2, 0.5], [x + 1.5, 0.5, x + 2, 1]]),
  },
  {
    id: 'mosaic',
    name: 'Mosaic',
    make: (n) =>
      pairs(n, (x) => [
        [x, 0, x + 0.7, 1],
        [x + 0.7, 0, x + 2, 0.58],
        [x + 0.7, 0.58, x + 1.4, 1],
        [x + 1.4, 0.58, x + 2, 1],
      ]),
  },
  {
    id: 'steps',
    name: 'Steps',
    make: (n) =>
      pairs(n, (x) => [
        [x, 0, x + 1.3, 0.62],
        [x + 1.3, 0, x + 2, 0.38],
        [x, 0.62, x + 0.7, 1],
        [x + 0.7, 0.62, x + 1.3, 1],
        [x + 1.3, 0.38, x + 2, 1],
      ]),
  },
  { id: 'ribbons', name: 'Ribbons', make: (n) => [[0, 0, n, 0.5], [0, 0.5, n, 1]] },
  {
    id: 'grid',
    name: 'Grid',
    make: (n) =>
      range(n).flatMap((i) => [
        [i, 0, i + 0.5, 0.5], [i + 0.5, 0, i + 1, 0.5], [i, 0.5, i + 0.5, 1], [i + 0.5, 0.5, i + 1, 1],
      ]),
  },
  {
    id: 'rows',
    name: 'Rows',
    make: (n) => range(n).flatMap((i) => [[i, 0, i + 1, 1 / 3], [i, 1 / 3, i + 1, 2 / 3], [i, 2 / 3, i + 1, 1]]),
  },
  {
    id: 'focus',
    name: 'Focus',
    make: (n) =>
      range(n).flatMap((i) => [
        [i, 0, i + 1, 0.64], [i, 0.64, i + 1 / 3, 1], [i + 1 / 3, 0.64, i + 2 / 3, 1], [i + 2 / 3, 0.64, i + 1, 1],
      ]),
  },
]

const ALL = [...BY_COUNT, ...TEMPLATES]

// A template's tiles in frame units, or null if it cannot make that many spots.
export const tilesOf = (template, frames, count) => template.make(frames, count) || null

// Every layout with exactly `count` spots for this many frames. Different
// templates can produce the same arrangement, so only the first of each is kept.
export function templatesFor(frames, count) {
  const seen = new Set()
  return ALL.filter((t) => {
    const tiles = tilesOf(t, frames, count)
    if (!tiles || tiles.length !== count) return false
    const key = JSON.stringify(tiles.map((c) => c.map((v) => Math.round(v * 1000))).sort())
    return !seen.has(key) && seen.add(key)
  })
}

// Tiles of a template in scene pixels, ordered left to right, top to bottom.
export function makeTiles(templateId, frames, height, count = frames) {
  const t = ALL.find((x) => x.id === templateId) ?? ALL[0]
  return (tilesOf(t, frames, count) ?? tilesOf(ALL[0], frames, count))
    .map(([x0, y0, x1, y1]) => ({ x0: x0 * FRAME_W, y0: y0 * height, x1: x1 * FRAME_W, y1: y1 * height }))
    .sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0)
}

// The visible rectangle of a cell: margin on the strip's outer edges, half a
// gap on every inner edge.
export function cellRect(cell, project) {
  const { gap, margin } = project.layout ?? DEFAULT_LAYOUT
  const W = sceneWidth(project.frames)
  const l = cell.x0 + (cell.x0 < EPS ? margin : gap / 2)
  const r = cell.x1 - (cell.x1 > W - EPS ? margin : gap / 2)
  const t = cell.y0 + (cell.y0 < EPS ? margin : gap / 2)
  const b = cell.y1 - (cell.y1 > frameH(project) - EPS ? margin : gap / 2)
  return { x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) }
}

// Where the photo sits inside its cell: size, top-left offset and pan slack.
export function cellImageBox(cell, rect, image) {
  const s = Math.max(rect.w / image.width, rect.h / image.height) * (cell.zoom ?? 1)
  const w = image.width * s
  const h = image.height * s
  const slackX = w - rect.w
  const slackY = h - rect.h
  return {
    w,
    h,
    slackX,
    slackY,
    left: -slackX / 2 + ((cell.ox ?? 0) * slackX) / 2,
    top: -slackY / 2 + ((cell.oy ?? 0) * slackY) / 2,
  }
}

const SIDE_KEY = { e: 'x1', w: 'x0', s: 'y1', n: 'y0' }
const OTHER = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' }

// Dragging one edge of a cell moves the whole divider it belongs to: every
// cell edge lying on the same line and connected through touching neighbours.
// Returns the members to move and the range the divider may travel.
export function linkedEdge(cells, cell, side, frames, height) {
  const key = SIDE_KEY[side]
  const axis = key[0]
  const pos = cell[key]
  const [p0, p1] = axis === 'x' ? ['y0', 'y1'] : ['x0', 'x1']
  const overlap = (a, b) => Math.min(a[p1], b[p1]) - Math.max(a[p0], b[p0]) > EPS

  const members = [{ cell, key }]
  for (let grew = true; grew; ) {
    grew = false
    for (const c of cells) {
      if (members.some((m) => m.cell === c)) continue
      const k = [key, OTHER[key]].find(
        (k) => Math.abs(c[k] - pos) <= EPS && members.some((m) => m.key !== k && overlap(m.cell, c)),
      )
      if (k) {
        members.push({ cell: c, key: k })
        grew = true
      }
    }
  }

  let lo = 0
  let hi = axis === 'x' ? sceneWidth(frames) : height
  for (const { cell: c, key: k } of members) {
    if (k.endsWith('1')) lo = Math.max(lo, c[OTHER[k]] + MIN_TILE)
    else hi = Math.min(hi, c[OTHER[k]] - MIN_TILE)
  }
  return { axis, pos, lo, hi, members: members.map((m) => ({ id: m.cell.id, key: m.key })) }
}

// Lines a divider can snap to: seams, frame centres, the middle of the strip
// and the edges of cells that are not part of the divider.
export function edgeTargets(cells, group, frames, height) {
  const moving = new Set(group.members.map((m) => m.id))
  const others = cells.filter((c) => !moving.has(c.id))
  if (group.axis === 'y') return [0, height / 2, height, ...others.flatMap((c) => [c.y0, c.y1])]
  return [
    ...range(frames * 2 + 1).map((i) => (i * FRAME_W) / 2),
    ...others.flatMap((c) => [c.x0, c.x1]),
  ]
}

export function snapTo(value, targets, threshold) {
  let best = null
  for (const t of targets) {
    const d = Math.abs(t - value)
    if (d <= threshold && (best === null || d < Math.abs(best - value))) best = t
  }
  return best
}

export const clampPan = (v) => clamp(v, -1, 1)

// A free photo layer covering the same area a cell's photo did.
export function cellToLayer(cell, rect, image, id) {
  const k = Math.min(rect.w / image.width, rect.h / image.height)
  return {
    id,
    type: 'photo',
    imageId: cell.imageId,
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    w: image.width * k,
    h: image.height * k,
    rotation: 0,
  }
}
