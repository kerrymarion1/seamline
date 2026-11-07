import { useEffect } from 'react'
import { useCloud } from '../lib/cloud'
import { startPresence } from '../lib/presence'

// Says this person has Hugpix open, for the front page's "here now", for as
// long as they are signed in (see lib/presence.js).
export default function Presence() {
  const { session, features } = useCloud()
  const me = session?.user.id
  const live = !!features.live
  useEffect(() => {
    if (me && live) return startPresence()
  }, [me, live])
  return null
}
