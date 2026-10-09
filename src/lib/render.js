import { paintBackground } from './backgrounds'
import { cellImageBox, cellRect } from './cells'
import { fontString, layerSize, LINE_HEIGHT, measureText } from './fonts'
import { frameH, FRAME_W, halfExtents, rad, sceneWidth } from './scene'

const JPEG_QUALITY = 0.9
const pause = () => new Promise((r) => setTimeout(r))

// Lines sit where CSS puts them: the font's ascent + descent centred in each line box.
function paintText(ctx, layer) {
  const { w, h, lines } = measureText(layer)
  ctx.font = fontString(layer)
  ctx.fillStyle = layer.color
  ctx.textAlign = layer.align
  ctx.textBaseline = 'alphabetic'
  const m = ctx.measureText('Hg')
  const lineH = layer.size * LINE_HEIGHT
  const baseline = (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent
  const x = layer.align === 'left' ? -w / 2 : layer.align === 'right' ? w / 2 : 0
  lines.forEach((line, i) => ctx.fillText(line, x, -h / 2 + i * lineH + baseline))
}

async function loadImage(url) {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

// Render every frame of a project to a JPEG blob (1080 wide, 1350 or 1080 tall).
// Layers are painted one at a time onto each frame they touch, so only one
// full-size photo is decoded at any moment.
export async function renderFrames(project, images, onProgress = () => {}) {
  const W = sceneWidth(project.frames)
  const H = frameH(project)
  const texts = project.layers.filter((l) => l.type === 'text')
  await Promise.all(texts.map((l) => document.fonts.load(fontString(l, 100), l.text || ' ')))

  const frames = Array.from({ length: project.frames }, (_, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = FRAME_W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(-i * FRAME_W, 0)
    paintBackground(ctx, project.background, W, H)
    return { canvas, ctx, left: i * FRAME_W }
  })

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
    // Glyphs can overhang their box a little, so give text some slack.
    const reach = hw + (layer.type === 'text' ? layer.size : 0)
    const touched = frames.filter((f) => layer.x + reach > f.left && layer.x - reach < f.left + FRAME_W)
    const image = layer.type === 'photo' ? images[layer.imageId] : null

    if (touched.length && (layer.type === 'text' || image)) {
      const img = image && (await loadImage(image.url))
      for (const { ctx } of touched) {
        ctx.save()
        ctx.translate(layer.x, layer.y)
        ctx.rotate(rad(layer.rotation))
        if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h)
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
