// Backgrounds are plain data so the editor (CSS) and the exporter (canvas)
// can both draw them. A background is a base plus an optional image on top:
//   { type: 'solid', color }  or  { type: 'gradient', id }
//   or { type: 'photo', imageId, blur, dim }: a photo covering the whole strip
//   + motif     repeating image drawn over the base (see MOTIFS)
//   + ink       image colour; left out, it is white on dark bases, black on light
//   + strength  how strongly the image shows (1 = subtle default)
// Gradient angles follow CSS: 90 = left to right.
export const SOLIDS = [
  '#F2F0EB', '#FFFFFF', '#E7DFD3', '#D9C7B0', '#C9D2C4', '#B9C6D3', '#DCE8F0', '#E8B9A2',
  '#D9A441', '#C9A24B', '#C8683F', '#A3202E', '#5A1E2C', '#8A8F7A', '#1F5A40', '#2F4A3A',
  '#14213D', '#3B3F45', '#1B1B1E', '#000000',
]

export const GRADIENTS = [
  { id: 'dawn', name: 'Dawn', angle: 90, stops: ['#F6D5C0', '#F2E6D8', '#C9D6E8'] },
  { id: 'sand', name: 'Sand', angle: 90, stops: ['#EFE6D8', '#D9C2A3'] },
  { id: 'paper', name: 'Paper', angle: 180, stops: ['#F4EFE6', '#E6DDCD'] },
  { id: 'mist', name: 'Mist', angle: 180, stops: ['#E9EDF0', '#B8C4CC'] },
  { id: 'sage', name: 'Sage', angle: 90, stops: ['#DDE5D6', '#A9B8A0'] },
  { id: 'peach', name: 'Peach', angle: 180, stops: ['#FBE3D2', '#F3B99B'] },
  { id: 'rose', name: 'Rose', angle: 90, stops: ['#F4DDE0', '#D9A5B0'] },
  { id: 'lavender', name: 'Lavender', angle: 90, stops: ['#E6E1F2', '#B5ABD6'] },
  { id: 'sky', name: 'Sky', angle: 180, stops: ['#CFE3F2', '#F3EEE6'] },
  // Fall
  { id: 'cider', name: 'Cider', angle: 180, stops: ['#FBEBD3', '#F0C48F'] },
  { id: 'harvest', name: 'Harvest', angle: 135, stops: ['#5A2A12', '#B5562A', '#E3A548'], dark: true },
  { id: 'maple', name: 'Maple', angle: 180, stops: ['#8C2B1C', '#4E130E'], dark: true },
  { id: 'clay', name: 'Clay', angle: 180, stops: ['#C8683F', '#A9502C'], dark: true },
  { id: 'moss', name: 'Moss', angle: 180, stops: ['#5E5A2B', '#33331A'], dark: true },
  // Holiday
  { id: 'frost', name: 'Frost', angle: 180, stops: ['#EAF2F8', '#BCD3E6'] },
  { id: 'evergreen', name: 'Evergreen', angle: 180, stops: ['#1F6B4A', '#0D3325'], dark: true },
  { id: 'cranberry', name: 'Cranberry', angle: 180, stops: ['#A3202E', '#560F1A'], dark: true },
  { id: 'snownight', name: 'Snowy night', angle: 180, stops: ['#243B5A', '#0C1626'], dark: true },
  { id: 'gold', name: 'Gold', angle: 135, stops: ['#8A6A2A', '#D9B866', '#9C7A32'], dark: true },
  // Deep
  { id: 'sunset', name: 'Sunset', angle: 90, stops: ['#3A2244', '#B24C5A', '#F2A65A'], dark: true },
  { id: 'ember', name: 'Ember', angle: 90, stops: ['#2A1A16', '#8C4A2F', '#F0A26B'], dark: true },
  { id: 'dusk', name: 'Dusk', angle: 90, stops: ['#1C1E33', '#5B4B73', '#D99A8B'], dark: true },
  { id: 'wine', name: 'Wine', angle: 180, stops: ['#4A1826', '#220A12'], dark: true },
  { id: 'indigo', name: 'Indigo', angle: 160, stops: ['#1E2A52', '#0F1530'], dark: true },
  { id: 'navy', name: 'Navy', angle: 180, stops: ['#14213D', '#0B1322'], dark: true },
  { id: 'ocean', name: 'Ocean', angle: 180, stops: ['#0F2B3A', '#1F5A6B'], dark: true },
  { id: 'forest', name: 'Forest', angle: 180, stops: ['#16261D', '#35523F'], dark: true },
  { id: 'midnight', name: 'Midnight', angle: 180, stops: ['#131B26', '#0A0E14'], dark: true },
  { id: 'ink', name: 'Ink', angle: 180, stops: ['#2B2D33', '#0E0E10'], dark: true },
]

