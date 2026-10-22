import { useSyncExternalStore } from 'react'
import { getCloud, supabase } from './cloud'

// Who has Hugpix open right now. Everyone signed in says so on one shared
// channel (Supabase Realtime presence) while the app is in view, and hears
// who else is. A phone put away stops saying so at once; one that simply
// loses its connection drops off by itself within a minute or so.

let here = [] // user ids, mine among them; a new list only when it changes
const listeners = new Set()
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const setHere = (ids) => {
  const next = [...ids].sort()
  if (next.join() === here.join()) return
  here = next
  listeners.forEach((l) => l())
}

export const useHere = () => useSyncExternalStore(subscribe, () => here)

// Start saying I'm here and listening for who else is; returns a stop. Once
// per sign-in, from components/Presence.jsx.
export function startPresence() {
  const { session, features } = getCloud()
  const me = session?.user.id
  if (!supabase || !me || !features.live) return () => {}
  const channel = supabase.channel('here', { config: { presence: { key: me } } })
  const say = () => channel.track({ at: Date.now() }).catch(() => {})
  const hush = () => channel.untrack().catch(() => {})
  const onVisible = () => (document.hidden ? hush() : say())
  channel
    .on('presence', { event: 'sync' }, () => setHere(Object.keys(channel.presenceState())))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !document.hidden) say()
    })
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    supabase.removeChannel(channel)
    setHere([])
  }
}
