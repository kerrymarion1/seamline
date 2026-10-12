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

// `img` is an image, or a video with its own size passed in.
function resize(img, maxEdge, type, srcW = img.naturalWidth, srcH = img.naturalHeight) {
  const k = Math.min(1, maxEdge / Math.max(srcW, srcH))
  const w = Math.round(srcW * k)
  const h = Math.round(srcH * k)
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

// ---------- videos ----------
// A video sits in an album beside the photos, as a record of the same shape:
// `blob` is the file exactly as it came, `previewBlob` a still taken from it.
// Videos stay in albums; they are never placed in a collage.

const VIDEO_NAME = /\.(mp4|m4v|mov|webm|mkv|3gp)$/i
const READ_TIMEOUT = 20000

export const isVideo = (image) => image?.kind === 'video'
export const isVideoFile = (file) => file.type.startsWith('video/') || (!file.type && VIDEO_NAME.test(file.name))

// "0:07", "2:41"
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// "3 photos", "1 video", "3 photos · 2 videos"
export function countText(items) {
  const videos = items.filter(isVideo).length
  const photos = items.length - videos
  const say = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (!videos) return say(photos, 'photo')
  return photos ? `${say(photos, 'photo')} · ${say(videos, 'video')}` : say(videos, 'video')
}

// A video's size and length, and a still to stand for it in the grid.
export async function probeVideo(blob) {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  const until = (event) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not read that video')), READ_TIMEOUT)
      video.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true })
      video.addEventListener('error', () => (clearTimeout(timer), reject(new Error('Could not read that video'))), { once: true })
    })
  try {
    const loaded = until('loadeddata')
    video.src = url
    await loaded
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    // A little way in: the very first frame is often black.
    const at = Math.min(1, duration / 4)
    if (at > 0) {
      const sought = until('seeked')
      video.currentTime = at
      await sought
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error('Could not read that video')
    const still = await resize(video, PREVIEW_EDGE, 'image/jpeg', video.videoWidth, video.videoHeight)
    return { width: video.videoWidth, height: video.videoHeight, duration, previewBlob: still.blob }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export async function importVideo(file) {
  const { width, height, duration, previewBlob } = await probeVideo(file)
  return {
    id: uid(),
    kind: 'video',
    name: file.name,
    width,
    height,
    duration,
    blob: file,
    previewBlob,
    url: URL.createObjectURL(file),
    previewUrl: URL.createObjectURL(previewBlob),
  }
}

// A photo or a video, whichever the file is.
export const importMedia = (file) => (isVideoFile(file) ? importVideo(file) : importFile(file))