// Image tiles are 540px squares, so two fit each 1080px frame and the image
// lines up across every seam.
const TILE = 540
const TAU = Math.PI * 2
const CJK = '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", "Noto Sans JP", "Microsoft YaHei", sans-serif'
const KANJI = ['旅', '海', '京', '花', '夢', '山', '道', '空'] // travel, sea, capital, flower, dream, mountain, road, sky
// Where scattered shapes sit in a tile: [x, y, size, rotation], as fractions of the tile.
const SPOTS = [
  [0.06, 0.1, 0.15, -0.35], [0.68, 0.14, 0.13, 0.4], [0.2, 0.36, 0.11, 0.25], [0.55, 0.45, 0.13, -0.2],
  [0.72, 0.6, 0.1, 0.5], [0.03, 0.66, 0.1, -0.5], [0.37, 0.74, 0.12, 0.15], [0.4, 0.96, 0.1, -0.3],
]

// Draw `shape(ctx, i)` at every spot, in a space where the shape spans about
// -0.5..0.5. Wrapped copies let shapes cross a tile edge and continue opposite.
function scatter(ctx, shape, { upright = false } = {}) {
  SPOTS.forEach(([x, y, size, rot], i) => {
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        ctx.save()
        ctx.translate(x * TILE + dx, y * TILE + dy)
        if (!upright) ctx.rotate(rot)
        ctx.scale(size * TILE, size * TILE)
        shape(ctx, i)
        ctx.restore()
      }
    }
  })
}

const poly = (ctx, pts) => {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}
// Cut a line or shape out of what is already drawn.
const carve = (ctx, draw) => {
  ctx.globalCompositeOperation = 'destination-out'
  draw()
  ctx.globalCompositeOperation = 'source-over'
}
const line = (ctx, x0, y0, x1, y1, w) => {
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}
const star = (ctx, points, outer, inner) =>
  poly(ctx, Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer
    const a = (i / (points * 2)) * TAU - Math.PI / 2
    return [r * Math.cos(a), r * Math.sin(a)]
  }))

const MAPLE = [
  [0, -0.5], [0.1, -0.28], [0.24, -0.36], [0.2, -0.14], [0.46, -0.16], [0.34, 0], [0.48, 0.1], [0.22, 0.16],
  [0.26, 0.3], [0.04, 0.22], [0.04, 0.5], [-0.04, 0.5], [-0.04, 0.22], [-0.26, 0.3], [-0.22, 0.16], [-0.48, 0.1],
  [-0.34, 0], [-0.46, -0.16], [-0.2, -0.14], [-0.24, -0.36], [-0.1, -0.28],
]

