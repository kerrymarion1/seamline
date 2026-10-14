import { useSyncExternalStore } from 'react'

// The app's accent colour: buttons, the logo's dot and seam, highlights and
// the glow behind the front page. Chosen in Settings and kept on the device.
// Each entry gives the colour, a lighter partner for gradients, and the dark
// text colour that reads well on top of it.
const KEY = 'seamline:colour'

export const COLOURS = [
  { id: 'ember', name: 'Ember', accent: '#ff8a4c', light: '#ffb785', on: '#1d0f06' },
  { id: 'rose', name: 'Rose', accent: '#ff6b8b', light: '#ffa3b8', on: '#24070f' },
  { id: 'violet', name: 'Violet', accent: '#a78bfa', light: '#cbbcff', on: '#150c33' },
  { id: 'ocean', name: 'Ocean', accent: '#5aa9ff', light: '#9ccbff', on: '#06182e' },
  { id: 'mint', name: 'Mint', accent: '#4fd1a5', light: '#93e6c9', on: '#052018' },
  { id: 'gold', name: 'Gold', accent: '#f5c451', light: '#fadb8e', on: '#241a03' },
  { id: 'pearl', name: 'Pearl', accent: '#e9e6df', light: '#ffffff', on: '#17171a' },
]

// "#ff8a4c" -> "255 138 76", the form the stylesheet uses for see-through tints.
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

let colour = localStorage.getItem(KEY) ?? 'ember'
const listeners = new Set()

function apply() {
  const c = COLOURS.find((x) => x.id === colour) ?? COLOURS[0]
  const root = document.documentElement.style
  root.setProperty('--accent', c.accent)
  root.setProperty('--accent-rgb', channels(c.accent))
  root.setProperty('--accent-2', c.light)
  root.setProperty('--on-accent', c.on)
}
apply()

export function setColour(id) {
  colour = id
  localStorage.setItem(KEY, id)
  apply()
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useColour = () => useSyncExternalStore(subscribe, () => colour)
