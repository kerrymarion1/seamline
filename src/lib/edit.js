import { replaceOnline } from './cloud'
import { previewOf } from './images'
import { addImages, getState, markEdited } from './store'
import { ensureLocal } from './sync'

// Turning and cropping a photo. The photo keeps its id, so its reactions,
// comments, caption and tags stay with it; the new picture replaces the old
// one here and online, and the album notes when, so other devices fetch it
// again. `turns` are quarter turns clockwise; `crop` is the part to keep, as
// fractions of the turned picture: { x, y, w, h }.

function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that photo'))
    img.src = url
  })
}

// The picture at `url`, turned and cropped, as a JPEG.
export async function renderEdit(url, { turns, crop }) {
  const img = await load(url)
  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  const sideways = turns % 2 === 1
  const tw = sideways ? h0 : w0
  const th = sideways ? w0 : h0
  const x = Math.round(crop.x * tw)
  const y = Math.round(crop.y * th)
  const w = Math.max(1, Math.round(crop.w * tw))
  const h = Math.max(1, Math.round(crop.h * th))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  // Turn the whole picture about its middle, then keep only the crop.
  ctx.translate(-x, -y)
  ctx.translate(tw / 2, th / 2)
  ctx.rotate((turns * Math.PI) / 2)
  ctx.drawImage(img, -w0 / 2, -h0 / 2)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('Could not save the photo')
  return { blob, width: w, height: h }
}

export async function editPhoto(albumId, id, change) {
  await ensureLocal([id])
  const image = getState().images[id]
  if (!image?.blob) throw new Error('This photo is still on its way to this device. Try again in a moment.')
  const { blob, width: w, height: h } = await renderEdit(image.url, change)
  const previewBlob = await previewOf(blob)
  const at = Date.now()
  const { remote: _, ...rest } = image
  const next = {
    ...rest, blob, previewBlob, width: w, height: h, edited: at,
    url: URL.createObjectURL(blob), previewUrl: URL.createObjectURL(previewBlob),
  }
  // Online first: if that fails, nothing has changed anywhere.
  await replaceOnline(next)
  addImages([next])
  markEdited(albumId, id, at)
  setTimeout(() => {
    URL.revokeObjectURL(image.url)
    if (image.previewUrl !== image.url) URL.revokeObjectURL(image.previewUrl)
  }, 5000)
}
