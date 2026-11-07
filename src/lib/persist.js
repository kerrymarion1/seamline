import { commit, loadAll } from './db'
import { dropImages, getState, historyProjects, hydrate, setSaveFailed, subscribe } from './store'

// What is currently on disk, by id, so each save only writes what changed.
const saved = { projects: new Map(), albums: new Map(), presets: new Map(), images: new Map() }
let timer = 0
let saving = Promise.resolve()

const toRow = ({ id, width, height, name, blob, previewBlob, kind, duration, remote, edited }) => ({
  id, width, height, name, blob,
  ...(kind ? { kind, duration } : null), // videos only
  // When its picture was last cropped or turned, so it isn't fetched again.
  ...(edited ? { edited } : null),
  // The online address of a photo or video whose file is not kept on this device.
  ...(remote ? { remote } : null),
  // Small photos use one blob for both; don't store it twice.
  previewBlob: previewBlob === blob ? null : previewBlob,
})

function fromRow(row) {
  const previewBlob = row.previewBlob ?? row.blob
  const url = row.blob ? URL.createObjectURL(row.blob) : row.remote
  return { ...row, previewBlob, url, previewUrl: previewBlob === row.blob ? url : URL.createObjectURL(previewBlob) }
}

// Photos that no project and no album uses any more.
function orphans({ projects, albums, presets, images }) {
  const used = new Set()
  // Versions kept for undo and saved templates count as using their photos too.
  for (const p of [...projects, ...historyProjects(), ...presets]) {
    if (p.background?.imageId) used.add(p.background.imageId)
    for (const l of p.layers) if (l.imageId) used.add(l.imageId)
    for (const c of p.cells ?? []) if (c.imageId) used.add(c.imageId)
  }
  for (const a of albums) for (const id of a.imageIds) used.add(id)
  return Object.keys(images).filter((id) => !used.has(id))
}

async function flush() {
  clearTimeout(timer)
  const dead = orphans(getState())
  if (dead.length) dropImages(dead)

  const state = getState()
  const ops = []
  const diff = (store, rows, toStored = (r) => r) => {
    const seen = new Set()
    for (const row of rows) {
      seen.add(row.id)
      if (saved[store].get(row.id) !== row) ops.push({ store, put: toStored(row), row })
    }
    for (const id of saved[store].keys()) if (!seen.has(id)) ops.push({ store, del: id })
  }
  diff('projects', state.projects)
  diff('albums', state.albums)
  diff('presets', state.presets)
  diff('images', Object.values(state.images), toRow)
  if (!ops.length) return

  try {
    await commit(ops)
    for (const op of ops) {
      if (op.put) saved[op.store].set(op.put.id, op.row)
      else saved[op.store].delete(op.del)
    }
    setSaveFailed(false)
  } catch (err) {
    console.error('Autosave failed', err)
    setSaveFailed(true)
  }
}

const queue = () => (saving = saving.then(flush))

// Load everything saved on this device, then keep it saved as it changes.
export async function startPersistence() {
  try {
    const data = await loadAll()
    const images = data.images.map(fromRow)
    hydrate({
      projects: data.projects.sort((a, b) => b.updatedAt - a.updatedAt),
      albums: data.albums.sort((a, b) => b.createdAt - a.createdAt),
      presets: data.presets.sort((a, b) => b.createdAt - a.createdAt),
      images: Object.fromEntries(images.map((i) => [i.id, i])),
    })
    for (const p of getState().projects) saved.projects.set(p.id, p)
    for (const a of getState().albums) saved.albums.set(a.id, a)
    for (const t of getState().presets) saved.presets.set(t.id, t)
    for (const i of images) saved.images.set(i.id, i)
  } catch (err) {
    // Private browsing or blocked storage: carry on without saving.
    console.error('Could not open local storage', err)
    hydrate({})
    setSaveFailed(true)
    return
  }

  subscribe(() => {
    clearTimeout(timer)
    timer = setTimeout(queue, 500)
  })
  // Phones can kill a backgrounded page without warning; save on the way out.
  document.addEventListener('visibilitychange', () => document.hidden && queue())
  window.addEventListener('pagehide', queue)
  // Ask the browser not to evict our data when the device runs low on space.
  navigator.storage?.persist?.().catch(() => {})
}
