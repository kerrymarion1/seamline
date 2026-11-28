import { useSyncExternalStore } from 'react'
import { getCloud, supabase } from './cloud'

// Family days (Hugpix 2): birthdays, anniversaries and other days the family
// keeps, in seamline_family_days (see 20261123_hugpix2.sql). Anyone in
// Hugpix adds one; whoever added it, or the admin, changes or removes it.
// Read once Hugpix has signed in, and again when the holidays page opens.
// Each is { id, kind, name, month, day, year, person, created_by }.

let days = []
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useFamilyDays = () => useSyncExternalStore(subscribe, () => days)
export const familyDaysNow = () => days

const on = () => !!supabase && !!getCloud().session && !!getCloud().canSync && !!getCloud().features.familyDays
export const familyDaysReady = () => on()

export async function refreshFamilyDays() {
  if (!on()) return
  const { data, error } = await supabase.from('seamline_family_days').select('id, kind, name, month, day, year, person, created_by').order('month').order('day')
  if (error) throw new Error(error.message)
  days = data ?? []
  emit()
}

const clean = (d) => ({
  kind: d.kind, name: d.name.trim().slice(0, 60), month: d.month, day: d.day, year: d.year || null, person: d.person || null,
})

export async function addFamilyDay(d) {
  const { error } = await supabase.from('seamline_family_days').insert({ library: getCloud().library, ...clean(d) })
  if (error) throw new Error(error.message)
  await refreshFamilyDays()
}

export async function updateFamilyDay(id, d) {
  const { error } = await supabase.from('seamline_family_days').update(clean(d)).eq('id', id)
  if (error) throw new Error(error.message)
  await refreshFamilyDays()
}

export async function removeFamilyDay(id) {
  const { error } = await supabase.from('seamline_family_days').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await refreshFamilyDays()
}

// Whoever added it, or the admin.
export const mayChange = (d) => getCloud().admin || d.created_by === getCloud().session?.user.id
