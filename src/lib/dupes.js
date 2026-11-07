import { isVideo } from './images'

// Spotting photos that are already in an album when more are chosen. The
// same file is matched by its name and size; the same picture saved again
// (resized, sent through a chat, downloaded and re-picked) by a fingerprint
// of what it looks like: a tiny greyscale version, compared brightness by
// brightness (a "difference hash"). Fingerprints of photos already here are
// kept on the device so each is only worked out once.

const KEY = 'seamline:fingerprints'
const CLOSE = 3 // of 64: this close is the same picture

let kept = null
function fingerprints() {
  if (!kept) {
    try {
      kept = new Map(Object.entries(JSON.parse(localStorage.getItem(KEY) || '{}')))
    } catch {
      kept = new Map()
    }
  }
  return kept
}
function keep() {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Storage full or blocked: they are worked out again next time.
  }
}

function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// 64 bits, as 16 hex digits: is each spot brighter than the one to its right?
async function fingerprint(url) {
  const img = await load(url)
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, 9, 8)
  const px = ctx.getImageData(0, 0, 9, 8).data
  const light = (i) => px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
  let bits = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4
      bits = (bits << 1n) | (light(i) > light(i + 4) ? 1n : 0n)
    }
  }
  return bits.toString(16).padStart(16, '0')
}

function apart(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let n = 0
  while (x) {
    n += Number(x & 1n)
    x >>= 1n
  }
  return n
}

// Which of `records` (just chosen) are already in an album: a Map from the
// record's id to that album. Videos are matched by name, size and length.
export async function findDuplicates(records, albums, images) {
  const where = new Map()
  for (const album of albums) for (const id of album.imageIds) if (images[id] && !where.has(id)) where.set(id, album)
  const found = new Map()

  for (const r of records) {
    for (const [id, album] of where) {
      const img = images[id]
      const sameFile = !!img.name && img.name === r.name && img.width === r.width && img.height === r.height
      const sameClip = isVideo(r) && isVideo(img) && sameFile && Math.round(img.duration ?? 0) === Math.round(r.duration ?? 0)
      if (isVideo(r) ? sameClip : sameFile) {
        found.set(r.id, album)
        break
      }
    }
  }

  const chosen = []
  for (const r of records) {
    if (found.has(r.id) || isVideo(r)) continue
    try {
      chosen.push([r, await fingerprint(r.previewUrl)])
    } catch {
      // Unreadable here: it simply isn't checked.
    }
  }
  if (!chosen.length) return found

  const prints = fingerprints()
  let added = false
  for (const [id, album] of where) {
    const img = images[id]
    if (isVideo(img)) continue
    let print = prints.get(id)
    if (!print) {
      try {
        print = await fingerprint(img.previewUrl)
      } catch {
        continue
      }
      prints.set(id, print)
      added = true
    }
    for (const [r, mine] of chosen) if (!found.has(r.id) && apart(print, mine) <= CLOSE) found.set(r.id, album)
  }
  if (added) keep()
  return found
}
