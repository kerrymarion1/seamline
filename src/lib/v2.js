import { useSyncExternalStore } from 'react'
import { getCloud, useCloud } from './cloud'

// Hugpix 2: the holidays (the holiday album and countdown on the front page,
// cards, the recap story, Advent, the holidays page and family days). It
// stays hidden until the admin turns it on for everyone in Settings (the
// library's "v2" setting); before that the admin can turn it on for their own
// phone alone, to try it. Everything it adds checks `useV2()`.

const KEY = 'hugpix:v2'
const read = () => {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}
let mine = read()
const listeners = new Set()
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// On for this phone alone.
export const useV2Mine = () => useSyncExternalStore(subscribe, () => mine)
export function setV2Mine(on) {
  mine = on
  try {
    if (on) localStorage.setItem(KEY, 'on')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: on until the app is closed.
  }
  listeners.forEach((l) => l())
}

// On for everyone (the admin's switch).
export const v2Everyone = () => !!getCloud().settings?.v2
export const useV2Everyone = () => !!useCloud().settings?.v2

// Showing on this phone, outside React.
export const v2On = () => mine || v2Everyone()

// Showing on this phone.
export const useV2 = () => {
  const everyone = useV2Everyone()
  return useV2Mine() || everyone
}