export const SHAPES = {
  leaf(ctx, i) {
    if (i % 2) {
      poly(ctx, MAPLE)
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(0, -0.5)
    ctx.quadraticCurveTo(0.44, -0.1, 0, 0.36)
    ctx.quadraticCurveTo(-0.44, -0.1, 0, -0.5)
    ctx.fill()
    line(ctx, 0, 0.34, 0, 0.5, 0.05)
    carve(ctx, () => line(ctx, 0, -0.34, 0, 0.3, 0.035))
  },
  pumpkin(ctx) {
    ctx.beginPath()
    ctx.ellipse(-0.2, 0.08, 0.27, 0.34, 0, 0, TAU)
    ctx.ellipse(0.2, 0.08, 0.27, 0.34, 0, 0, TAU)
    ctx.ellipse(0, 0.08, 0.2, 0.37, 0, 0, TAU)
    ctx.fill()
    ctx.fillRect(-0.05, -0.44, 0.1, 0.18)
    carve(ctx, () => {
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.ellipse(0, 0.08, 0.2, 0.37, 0, 0, TAU)
      ctx.stroke()
    })
  },
  acorn(ctx) {
    ctx.beginPath()
    ctx.ellipse(0, 0.08, 0.25, 0.36, 0, 0, TAU)
    ctx.fill()
    carve(ctx, () => ctx.fillRect(-0.5, -0.5, 1, 0.4))
    ctx.beginPath()
    ctx.ellipse(0, -0.14, 0.32, 0.2, 0, Math.PI, 0)
    ctx.fill()
    line(ctx, 0, -0.34, 0.05, -0.48, 0.05)
  },
  ghost(ctx) {
    ctx.beginPath()
    ctx.moveTo(-0.32, 0.45)
    ctx.lineTo(-0.32, -0.12)
    ctx.arc(0, -0.12, 0.32, Math.PI, 0)
    ctx.lineTo(0.32, 0.45)
    ctx.quadraticCurveTo(0.21, 0.28, 0.107, 0.45)
    ctx.quadraticCurveTo(0, 0.28, -0.107, 0.45)
    ctx.quadraticCurveTo(-0.21, 0.28, -0.32, 0.45)
    ctx.fill()
    carve(ctx, () => {
      ctx.beginPath()
      ctx.ellipse(-0.12, -0.12, 0.05, 0.07, 0, 0, TAU)
      ctx.ellipse(0.12, -0.12, 0.05, 0.07, 0, 0, TAU)
      ctx.fill()
    })
  },
  snowflake(ctx) {
    for (let a = 0; a < 6; a++) {
      ctx.save()
      ctx.rotate((a / 6) * TAU)
      line(ctx, 0, 0, 0, -0.48, 0.05)
      line(ctx, 0, -0.3, 0.13, -0.42, 0.04)
      line(ctx, 0, -0.3, -0.13, -0.42, 0.04)
      ctx.restore()
    }
  },
  tree(ctx) {
    poly(ctx, [[0, -0.5], [-0.22, -0.18], [0.22, -0.18]])
    ctx.fill()
    poly(ctx, [[0, -0.32], [-0.3, 0.08], [0.3, 0.08]])
    ctx.fill()
    poly(ctx, [[0, -0.1], [-0.38, 0.34], [0.38, 0.34]])
    ctx.fill()
    ctx.fillRect(-0.06, 0.34, 0.12, 0.14)
  },
  star(ctx) {
    star(ctx, 5, 0.5, 0.2)
    ctx.fill()
  },
  sparkle(ctx) {
    ctx.beginPath()
    ctx.moveTo(0, -0.5)
    ctx.quadraticCurveTo(0.06, -0.06, 0.5, 0)
    ctx.quadraticCurveTo(0.06, 0.06, 0, 0.5)
    ctx.quadraticCurveTo(-0.06, 0.06, -0.5, 0)
    ctx.quadraticCurveTo(-0.06, -0.06, 0, -0.5)
    ctx.fill()
  },
  star6(ctx) {
    ctx.lineWidth = 0.05
    for (const flip of [0, Math.PI]) {
      ctx.save()
      ctx.rotate(flip)
      poly(ctx, [0, 1, 2].map((k) => [0.48 * Math.sin((k / 3) * TAU), -0.48 * Math.cos((k / 3) * TAU)]))
      ctx.stroke()
      ctx.restore()
    }
  },
  burst(ctx) {
    for (let a = 0; a < 12; a++) {
      ctx.save()
      ctx.rotate((a / 12) * TAU)
      line(ctx, 0, -0.16, 0, a % 2 ? -0.36 : -0.48, 0.04)
      ctx.restore()
    }
  },
  heart(ctx) {
    ctx.beginPath()
    ctx.moveTo(0, 0.42)
    ctx.bezierCurveTo(-0.62, 0, -0.3, -0.52, 0, -0.2)
    ctx.bezierCurveTo(0.3, -0.52, 0.62, 0, 0, 0.42)
    ctx.fill()
  },
}

const scattered = (shape, opts) => (ctx) => scatter(ctx, SHAPES[shape], opts)

// Each painter draws one 540px tile in a single solid colour.
const PAINT = {
  kanji(ctx) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    SPOTS.forEach(([x, y, size], i) => {
      ctx.font = `500 ${size * TILE}px ${CJK}`
      for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) ctx.fillText(KANJI[i], x * TILE + dx, y * TILE + dy)
    })
  },
  waves(ctx) {
    ctx.lineWidth = 3
    for (let y = 30; y < TILE; y += 60) {
      ctx.beginPath()
      for (let x = 0; x <= TILE; x += 6) ctx.lineTo(x, y + 12 * Math.sin((x / 270) * TAU))
      ctx.stroke()
    }
  },
  dots(ctx) {
    ctx.beginPath()
    for (let x = 27; x < TILE; x += 54) for (let y = 27; y < TILE; y += 54) {
      ctx.moveTo(x + 5, y)
      ctx.arc(x, y, 5, 0, TAU)
    }
    ctx.fill()
  },
  grid(ctx) {
    for (let v = 45; v < TILE; v += 90) {
      ctx.fillRect(v - 1, 0, 2, TILE)
      ctx.fillRect(0, v - 1, TILE, 2)
    }
  },
  lines(ctx) {
    for (let x = -TILE; x < TILE; x += 60) line(ctx, x, 0, x + TILE, TILE, 3)
  },
  crosses(ctx) {
    for (let x = 54; x < TILE; x += 108) for (let y = 54; y < TILE; y += 108) {
      line(ctx, x - 12, y, x + 12, y, 3)
      line(ctx, x, y - 12, x, y + 12, 3)
    }
  },
  plaid(ctx) {
    for (let v = 0; v < TILE; v += 180) {
      ctx.fillRect(v + 20, 0, 56, TILE)
      ctx.fillRect(0, v + 20, TILE, 56)
      ctx.fillRect(v + 126, 0, 5, TILE)
      ctx.fillRect(0, v + 126, TILE, 5)
    }
  },
  stripes(ctx) {
    ctx.lineCap = 'butt'
    for (let x = -TILE - 90; x < TILE + 90; x += 90) line(ctx, x, -40, x + TILE + 80, TILE + 40, 30)
  },
  leaves: scattered('leaf'),
  pumpkins: scattered('pumpkin', { upright: true }),
  acorns: scattered('acorn'),
  ghosts: scattered('ghost', { upright: true }),
  snow: scattered('snowflake'),
  trees: scattered('tree', { upright: true }),
  stars: scattered('star'),
  sparkles: scattered('sparkle', { upright: true }),
  star6: scattered('star6', { upright: true }),
  bursts: scattered('burst'),
  hearts: scattered('heart'),
}

