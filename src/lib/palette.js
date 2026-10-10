import { useEffect, useState } from 'react'
import { normalizeBackground } from './backgrounds'

// Colours taken from a project's own photos, so backgrounds, text and shapes
// can be matched to them. Worked out once per photo and remembered.
const perImage = new Map() // image id -> Promise<[{ rgb, weight }]>

const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const light = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b

// The main colours of one photo: shrink it, sort its pixels into coarse
// buckets, and average the fullest buckets that are not near-duplicates.
async function coloursOf(image) {
  const img = new Image()
  img.src = image.previewUrl
  await img.decode()
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  const buckets = new Map()
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5)
    const b = buckets.get(key) ?? [0, 0, 0, 0]
    b[0] += data[i]
    b[1] += data[i + 1]
    b[2] += data[i + 2]
    b[3]++
    buckets.set(key, b)
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b[3] - a[3])
    .map(([r, g, b, n]) => ({ rgb: [r / n, g / n, b / n], weight: n / (size * size) }))
  const picked = []
  for (const c of ranked) {
    if (picked.length === 4) break
    if (picked.every((p) => distance(p.rgb, c.rgb) > 44)) picked.push(c)
  }
  return picked
}

const cached = (image) => {
  if (!perImage.has(image.id)) perImage.set(image.id, coloursOf(image).catch(() => []))
  return perImage.get(image.id)
}

// Ids of every photo a project shows: in spots, as free photos, as background.
function photoIds(project) {
  const bg = normalizeBackground(project.background)
  return [
    ...new Set([
      ...(project.cells ?? []).map((c) => c.imageId),
      ...project.layers.map((l) => l.imageId),
      bg.type === 'photo' ? bg.imageId : null,
    ]),
  ].filter(Boolean)
}

// Up to five distinct tones across the project's photos, dark to light.
export function useProjectPalette(project, images) {
  const [palette, setPalette] = useState([])
  const ids = project ? photoIds(project).filter((id) => images[id]) : []
  const key = ids.join()
  useEffect(() => {
    let live = true
    Promise.all(ids.map((id) => cached(images[id]))).then((lists) => {
      if (!live) return
      // Favour colours that are prominent in a photo and shared across photos.
      const all = lists.flat().sort((a, b) => b.weight - a.weight)
      const picked = []
      for (const c of all) {
        if (picked.length === 5) break
        if (picked.every((p) => distance(p.rgb, c.rgb) > 52)) picked.push(c)
      }
      setPalette(picked.map((c) => c.rgb).sort((a, b) => light(a) - light(b)).map(hex))
    })
    return () => {
      live = false
    }
    // The photo ids are the only thing that changes the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return palette
}
