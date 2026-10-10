import { useSyncExternalStore } from 'react'
import { DEFAULT_BACKGROUND } from './backgrounds'
import { cellRect, cellToLayer, DEFAULT_LAYOUT, makeTiles } from './cells'
import { clamp, frameH, FORMATS, MAX_FRAMES, MIN_FRAMES, uid } from './scene'

// One small immutable store, mirrored to IndexedDB by persist.js.
// `images` maps id -> image record (see images.js); projects and albums refer
// to photos by id, so one photo can sit in an album and in several projects.
const IMPORT_ALBUM = 'seamline:importAlbum' // 'auto', 'off' or an album id
let state = {
  ready: false, saveFailed: false, projects: [], albums: [], presets: [], images: {},
  importAlbum: localStorage.getItem(IMPORT_ALBUM) ?? 'auto',
}
const listeners = new Set()

export const getState = () => state

function setState(fn) {
  state = fn(state)
  listeners.forEach((l) => l())
}

export const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useStore = (selector) =>
  useSyncExternalStore(subscribe, () => selector(state))

// ---------- what sync needs to know about deletions ----------
// Deleting something only on this device would let the next sync bring it
// straight back, so each deletion leaves a marker until other devices hear of it.
const TOMBS = 'seamline:tombstones'
export const tombstones = () => JSON.parse(localStorage.getItem(TOMBS) || '[]')
const saveTombs = (list) => localStorage.setItem(TOMBS, JSON.stringify(list))
function entomb(kind, id) {
  saveTombs([...tombstones().filter((t) => !(t.kind === kind && t.id === id)), { kind, id, at: Date.now() }])
}
export const clearTombstone = (kind, id) =>
  saveTombs(tombstones().filter((t) => !(t.kind === kind && t.id === id)))

const LISTS = { project: 'projects', album: 'albums', preset: 'presets' }

// Take in changes made on another device: `docs` replace or add, `removed`
// delete. Nothing here counts as a local edit, so it is not sent back.
export function applyRemote({ docs = [], removed = [] }) {
  if (!docs.length && !removed.length) return
  setState((s) => {
    const next = { ...s }
    for (const [kind, list] of Object.entries(LISTS)) {
      const incoming = new Map(docs.filter((d) => d.kind === kind).map((d) => [d.doc.id, d.doc]))
      const gone = new Set(removed.filter((r) => r.kind === kind).map((r) => r.id))
      if (!incoming.size && !gone.size) continue
      const kept = s[list].filter((x) => !incoming.has(x.id) && !gone.has(x.id))
      next[list] = [...incoming.values(), ...kept].sort(
        (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
      )
    }
    return next
  })
}

// Called once at startup with whatever was saved on this device.
export const hydrate = (data) => setState((s) => ({ ...s, ...data, ready: true }))

export const setSaveFailed = (saveFailed) =>
  state.saveFailed !== saveFailed && setState((s) => ({ ...s, saveFailed }))

export function dropImages(ids) {
  setState((s) => {
    const images = { ...s.images }
    for (const id of ids) {
      const img = images[id]
      if (!img) continue
      URL.revokeObjectURL(img.url)
      if (img.previewUrl !== img.url) URL.revokeObjectURL(img.previewUrl)
      delete images[id]
    }
    return { ...s, images }
  })
}

export const useProject = (id) =>
  useStore((s) => s.projects.find((p) => p.id === id))

// ---------- undo / redo ----------
// Each project keeps a stack of earlier versions while it is open. Projects
// are immutable, so a version is just a reference to the old object.
const HISTORY_LIMIT = 80
const COALESCE_MS = 400 // changes closer together than this count as one step
const histories = new Map()

function historyOf(id) {
  if (!histories.has(id)) histories.set(id, { past: [], future: [], last: 0 })
  return histories.get(id)
}

// A drag, a slider sweep or a burst of typing fires many small changes; only
// the version from before the burst is kept, so one undo reverses all of it.
function remember(project) {
  const h = historyOf(project.id)
  const now = Date.now()
  if (now - h.last > COALESCE_MS) {
    h.past.push(project)
    if (h.past.length > HISTORY_LIMIT) h.past.shift()
  }
  h.last = now
  h.future.length = 0
}

function patchProject(id, fn) {
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (p.id !== id) return p
      const next = fn(p)
      if (next === p) return p
      remember(p)
      return { ...next, updatedAt: Date.now() }
    }),
  }))
}

function travel(id, from, to) {
  const h = historyOf(id)
  if (!h[from].length) return
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (p.id !== id) return p
      h[to].push(p)
      return { ...h[from].pop(), updatedAt: Date.now() }
    }),
  }))
  h.last = 0 // the next edit starts a fresh step
}

export const undo = (id) => travel(id, 'past', 'future')
export const redo = (id) => travel(id, 'future', 'past')
export const canUndo = (id) => historyOf(id).past.length > 0
export const canRedo = (id) => historyOf(id).future.length > 0
export const clearHistory = (id) => histories.delete(id)

// Earlier versions still refer to photos; those must not be cleaned up while
// an undo could bring them back.
export const historyProjects = () => [...histories.values()].flatMap((h) => [...h.past, ...h.future])

