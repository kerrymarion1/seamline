import { zipSync } from 'fflate'

const slug = (name) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carousel'

export function toFiles(blobs, name) {
  const base = slug(name)
  return blobs.map(
    (b, i) =>
      new File([b], blobs.length === 1 ? `${base}.jpg` : `${base}-${String(i + 1).padStart(2, '0')}.jpg`, {
        type: 'image/jpeg',
      }),
  )
}

export const canShareFiles = (files) => !!navigator.canShare?.({ files })

// Opens the system share sheet. Resolves false if the user dismissed it.
export async function shareFiles(files) {
  try {
    await navigator.share({ files })
    return true
  } catch (err) {
    if (err.name === 'AbortError') return false
    throw err
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export const downloadFile = (file) => download(file, file.name)

export async function downloadZip(files, name) {
  const entries = {}
  for (const f of files) entries[f.name] = new Uint8Array(await f.arrayBuffer())
  // JPEGs are already compressed; store them as-is.
  const zip = new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' })
  download(zip, `${slug(name)}.zip`)
}

// A File for a stored photo, named after the original where we know it.
export function imageFile(image) {
  const ext = image.blob.type === 'image/png' ? 'png' : 'jpg'
  const base = (image.name ?? 'photo').replace(/\.[^.]+$/, '') || 'photo'
  return new File([image.blob], `${base}.${ext}`, { type: image.blob.type || 'image/jpeg' })
}

// Download photos to the phone's storage: one file as it is, several as a zip.
export async function saveToPhone(files, zipName = 'photos') {
  if (files.length === 1) downloadFile(files[0])
  else await downloadZip(files, zipName)
}

// Whether this browser can hand files to other apps at all.
export const canShare = () => typeof navigator.share === 'function' && typeof navigator.canShare === 'function'

// Send photos to another app through the system share sheet.
export async function sharePhotos(files) {
  if (!canShareFiles(files)) {
    throw new Error(
      files.length > 1 ? 'Too many photos to share at once. Select fewer and try again.' : 'This photo cannot be shared from here.',
    )
  }
  return shareFiles(files)
}
