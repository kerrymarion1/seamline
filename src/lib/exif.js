// Where a photo was taken, read from the location its camera wrote into it:
// [lat, lng], or null. Only JPEGs carry it in a form read here. Many photos
// have none: the camera's location setting was off, or the phone or browser
// took it out when the photo was chosen for a web page.

export async function gpsOf(blob) {
  try {
    const found = await exifOf(blob)
    return found ? readGps(found.view, found.tiff) : null
  } catch {
    // A file cut short or written oddly: no place.
    return null
  }
}

// When a photo was taken, read from the date its camera wrote into it (the
// moment the picture was taken, else when the file was last written), as ms
// on this device's clock, or null. Only JPEGs, and only the file as chosen:
// a copy made smaller or put online has lost it.
export async function takenOf(blob) {
  try {
    const found = await exifOf(blob)
    return found ? readTaken(found.view, found.tiff) : null
  } catch {
    return null
  }
}

// The Exif block of a JPEG: its bytes, and where its own offsets count from.
async function exifOf(blob) {
  if (!blob || (blob.type && !/jpe?g/i.test(blob.type))) return null
  const view = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer())
  if (view.getUint16(0) !== 0xffd8) return null
  // Walk the JPEG's sections to the one holding the Exif data.
  let at = 2
  while (at + 10 < view.byteLength) {
    const marker = view.getUint16(at)
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
    const length = view.getUint16(at + 2)
    if (marker === 0xffe1 && view.getUint32(at + 4) === 0x45786966) return { view, tiff: at + 10 }
    at += 2 + length
  }
  return null
}

// "2026:11:26 14:03:22" in DateTimeOriginal (in the Exif section), else DateTime.
function readTaken(view, tiff) {
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (o) => view.getUint16(tiff + o, little)
  const u32 = (o) => view.getUint32(tiff + o, little)
  const entries = (dir) => Array.from({ length: u16(dir) }, (_, i) => dir + 2 + i * 12)
  const text = (entry) => {
    const n = u32(entry + 4)
    const from = n > 4 ? u32(entry + 8) : entry + 8
    return Array.from({ length: Math.min(n, 19) }, (_, i) => String.fromCharCode(view.getUint8(tiff + from + i))).join('')
  }
  const first = u32(4)
  let written = null
  let exif = 0
  for (const entry of entries(first)) {
    if (u16(entry) === 0x0132) written = text(entry)
    if (u16(entry) === 0x8769) exif = u32(entry + 8)
  }
  let original = null
  if (exif) for (const entry of entries(exif)) if (u16(entry) === 0x9003) original = text(entry)
  for (const stamp of [original, written]) {
    const m = stamp?.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/)
    if (!m) continue
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
    const at = new Date(y, mo - 1, d, h, mi, s).getTime()
    // A camera whose clock was never set says 1970, or 0000.
    if (y >= 1990 && Number.isFinite(at) && at <= Date.now() + 864e5) return at
  }
  return null
}

// `tiff` is where the Exif block's own offsets count from.
function readGps(view, tiff) {
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (o) => view.getUint16(tiff + o, little)
  const u32 = (o) => view.getUint32(tiff + o, little)
  const first = u32(4)
  let gps = 0
  for (let i = 0, n = u16(first); i < n; i++) {
    const entry = first + 2 + i * 12
    if (u16(entry) === 0x8825) gps = u32(entry + 8)
  }
  if (!gps) return null
  const found = {}
  for (let i = 0, n = u16(gps); i < n; i++) {
    const entry = gps + 2 + i * 12
    const tag = u16(entry)
    if (tag === 1 || tag === 3) found[tag] = String.fromCharCode(view.getUint8(tiff + entry + 8))
    if ((tag === 2 || tag === 4) && u16(entry + 2) === 5 && u32(entry + 4) === 3) {
      const values = u32(entry + 8)
      const part = (k) => u32(values + k * 8) / u32(values + k * 8 + 4)
      found[tag] = part(0) + part(1) / 60 + part(2) / 3600
    }
  }
  let lat = found[2]
  let lng = found[4]
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  if (found[1] === 'S') lat = -lat
  if (found[3] === 'W') lng = -lng
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]
}