// The images offered in the editor, in display order.
export const MOTIFS = [
  { id: 'kanji', name: 'Kanji' },
  { id: 'leaves', name: 'Leaves' },
  { id: 'pumpkins', name: 'Pumpkins' },
  { id: 'acorns', name: 'Acorns' },
  { id: 'plaid', name: 'Plaid' },
  { id: 'ghosts', name: 'Ghosts' },
  { id: 'snow', name: 'Snowflakes' },
  { id: 'trees', name: 'Trees' },
  { id: 'stars', name: 'Stars' },
  { id: 'sparkles', name: 'Sparkles' },
  { id: 'stripes', name: 'Candy stripes' },
  { id: 'star6', name: 'Star of David' },
  { id: 'bursts', name: 'Fireworks' },
  { id: 'hearts', name: 'Hearts' },
  { id: 'waves', name: 'Waves' },
  { id: 'dots', name: 'Dots' },
  { id: 'grid', name: 'Grid' },
  { id: 'lines', name: 'Lines' },
  { id: 'crosses', name: 'Crosses' },
]

const g = (id, motif, ink, strength = 1) => ({ type: 'gradient', id, motif, ink, strength })

// Ready-made seasonal combinations of a base and an image.
export const THEMES = [
  { name: 'Maple', bg: g('harvest', 'leaves', '#FFD08A', 1.2) },
  { name: 'Pumpkin patch', bg: g('cider', 'pumpkins', '#C8683F', 1.6) },
  { name: 'Acorns', bg: g('paper', 'acorns', '#7A4E2D', 1.2) },
  { name: 'Flannel', bg: g('maple', 'plaid', '#000000', 1.4) },
  { name: 'Halloween', bg: g('ink', 'ghosts', undefined, 1.4) },
  { name: 'Jack-o-lantern', bg: g('ink', 'pumpkins', '#FF8A4C', 1.6) },
  { name: 'Snowfall', bg: g('snownight', 'snow', undefined, 1.6) },
  { name: 'Evergreen', bg: g('evergreen', 'trees', undefined, 1.3) },
  { name: 'Cranberry', bg: g('cranberry', 'sparkles', '#F3D9A0', 1.5) },
  { name: 'Candy cane', bg: { type: 'solid', color: '#FFFFFF', motif: 'stripes', ink: '#C8202E', strength: 4 } },
  { name: 'Frost', bg: g('frost', 'snow', '#FFFFFF', 4) },
  { name: 'Hanukkah', bg: g('indigo', 'star6', '#DCE6FF', 1.3) },
  { name: 'New Year', bg: g('ink', 'bursts', '#E8C36A', 1.5) },
]

