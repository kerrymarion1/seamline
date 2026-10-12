import { strToU8, Unzip, UnzipPassThrough, Zip, ZipPassThrough } from 'fflate'
import { previewOf, probeVideo } from './images'
import { addImages, getState, mergeBackup } from './store'

// A backup is one zip: seamline.json (projects, albums, photo details) plus
// every full-size photo under images/<id>. Photos are stored, not compressed,
// and written one at a time so a large library does not have to fit in memory.
const MANIFEST = 'seamline.json'

export async function createBackup(onProgress = () => {}) {
  const { projects, albums, presets, images } = getState()
  // A video that only plays from its online copy has no file here to back up.
  const list = Object.values(images).filter((img) => img.blob)
  const parts = []
  let failed = null
  const zip = new Zip((err, chunk) => {
    if (err) failed = err
    else parts.push(new Blob([chunk]))
  })
  const add = (name, bytes) => {
    const entry = new ZipPassThrough(name)
    zip.add(entry)
    entry.push(bytes, true)
  }

  add(
    MANIFEST,
    strToU8(
      JSON.stringify({
        app: 'seamline',
        version: 1,
        createdAt: new Date().toISOString(),
        projects,
        albums,
        presets,
        images: list.map(({ id, name, width, height, blob, kind, duration }) => ({
          id, name, width, height, type: blob.type || 'image/jpeg', kind, duration,
        })),
      }),
    ),
  )
  for (const [i, img] of list.entries()) {
    onProgress(i, list.length)
    // Piece by piece: a video is far too large to read in one go.
    const entry = new ZipPassThrough(`images/${img.id}`)
    zip.add(entry)
    const reader = img.blob.stream().getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      entry.push(value, false)
    }
    entry.push(new Uint8Array(0), true)
  }
  zip.end()
  if (failed) throw failed
  return new Blob(parts, { type: 'application/zip' })
}

// Read every entry of a zip file into a Blob, streaming from disk.
async function readZip(file) {
  const entries = new Map()
  let failed = null
  const unzip = new Unzip()
  unzip.register(UnzipPassThrough)
  unzip.onfile = (entry) => {
    const chunks = []
    entry.ondata = (err, data, final) => {
      if (err) failed = err
      else chunks.push(new Blob([data])) // copy now: the buffer is reused
      if (final) entries.set(entry.name, new Blob(chunks))
    }
    entry.start()
  }
  const reader = file.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    unzip.push(value, false)
    if (failed) throw failed
  }
  unzip.push(new Uint8Array(0), true)
  if (failed) throw failed
  return entries
}

// Add everything from a backup that is not already on this device. Existing
// projects, albums and photos are left exactly as they are.
export async function restoreBackup(file, onProgress = () => {}) {
  let entries
  try {
    entries = await readZip(file)
  } catch {
    throw new Error('That file could not be read as a backup.')
  }
  const manifestBlob = entries.get(MANIFEST)
  if (!manifestBlob) throw new Error('That file is not a Seamline backup.')
  const manifest = JSON.parse(await manifestBlob.text())
  if (manifest.app !== 'seamline') throw new Error('That file is not a Seamline backup.')

  const have = getState().images
  const missing = manifest.images.filter((m) => !have[m.id] && entries.has(`images/${m.id}`))
  const records = []
  for (const [i, meta] of missing.entries()) {
    onProgress(i, missing.length)
    const blob = new Blob([entries.get(`images/${meta.id}`)], { type: meta.type })
    try {
      const video = meta.kind === 'video'
      const previewBlob = video ? (await probeVideo(blob)).previewBlob : await previewOf(blob)
      records.push({
        id: meta.id, name: meta.name, width: meta.width, height: meta.height, blob, previewBlob,
        ...(video ? { kind: 'video', duration: meta.duration } : null),
        url: URL.createObjectURL(blob),
        previewUrl: URL.createObjectURL(previewBlob),
      })
    } catch {
      // A damaged photo should not stop the rest from coming back.
    }
  }
  // Photos and the things that use them go in together, so nothing looks unused.
  addImages(records)
  const added = mergeBackup(manifest)
  return { ...added, photos: records.length }
}
