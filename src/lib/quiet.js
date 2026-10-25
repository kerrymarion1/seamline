import { useSyncExternalStore } from 'react'
import { getCloud, supabase } from './cloud'

// Pausing notifications, the way Plait does it: until a time, or off until
// turned back on, for this person on every device (seamline_quiet: no row is
// on, a time, or 'infinity'). The functions that send notifications skip
// anyone paused; the app still shows everything in What's new.

let until = null // as the database has it, or null for on
const listeners = new Set()
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const emit = () => listeners.forEach((l) => l())

export const useQuiet = () => useSyncExternalStore(subscribe, () => until)

export async function refreshQuiet() {
  const { session, features } = getCloud()
  if (!supabase || !session || !features.quiet) return
  const { data } = await supabase.from('seamline_quiet').select('until').eq('user_id', session.user.id).maybeSingle()
  until = data?.until ?? null
  emit()
}

// Pause until `when` (an ISO time, or 'infinity' for off), or null for on.
export async function setQuiet(when) {
  const { session, library } = getCloud()
  const { error } = when
    ? await supabase.from('seamline_quiet').upsert({ user_id: session.user.id, library, until: when, updated_at: new Date().toISOString() })
    : await supabase.from('seamline_quiet').delete().eq('user_id', session.user.id)
  if (error) throw new Error(error.message)
  until = when
  emit()
}

// Tomorrow at eight in the morning, this device's time.
function tomorrowMorning() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return d
}

export const PAUSES = [
  { label: '1 hour', until: () => new Date(Date.now() + 3600e3).toISOString() },
  { label: '8 hours', until: () => new Date(Date.now() + 8 * 3600e3).toISOString() },
  { label: 'Tomorrow', until: () => tomorrowMorning().toISOString() },
  { label: '1 week', until: () => new Date(Date.now() + 7 * 864e5).toISOString() },
  { label: 'Turn off', until: () => 'infinity' },
]

// When a pause would end, for under its button: "until 4:49 PM", "until Sat, Oct 31".
export function endsAt(when, now = Date.now()) {
  if (when === 'infinity') return 'until turned on'
  const d = new Date(when)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined })
  const days = Math.round((new Date(when).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5)
  // Today, or tomorrow (the label already says so): the time is enough.
  if (days <= 1) return `until ${time}`
  // Short, so all five fit one line on a phone.
  return `until ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// "Paused until 3:40 PM", "Paused until Sun, Oct 25 at 8:00 AM" or
// "Notifications are off"; null when they are on.
export function pausedLine(when, now = Date.now()) {
  if (!when) return null
  if (when === 'infinity') return 'Notifications are off'
  const t = Date.parse(when)
  if (!(t > now)) return null
  const d = new Date(t)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date(now).toDateString()) return `Paused until ${time}`
  return `Paused until ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}
