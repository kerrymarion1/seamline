export const FONTS = [
  { id: 'sans', name: 'Instrument', family: '"Instrument Sans Variable"', weight: 600 },
  { id: 'serif', name: 'Serif', family: '"Instrument Serif"', weight: 400 },
  { id: 'fraunces', name: 'Fraunces', family: '"Fraunces Variable"', weight: 500 },
  { id: 'grotesk', name: 'Grotesk', family: '"Space Grotesk Variable"', weight: 500 },
  { id: 'bebas', name: 'Bebas', family: '"Bebas Neue"', weight: 400 },
  { id: 'caveat', name: 'Caveat', family: '"Caveat Variable"', weight: 600 },
  { id: 'mono', name: 'Mono', family: '"DM Mono"', weight: 400 },
]

export const TEXT_COLORS = [
  '#FFFFFF', '#F2F0EB', '#0E0E10', '#3B3F45', '#FF8A4C', '#E8B9A2',
  '#D9C7B0', '#8A8F7A', '#B9C6D3', '#C2463A',
]

export const LINE_HEIGHT = 1.15

export const fontOf = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0]

export const fontString = (layer, size = layer.size) => {
  const f = fontOf(layer.font)
  return `${f.weight} ${size}px ${f.family}`
}

let ctx
const cache = new Map()

// Measured text sizes go stale when a webfont finishes loading.
export function clearTextCache() {
  cache.clear()
}

// Size of a text layer's box in scene pixels. The editor and the exporter both
// lay text out from this, so they agree on where every line sits.
export function measureText(layer) {
  const key = `${layer.font}|${layer.size}|${layer.spacing ?? 0}|${layer.text}`
  const hit = cache.get(key)
  if (hit) return hit
  ctx ??= document.createElement('canvas').getContext('2d')
  // Measure at a fixed size and scale up: keeps results stable for huge text.
  const base = 100
  ctx.font = fontString(layer, base)
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(layer.spacing ?? 0) * base}px`
  const lines = (layer.text || ' ').split('\n')
  const widest = Math.max(...lines.map((l) => ctx.measureText(l || ' ').width))
  const k = layer.size / base
  const out = {
    w: Math.max(widest * k, layer.size * 0.4),
    h: lines.length * layer.size * LINE_HEIGHT,
    lines,
  }
  cache.set(key, out)
  return out
}

// Width and height of any layer in scene pixels.
export function layerSize(layer) {
  if (layer.type === 'text') {
    const { w, h } = measureText(layer)
    return { w, h }
  }
  return { w: layer.w, h: layer.h }
}

// Black or white, whichever stands out against a colour.
export function contrastOf(hex) {
  const n = parseInt(hex.slice(1), 16)
  const light = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return light < 140 ? '#FFFFFF' : '#0E0E10'
}

// Optional text effects, in scene pixels. Outline and pill take the colour
// that contrasts with the text so they always show.
export function textDecor(layer) {
  const against = contrastOf(layer.color)
  return {
    outline: layer.outline ? { width: layer.size * 0.12, color: against } : null,
    shadow: layer.shadow ? { y: layer.size * 0.04, blur: layer.size * 0.14, color: 'rgba(0, 0, 0, 0.55)' } : null,
    pill: layer.pill ? { pad: layer.size * 0.28, radius: layer.size * 0.3, color: against } : null,
  }
}

// Optional white border and drop shadow on a free photo, in scene pixels.
export function photoDecor(layer) {
  return {
    border: layer.border ?? 0,
    shadow: layer.shadow ? { y: 18, blur: 48, color: 'rgba(0, 0, 0, 0.4)' } : null,
  }
}
