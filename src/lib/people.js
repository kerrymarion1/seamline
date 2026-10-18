import { useEffect, useSyncExternalStore } from 'react'
import { fetchLibraryPeople } from './cloud'

// Everyone in the library, { id, name, role, avatar }, shared by every screen
// that shows people: chats, comments, pickers. Read again at most once a
// minute, or at once after a change (a new profile photo, say).

let people = []
let loadedAt = 0
let loading = null
const listeners = new Set()
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function refreshPeople(force = false) {
  if (loading) return loading
  if (!force && Date.now() - loadedAt < 60000) return Promise.resolve(people)
  loading = fetchLibraryPeople()
    .then((list) => {
      people = list
      loadedAt = Date.now()
      listeners.forEach((l) => l())
      return people
    })
    .catch(() => people)
    .finally(() => {
      loading = null
    })
  return loading
}

export function usePeople() {
  useEffect(() => {
    refreshPeople()
  }, [])
  return useSyncExternalStore(subscribe, () => people)
}

export const personIn = (list, id) => list.find((p) => p.id === id) ?? null
