// Thin promise wrapper over IndexedDB. Four stores, each keyed by `id`:
// projects, albums, presets (saved templates) and images (rows carry the photo blobs).
const NAME = 'seamline'
const STORES = ['projects', 'albums', 'presets', 'images']

let opening
function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 2)
    req.onupgradeneeded = () => {
      // Runs for new installs and for upgrades; only add what is missing.
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

export async function loadAll() {
  const db = await open()
  const tx = db.transaction(STORES)
  const all = (store) =>
    new Promise((resolve, reject) => {
      const req = tx.objectStore(store).getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  const [projects, albums, presets, images] = await Promise.all(STORES.map(all))
  return { projects, albums, presets, images }
}

// ops: [{ store, put: row } | { store, del: id }], applied in one transaction.
export async function commit(ops) {
  if (!ops.length) return
  const db = await open()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite')
    for (const op of ops) {
      const store = tx.objectStore(op.store)
      if (op.put) store.put(op.put)
      else store.delete(op.del)
    }
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Save was aborted'))
  })
}