// `template` and `count` optionally start the project with a collage layout;
// `preset` starts it from one of the user's saved templates instead.
export function createProject({ name, frames, format, template, count, preset }) {
  if (preset) {
    const project = {
      id: uid(),
      name: name?.trim() || preset.name,
      frames: preset.frames,
      frameH: preset.frameH,
      background: preset.background,
      layout: preset.layout,
      cells: preset.cells.map((c) => ({ ...c, id: uid() })),
      layers: preset.layers.map((l) => ({ ...l, id: uid() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setState((s) => ({ ...s, projects: [project, ...s.projects] }))
    return project
  }
  let project = {
    id: uid(),
    name: name?.trim() || 'Untitled',
    frames: clamp(frames, MIN_FRAMES, MAX_FRAMES),
    frameH: (FORMATS.find((f) => f.id === format) ?? FORMATS[0]).h,
    background: DEFAULT_BACKGROUND,
    layers: [],
    layout: null,
    cells: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  if (template) project = relayout(project, template, count)
  setState((s) => ({ ...s, projects: [project, ...s.projects] }))
  return project
}

export const updateProject = (id, patch) =>
  patchProject(id, (p) => ({ ...p, ...patch }))

const freeLayers = (p, cells) =>
  cells
    .filter((c) => c.imageId && state.images[c.imageId])
    .map((c) => cellToLayer(c, cellRect(c, p), state.images[c.imageId], uid()))

// Rebuild the cells from a template, carrying photos over in order. Photos
// that no longer have a cell become free layers rather than disappearing.
function relayout(p, template, count = p.layout?.count) {
  const filled = (p.cells ?? []).filter((c) => c.imageId)
  const next = { ...p, layout: { ...DEFAULT_LAYOUT, ...p.layout, template, count } }
  next.cells = makeTiles(template, p.frames, frameH(p), count).map((tile, i) => {
    const prev = filled[i]
    return { id: uid(), ...tile, imageId: prev?.imageId ?? null, ox: 0, oy: 0, zoom: 1 }
  })
  next.layers = [...p.layers, ...freeLayers(p, filled.slice(next.cells.length))]
  return next
}

// `count` is how many photo spots the layout should have.
export const applyLayout = (id, template, count) => patchProject(id, (p) => relayout(p, template, count))

export const clearLayout = (id) =>
  patchProject(id, (p) => ({
    ...p,
    layout: null,
    cells: [],
    layers: [...p.layers, ...freeLayers(p, p.cells ?? [])],
  }))

export const updateLayout = (id, patch) =>
  patchProject(id, (p) => ({ ...p, layout: { ...p.layout, ...patch } }))

export const setFrames = (id, frames) =>
  patchProject(id, (p) => {
    const next = { ...p, frames: clamp(frames, MIN_FRAMES, MAX_FRAMES) }
    return p.layout ? relayout(next, p.layout.template) : next
  })

export const setFormat = (id, format) =>
  patchProject(id, (p) => {
    const next = { ...p, frameH: (FORMATS.find((f) => f.id === format) ?? FORMATS[0]).h }
    return p.layout ? relayout(next, p.layout.template) : next
  })

// patches: { [cellId]: partial cell }
export const updateCells = (id, patches) =>
  patchProject(id, (p) => ({
    ...p,
    cells: p.cells.map((c) => (patches[c.id] ? { ...c, ...patches[c.id] } : c)),
  }))

export const removeCell = (id, cellId) =>
  patchProject(id, (p) => ({ ...p, cells: p.cells.filter((c) => c.id !== cellId) }))

const photoOf = (c) => ({ imageId: c.imageId, ox: c.ox, oy: c.oy, zoom: c.zoom })

export const swapCells = (id, a, b) =>
  patchProject(id, (p) => {
    const ca = p.cells.find((c) => c.id === a)
    const cb = p.cells.find((c) => c.id === b)
    if (!ca || !cb) return p
    return {
      ...p,
      cells: p.cells.map((c) => (c === ca ? { ...c, ...photoOf(cb) } : c === cb ? { ...c, ...photoOf(ca) } : c)),
    }
  })

// A copy of a project, photos and all, to use as the start of the next one.
export function duplicateProject(id) {
  const src = state.projects.find((p) => p.id === id)
  if (!src) return null
  const copy = {
    ...src,
    id: uid(),
    name: `${src.name} copy`,
    cells: (src.cells ?? []).map((c) => ({ ...c, id: uid() })),
    layers: src.layers.map((l) => ({ ...l, id: uid() })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  setState((s) => ({ ...s, projects: [copy, ...s.projects] }))
  return copy
}

export function deleteProject(id) {
  entomb('project', id)
  setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }))
}

export function addImages(records) {
  setState((s) => ({
    ...s,
    images: { ...s.images, ...Object.fromEntries(records.map((r) => [r.id, r])) },
  }))
}

export const addLayers = (pid, layers) =>
  patchProject(pid, (p) => ({ ...p, layers: [...p.layers, ...layers] }))

export const updateLayer = (pid, lid, patch) =>
  patchProject(pid, (p) => ({
    ...p,
    layers: p.layers.map((l) => (l.id === lid ? { ...l, ...patch } : l)),
  }))

export const removeLayer = (pid, lid) =>
  patchProject(pid, (p) => ({ ...p, layers: p.layers.filter((l) => l.id !== lid) }))

// Layers are stored back to front. dir = +1 brings forward, -1 sends back.
export const moveLayer = (pid, lid, dir) =>
  patchProject(pid, (p) => {
    const i = p.layers.findIndex((l) => l.id === lid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= p.layers.length) return p
    const layers = [...p.layers]
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
    return { ...p, layers }
  })

export function duplicateLayer(pid, lid) {
  const copy = { id: uid() }
  patchProject(pid, (p) => {
    const src = p.layers.find((l) => l.id === lid)
    if (!src) return p
    return { ...p, layers: [...p.layers, { ...src, ...copy, locked: false, x: src.x + 60, y: src.y + 60 }] }
  })
  return copy.id
}

// ---------- albums: named pools of photos ----------

export const useAlbum = (id) => useStore((s) => s.albums.find((a) => a.id === id))

function patchAlbum(id, fn) {
  setState((s) => ({ ...s, albums: s.albums.map((a) => (a.id === id ? { ...fn(a), updatedAt: Date.now() } : a)) }))
}

export function createAlbum(name) {
  const album = { id: uid(), name: name?.trim() || 'Untitled album', imageIds: [], createdAt: Date.now(), updatedAt: Date.now() }
  setState((s) => ({ ...s, albums: [album, ...s.albums] }))
  return album
}

export const renameAlbum = (id, name) => patchAlbum(id, (a) => ({ ...a, name }))

export function deleteAlbum(id) {
  entomb('album', id)
  setState((s) => ({ ...s, albums: s.albums.filter((a) => a.id !== id) }))
}

// Newest photos first.
export const addToAlbum = (id, imageIds) =>
  patchAlbum(id, (a) => ({ ...a, imageIds: [...imageIds.filter((i) => !a.imageIds.includes(i)), ...a.imageIds] }))

export const removeFromAlbum = (id, imageIds) =>
  patchAlbum(id, (a) => ({ ...a, imageIds: a.imageIds.filter((i) => !imageIds.includes(i)) }))

// Add projects, albums and templates from a backup that are not already here.
export function mergeBackup({ projects = [], albums = [], presets = [] }) {
  const newProjects = projects.filter((p) => !state.projects.some((x) => x.id === p.id))
  const newAlbums = albums.filter((a) => !state.albums.some((x) => x.id === a.id))
  const newPresets = presets.filter((t) => !state.presets.some((x) => x.id === t.id))
  setState((s) => ({
    ...s,
    presets: [...s.presets, ...newPresets].sort((a, b) => b.createdAt - a.createdAt),
    projects: [...s.projects, ...newProjects].sort((a, b) => b.updatedAt - a.updatedAt),
    albums: [...s.albums, ...newAlbums].sort((a, b) => b.createdAt - a.createdAt),
  }))
  return { projects: newProjects.length, albums: newAlbums.length }
}

// ---------- saved templates ----------
// A template is a project's look without its photos: frames, shape,
// background, layout with its spacing and any resized spots, and text layers.
export function savePreset(projectId, name) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return null
  const preset = {
    id: uid(),
    name: name?.trim() || p.name,
    createdAt: Date.now(),
    frames: p.frames,
    frameH: frameH(p),
    background: p.background,
    layout: p.layout,
    cells: (p.cells ?? []).map((c) => ({ ...c, imageId: null, ox: 0, oy: 0, zoom: 1 })),
    layers: p.layers.filter((l) => l.type !== 'photo'), // keep text and shapes
  }
  setState((s) => ({ ...s, presets: [preset, ...s.presets] }))
  return preset
}

export function deletePreset(id) {
  entomb('preset', id)
  setState((s) => ({ ...s, presets: s.presets.filter((t) => t.id !== id) }))
}

// Put photos into a project's empty spots, left to right. Returns the ids
// that did not fit.
export function fillEmptySpots(projectId, imageIds) {
  const rest = [...imageIds]
  patchProject(projectId, (p) => {
    if (!rest.length || !(p.cells ?? []).some((c) => !c.imageId)) return p
    return {
      ...p,
      cells: p.cells.map((c) => (c.imageId || !rest.length ? c : { ...c, imageId: rest.shift(), ox: 0, oy: 0, zoom: 1 })),
    }
  })
  return rest
}

// ---------- where photos picked from the phone are also filed ----------
export function setImportAlbum(value) {
  localStorage.setItem(IMPORT_ALBUM, value)
  setState((s) => ({ ...s, importAlbum: value }))
}

// File freshly imported photos into the chosen album, creating "Imported"
// the first time when the setting is automatic.
export function fileImports(imageIds) {
  if (!imageIds.length || state.importAlbum === 'off') return
  let album = state.albums.find((a) => a.id === state.importAlbum)
  if (!album) album = state.albums.find((a) => a.name === 'Imported') ?? createAlbum('Imported')
  addToAlbum(album.id, imageIds)
}
