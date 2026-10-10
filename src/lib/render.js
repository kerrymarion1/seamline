import { normalizeBackground, paintBackground } from './backgrounds'
import { cellImageBox, cellRect } from './cells'
import { fontString, layerSize, LINE_HEIGHT, measureText, photoDecor, textDecor } from './fonts'
import { frameH, FRAME_W, halfExtents, rad, sceneWidth } from './scene'
import { shapeCanvas } from './shapes'

const JPEG_QUALITY = 0.9
const pause = () => new Promise((r) => setTimeout(r))

// Canvas shadows ignore rotation, CSS ones turn with their element. Turn the
// offset by hand so a rotated layer casts the same shadow in both.
function setShadow(ctx, shadow, rotation) {
  ctx.shadowColor = shadow.color
  ctx.shadowBlur = shadow.blur
  ctx.shadowOffsetX = -shadow.y * Math.sin(rad(rotation))
  ctx.shadowOffsetY = shadow.y * Math.cos(rad(rotation))
}
const clearShadow = (ctx) => {
  ctx.shadowColor = 'transparent'
}

// Lines sit where CSS puts them: the font's ascent + descent centred in each line box.
function paintText(ctx, layer) {
  const { w, h, lines } = measureText(layer)
  const d = textDecor(layer)
  if (d.pill) {
    const p = d.pill.pad
    ctx.fillStyle = d.pill.color
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(-w / 2 - p, -h / 2 - p, w + 2 * p, h + 2 * p, d.pill.radius + p)
    else ctx.rect(-w / 2 - p, -h / 2 - p, w + 2 * p, h + 2 * p)
    ctx.fill()
  }
  ctx.font = fontString(layer)
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(layer.spacing ?? 0) * layer.size}px`
  ctx.fillStyle = layer.color
  ctx.textAlign = layer.align
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  const m = ctx.measureText('Hg')
  const lineH = layer.size * LINE_HEIGHT
  const baseline = (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent
  const x = layer.align === 'left' ? -w / 2 : layer.align === 'right' ? w / 2 : 0
  lines.forEach((line, i) => {
    const y = -h / 2 + i * lineH + baseline
    if (d.shadow) setShadow(ctx, d.shadow, layer.rotation)
    if (d.outline) {
      // Outline first, then the letters over its inner half, as CSS paints it.
      ctx.strokeStyle = d.outline.color
      ctx.lineWidth = d.outline.width
      ctx.strokeText(line, x, y)
      clearShadow(ctx)
    }
    ctx.fillText(line, x, y)
    clearShadow(ctx)
  })
}

function paintPhoto(ctx, layer, img, w, h) {
  const d = photoDecor(layer)
  const b = d.border
  if (d.shadow) setShadow(ctx, d.shadow, layer.rotation)
  if (d.shadow || b) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b)
    clearShadow(ctx)
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
}

async function loadImage(url) {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

// Render every frame of a project to a JPEG blob (1080 wide; 1350, 1080 or
// 1920 tall). Layers are painted one at a time onto each frame they touch, so
// only one full-size photo is decoded at any moment.
export async function renderFrames(project, images, onProgress = () => {}) {
  const W = sceneWidth(project.frames)
  const H = frameH(project)
  const texts = project.layers.filter((l) => l.type === 'text')
  await Promise.all(texts.map((l) => document.fonts.load(fontString(l, 100), l.text || ' ')))

  const bg = normalizeBackground(project.background)
  const bgImage = bg.type === 'photo' && images[bg.imageId]
  const bgPhoto = bgImage ? { img: await loadImage(bgImage.url), width: bgImage.width, height: bgImage.height } : null

  const frames = Array.from({ length: project.frames }, (_, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = FRAME_W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(-i * FRAME_W, 0)
    paintBackground(ctx, bg, W, H, bgPhoto)
    return { canvas, ctx, left: i * FRAME_W }
  })
  if (bgPhoto) bgPhoto.img.src = ''

  const cells = (project.cells ?? []).filter((c) => images[c.imageId])
  const steps = cells.length + project.layers.length + frames.length
  let done = 0

  // Collage cells sit under the free layers. Empty cells are not exported.
  for (const cell of cells) {
    const image = images[cell.imageId]
    const raw = cellRect(cell, project)
    // Whole pixels keep neighbouring cells from leaving a hairline between them.
    const x = Math.round(raw.x)
    const y = Math.round(raw.y)
    const rect = { x, y, w: Math.round(raw.x + raw.w) - x, h: Math.round(raw.y + raw.h) - y }
    const box = cellImageBox(cell, rect, image)
    const radius = Math.min(project.layout?.radius ?? 0, rect.w / 2, rect.h / 2)
    const touched = frames.filter((f) => rect.x + rect.w > f.left && rect.x < f.left + FRAME_W)
    if (touched.length) {
      const img = await loadImage(image.url)
      for (const { ctx } of touched) {
        ctx.save()
        ctx.beginPath()
        if (radius > 0 && ctx.roundRect) ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius)
        else ctx.rect(rect.x, rect.y, rect.w, rect.h)
        ctx.clip()
        ctx.drawImage(img, rect.x + box.left, rect.y + box.top, box.w, box.h)
        ctx.restore()
      }
      img.src = ''
    }
    onProgress(++done / steps)
    await pause()
  }

  for (const layer of project.layers) {
    const { w, h } = layerSize(layer)
    const { hw } = halfExtents(w, h, layer.rotation)
    // Glyphs, outlines, borders and shadows reach past the layer's own box.
    const reach = hw + (layer.type === 'text' ? layer.size * 1.5 : layer.type === 'photo' ? 160 : 0)
    const touched = frames.filter((f) => layer.x + reach > f.left && layer.x - reach < f.left + FRAME_W)
    const image = layer.type === 'photo' ? images[layer.imageId] : null

    if (touched.length && (layer.type !== 'photo' || image)) {
      const img = image && (await loadImage(image.url))
      const shape = layer.type === 'shape' && shapeCanvas(layer, Math.min(3000, w))
      for (const { ctx } of touched) {
        ctx.save()
        ctx.translate(layer.x, layer.y)
        ctx.rotate(rad(layer.rotation))
        if (img) paintPhoto(ctx, layer, img, w, h)
        else if (shape) ctx.drawImage(shape, -w / 2, -h / 2, w, h)
        else paintText(ctx, layer)
        ctx.restore()
      }
      if (img) img.src = ''
    }
    onProgress(++done / steps)
    await pause()
  }

  const blobs = []
  for (const { canvas } of frames) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    canvas.width = canvas.height = 0
    if (!blob) throw new Error('Could not render a frame')
    blobs.push(blob)
    onProgress(++done / steps)
  }
  return blobs
}
