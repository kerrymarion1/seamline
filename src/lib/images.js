import { uid } from './scene'

const MAX_EDGE = 4000 // stored full-size copy, used for export
const PREVIEW_EDGE = 1400 // lighter copy shown in the editor

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = url
  })
}

function resize(img, maxEdge, type) {
  const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * k)
  const h = Math.round(img.naturalHeight * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Release the backing store right away; iOS is tight on canvas memory.
        canvas.width = canvas.height = 0
        blob ? resolve({ blob, w, h }) : reject(new Error('Could not process that image'))
      },
      type,
      0.92,
    )
  })
}

// The lighter editor copy of a stored photo (the photo itself if it is small).
export async function previewOf(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    if (Math.max(img.naturalWidth, img.naturalHeight) <= PREVIEW_EDGE) return blob
    return (await resize(img, PREVIEW_EDGE, blob.type === 'image/png' ? 'image/png' : 'image/jpeg')).blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Turn one picked file into an image record: a full copy capped at 4000px on
// the long edge, plus a small preview for the editor.
export async function importFile(file) {
  const srcUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(srcUrl)
    const hasAlpha = /png|webp|gif/.test(file.type)
    const type = hasAlpha ? 'image/png' : 'image/jpeg'
    const long = Math.max(img.naturalWidth, img.naturalHeight)

    let full = { blob: file, w: img.naturalWidth, h: img.naturalHeight }
    if (long > MAX_EDGE) full = await resize(img, MAX_EDGE, type)
    const preview = long > PREVIEW_EDGE ? await resize(img, PREVIEW_EDGE, type) : full

    return {
      id: uid(),
      name: file.name,
      width: full.w,
      height: full.h,
      blob: full.blob,
      previewBlob: preview.blob,
      url: URL.createObjectURL(full.blob),
      previewUrl: URL.createObjectURL(preview.blob),
    }
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}