export const DEFAULT_BACKGROUND = { type: 'solid', color: '#F2F0EB' }

// Projects saved before images were separate stored { type: 'pattern', id }.
const LEGACY = {
  'kanji-night': ['midnight', 'kanji'], 'kanji-ink': ['ink', 'kanji'], 'kanji-indigo': ['indigo', 'kanji'],
  'kanji-wine': ['wine', 'kanji'], 'kanji-paper': ['paper', 'kanji'], 'kanji-blush': ['rose', 'kanji'],
  'waves-ocean': ['ocean', 'waves'], 'waves-mist': ['mist', 'waves'], 'dots-night': ['ink', 'dots'],
  'dots-paper': ['paper', 'dots'], 'grid-night': ['navy', 'grid'], 'grid-paper': ['paper', 'grid'],
  'lines-sand': ['sand', 'lines'], 'crosses-clay': ['clay', 'crosses'],
}

export function normalizeBackground(bg) {
  if (!bg) return DEFAULT_BACKGROUND
  if (bg.type !== 'pattern') return bg
  const [id, motif] = LEGACY[bg.id] ?? ['midnight', 'kanji']
  return { type: 'gradient', id, motif }
}

const gradientOf = (bg) => GRADIENTS.find((x) => x.id === bg.id) ?? GRADIENTS[0]

