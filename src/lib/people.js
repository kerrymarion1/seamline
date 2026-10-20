import { useEffect, useSyncExternalStore } from 'react'
import { fetchLibraryPeople, getCloud, useCloud } from './cloud'

// Everyone in the library, { id, name, role, avatar }, shared by every screen
// that shows people: chats, comments, pickers. Read again at most once a
// minute, or at once after a change (a new profile photo, say).

let people = []
let loadedAt = 0
let loadedFor = null // whose library the list is
let loading = null
const listeners = new Set()
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function refreshPeople(force = false) {
  if (loading) return loading
  const me = getCloud().session?.user.id ?? null
  if (!force && loadedFor === me && Date.now() - loadedAt < 60000) return Promise.resolve(people)
  loading = fetchLibraryPeople()
    .then((list) => {
      // Not askable yet: stay unread, so the next look tries again.
      if (!list) return people
      people = list
      loadedAt = Date.now()
      loadedFor = me
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
  // Again once signed in and the library is known: a look before then finds no one.
  const { session, features } = useCloud()
  const me = session?.user.id
  useEffect(() => {
    refreshPeople()
  }, [me, features.messages])
  return useSyncExternalStore(subscribe, () => people)
}

export const personIn = (list, id) => list.find((p) => p.id === id) ?? null

// Who added a photo (an album's `addedBy` entry: { id, name } or just a
// name), as a person to show with their picture.
export function adderOf(list, by) {
  if (!by) return null
  if (typeof by === 'string') return list.find((p) => p.name === by) ?? { name: by }
  return personIn(list, by.id) ?? { id: by.id, name: by.name }
}
