import { getCloud } from './cloud'
import { takenOf } from './exif'
import { getState, setPhotosTaken } from './store'

// Photos added before dates were read: look through them once, quietly, on
// the device that holds them in full, and note the dates in the albums this
// person may change. Only a photo that says nothing is remembered as looked
// at, so a date lost to two devices saving at once is simply found again.

const CHECKED = 'seamline:takenChecked'
const readChecked = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKED) || '[]'))
  } catch {
    return new Set()
  }
}
const saveChecked = (set) => {
  try {
    localStorage.setItem(CHECKED, JSON.stringify([...set]))
  } catch {
    // Storage blocked: they are just read again next time.
  }
}

let running = false
export async function fillTaken() {
  if (running) return
  running = true
  try {
    const { guest, session } = getCloud()
    const { albums, images } = getState()
    const checked = readChecked()
    const todo = new Map() // photo -> the albums wanting its date
    for (const album of albums) {
      if (guest && album.createdBy !== session?.user.id) continue
      for (const id of album.imageIds) {
        if (images[id]?.blob && !album.taken?.[id] && !checked.has(id)) todo.set(id, [...(todo.get(id) ?? []), album.id])
      }
    }
    const found = new Map() // album -> { [photo]: ms }
    for (const [id, albumIds] of todo) {
      const taken = await takenOf(images[id].blob)
      if (taken) for (const albumId of albumIds) found.set(albumId, { ...found.get(albumId), [id]: taken })
      else checked.add(id)
      await new Promise((r) => setTimeout(r)) // never in the way of a tap
    }
    saveChecked(checked)
    for (const [albumId, taken] of found) setPhotosTaken(albumId, taken)
  } finally {
    running = false
  }
}