// Whether light text and light images read better on this background.
export function isDarkBackground(input) {
  const bg = normalizeBackground(input)
  if (bg.type === 'photo') return true
  if (bg.type !== 'solid') return !!gradientOf(bg).dark
  const n = parseInt(bg.color.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128
}

const tiles = new Map()

// The tile for a background's image, tinted and faded, or null if it has none.
function motifTile(bg) {
  if (bg.type === 'photo' || !bg.motif || !PAINT[bg.motif]) return null
  const dark = isDarkBackground(bg)
  const color = bg.ink ?? (dark ? '#FFFFFF' : '#000000')
  const alpha = Math.min(1, (bg.ink ? 0.2 : dark ? 0.08 : 0.07) * (bg.strength ?? 1))
  const key = `${bg.motif}|${color}|${alpha.toFixed(3)}`
  let tile = tiles.get(key)
  if (!tile) {
    // Paint solid first, then fade the whole tile, so overlapping strokes
    // within a shape do not show through each other.
    const solid = document.createElement('canvas')
    solid.width = solid.height = TILE
    const sctx = solid.getContext('2d')
    sctx.fillStyle = sctx.strokeStyle = color
    sctx.lineCap = sctx.lineJoin = 'round'
    PAINT[bg.motif](sctx)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE
    const ctx = canvas.getContext('2d')
    ctx.globalAlpha = alpha
    ctx.drawImage(solid, 0, 0)
    tile = { canvas, url: canvas.toDataURL('image/png') }
    tiles.set(key, tile)
  }
  return tile
}

// CSS for a background. `scale` is screen pixels per scene pixel, which sets
// how large the image tile is drawn.
// Where a background photo is drawn so it covers W x H. Blurring fades the
// edges, so the photo is laid a little past them on every side.
export function photoCover(bg, image, W, H) {
  const pad = (bg.blur ?? 0) * 3
  const k = Math.max((W + pad * 2) / image.width, (H + pad * 2) / image.height)
  const w = image.width * k
  const h = image.height * k
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

export function backgroundStyle(input, scale = 1) {
  const bg = normalizeBackground(input)
  // The photo itself is an element in the strip; this is what shows behind it.
  if (bg.type === 'photo') return { backgroundImage: 'linear-gradient(#111, #111)' }
  const base =
    bg.type === 'solid'
      ? `linear-gradient(${bg.color}, ${bg.color})`
      : `linear-gradient(${gradientOf(bg).angle}deg, ${gradientOf(bg).stops.join(', ')})`
  const tile = motifTile(bg)
  if (!tile) return { backgroundImage: base }
  return {
    backgroundImage: `url(${tile.url}), ${base}`,
    backgroundSize: `${TILE * scale}px ${TILE * scale}px, 100% 100%`,
    backgroundRepeat: 'repeat, no-repeat',
  }
}

// Paint a background onto a canvas context covering W x H scene pixels.
// `photo` is { img, width, height } for a photo background, already decoded.
export function paintBackground(ctx, input, W, H, photo) {
  const bg = normalizeBackground(input)
  if (bg.type === 'photo') {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, W, H)
    if (photo) {
      const r = photoCover(bg, photo, W, H)
      ctx.save()
      if (bg.blur && 'filter' in ctx) ctx.filter = `blur(${bg.blur}px)`
      ctx.drawImage(photo.img, r.x, r.y, r.w, r.h)
      ctx.restore()
    }
    if (bg.dim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${bg.dim})`
      ctx.fillRect(0, 0, W, H)
    }
    return
  }
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.color
  } else {
    const grad = gradientOf(bg)
    // Same geometry as a CSS linear-gradient over the whole strip.
    const a = (grad.angle * Math.PI) / 180
    const dx = Math.sin(a)
    const dy = -Math.cos(a)
    const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2
    const fill = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half)
    grad.stops.forEach((c, i) => fill.addColorStop(i / (grad.stops.length - 1), c))
    ctx.fillStyle = fill
  }
  ctx.fillRect(0, 0, W, H)
  const tile = motifTile(bg)
  if (tile) {
    ctx.fillStyle = ctx.createPattern(tile.canvas, 'repeat')
    ctx.fillRect(0, 0, W, H)
  }
}
