import { SHAPES as DRAWN } from './backgrounds'

// Shapes and stickers that can be placed on the canvas as layers.
// `ratio` is width / height of the box a new one starts with.
export const STICKERS = [
  { id: 'square', name: 'Block', ratio: 1 },
  { id: 'circle', name: 'Circle', ratio: 1 },
  { id: 'ring', name: 'Ring', ratio: 1 },
  { id: 'line', name: 'Line', ratio: 30 },
  { id: 'arrow', name: 'Arrow', ratio: 4 },
  { id: 'star', name: 'Star', ratio: 1 },
  { id: 'sparkle', name: 'Sparkle', ratio: 1 },
  { id: 'heart', name: 'Heart', ratio: 1 },
  { id: 'burst', name: 'Burst', ratio: 1 },
  { id: 'leaf', name: 'Leaf', ratio: 1 },
  { id: 'maple', name: 'Maple', ratio: 1 },
  { id: 'pumpkin', name: 'Pumpkin', ratio: 1 },
  { id: 'acorn', name: 'Acorn', ratio: 1 },
  { id: 'ghost', name: 'Ghost', ratio: 1 },
  { id: 'snowflake', name: 'Snowflake', ratio: 1 },
  { id: 'tree', name: 'Tree', ratio: 1 },
  { id: 'star6', name: 'Star of David', ratio: 1 },
]

export const SHAPE_COLORS = [
  '#FFFFFF', '#F2F0EB', '#0E0E10', '#FF8A4C', '#E8C36A', '#C8683F', '#A3202E', '#E8B9A2',
  '#1F5A40', '#8A8F7A', '#14213D', '#B9C6D3',
]

// Plain shapes are drawn to fill a W x H pixel box, so they can be stretched.
const PLAIN = {
  square: (ctx, W, H) => ctx.fillRect(0, 0, W, H),
  circle(ctx, W, H) {
    ctx.beginPath()
    ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  },
  ring(ctx, W, H) {
    const t = Math.min(W, H) * 0.09
    ctx.lineWidth = t
    ctx.beginPath()
    ctx.ellipse(W / 2, H / 2, (W - t) / 2, (H - t) / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  },
  line(ctx, W, H) {
    ctx.beginPath()
    ctx.roundRect?.(0, 0, W, H, H / 2) ?? ctx.rect(0, 0, W, H)
    ctx.fill()
  },
  arrow(ctx, W, H) {
    const head = Math.min(H, W / 2)
    ctx.fillRect(0, H * 0.36, W - head * 0.9, H * 0.28)
    ctx.beginPath()
    ctx.moveTo(W - head, 0)
    ctx.lineTo(W, H / 2)
    ctx.lineTo(W - head, H)
    ctx.closePath()
    ctx.fill()
  },
}

const DRAW = {
  ...DRAWN,
  leaf: (ctx) => DRAWN.leaf(ctx, 0),
  maple: (ctx) => DRAWN.leaf(ctx, 1),
}

// A shape drawn on its own canvas `pxW` pixels wide. Some shapes cut details
// out of themselves, which must not punch through whatever lies underneath,
// so they are always drawn here first and then placed as a picture.
export function shapeCanvas(layer, pxW) {
  const W = Math.max(2, Math.round(pxW))
  const H = Math.max(2, Math.round((pxW * layer.h) / layer.w))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = ctx.strokeStyle = layer.color
  ctx.lineCap = ctx.lineJoin = 'round'
  if (PLAIN[layer.shape]) {
    PLAIN[layer.shape](ctx, W, H)
  } else if (DRAW[layer.shape]) {
    ctx.translate(W / 2, H / 2)
    ctx.scale(Math.min(W, H), Math.min(W, H))
    DRAW[layer.shape](ctx)
  }
  return canvas
}

const urls = new Map()

// The same drawing as an image address for the editor, cached per look.
export function shapeUrl(layer) {
  const ratio = Math.round((layer.w / layer.h) * 20) / 20
  const key = `${layer.shape}|${layer.color}|${ratio}`
  if (!urls.has(key)) urls.set(key, shapeCanvas({ ...layer, w: ratio, h: 1 }, ratio >= 1 ? 512 : 512 * ratio).toDataURL('image/png'))
  return urls.get(key)
}

// A new shape layer centred at (x, y).
export function newShape(id, sticker, color, x, y) {
  const w = sticker.ratio >= 4 ? 520 : 320
  return { id, type: 'shape', shape: sticker.id, color, x, y, w, h: w / sticker.ratio, rotation: 0 }
}
