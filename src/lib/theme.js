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

// Seasonal dress for the whole app, chosen at the top of Settings. 'auto'
// follows the calendar: each season with a `month` (0 = January) is on for
// that whole month. While a season is on it brings its own colours (in place
// of the accent above), backgrounds and decorations (styles.css, under
// [data-season]) and greeting. A non-breaking space keeps the words of a
// greeting's last part together where the front page sets it in italics.
const SEASON_KEY = 'seamline:season'

export const SEASONS = [
  { id: 'auto', name: 'Auto' },
  { id: 'everyday', name: 'Everyday' },
  {
    id: 'newyear', name: 'New Year', month: 0, greeting: 'Happy New Year',
    accent: '#f5c451', light: '#fff1c1', on: '#241a03',
  },
  {
    id: 'july4', name: 'Fourth of July', month: 6, greeting: 'Happy Fourth of July',
    accent: '#ff4d5e', light: '#8fb0ff', on: '#22060a',
  },
  {
    id: 'halloween', name: 'Halloween', month: 9, greeting: 'Happy Halloween',
    accent: '#ff7518', light: '#ffb347', on: '#1a0b02',
  },
  {
    id: 'thanksgiving', name: 'Thanksgiving', month: 10, greeting: 'Happy Thanksgiving',
    accent: '#e07a2e', light: '#f2b45a', on: '#1a0d04',
  },
  {
    id: 'christmas', name: 'Christmas', month: 11, greeting: 'Merry Christmas',
    accent: '#d7263d', light: '#e8c372', on: '#fff7ef',
  },
]

let season = localStorage.getItem(SEASON_KEY) ?? 'auto'
if (!SEASONS.some((s) => s.id === season)) season = 'auto'

// The season showing now, or null for everyday.
export function activeSeason(date = new Date()) {
  const id = season === 'auto' ? SEASONS.find((s) => s.month === date.getMonth())?.id : season
  return SEASONS.find((s) => s.id === id && s.accent) ?? null
}

function apply() {
  const c = activeSeason() ?? COLOURS.find((x) => x.id === colour) ?? COLOURS[0]
  const root = document.documentElement
  root.style.setProperty('--accent', c.accent)
  root.style.setProperty('--accent-rgb', channels(c.accent))
  root.style.setProperty('--accent-2', c.light)
  root.style.setProperty('--on-accent', c.on)
  const on = activeSeason()
  if (on) root.dataset.season = on.id
  else delete root.dataset.season
}
apply()

export function setSeason(id) {
  season = id
  localStorage.setItem(SEASON_KEY, id)
  apply()
  listeners.forEach((l) => l())
}

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
// The season as chosen ('auto' included), and the one showing now (or null).
export const useSeason = () => useSyncExternalStore(subscribe, () => season)
export const useActiveSeason = () => useSyncExternalStore(subscribe, () => activeSeason()?.id ?? null)
// How the front page lays out the albums, also chosen in Settings and kept on
// the device. The first is the default.
const LAYOUT_KEY = 'seamline:frontPage'
// Choices made before Mosaic became the default are dropped, so every device
// starts on Mosaic once.
localStorage.removeItem('seamline:homeLayout')

export const LAYOUTS = [
  { id: 'mosaic', name: 'Mosaic', note: 'Albums as photo tiles, edge to edge' },
  { id: 'editorial', name: 'Editorial', note: 'Big type and a numbered list of albums' },
  { id: 'stack', name: 'Stack', note: 'The latest album as a fan of prints' },
  { id: 'classic', name: 'Classic', note: 'Framed album cards in a grid' },
]

let layout = localStorage.getItem(LAYOUT_KEY)
if (!LAYOUTS.some((l) => l.id === layout)) layout = LAYOUTS[0].id

export function setLayout(id) {
  layout = id
  localStorage.setItem(LAYOUT_KEY, id)
  listeners.forEach((l) => l())
}

export const useLayout = () => useSyncExternalStore(subscribe, () => layout)
