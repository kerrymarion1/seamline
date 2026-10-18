import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import { chime } from '../lib/chime'
import { isLive, refreshChats, useChats, watchChats } from '../lib/chat'
import { useCloud } from '../lib/cloud'
import { usePeople } from '../lib/people'
import { pushStatus } from '../lib/push'
import Icon from './Icon'

// While the app is open, a new message from someone else is never missed: a
// banner drops in with who and what (a tap opens the chat), and, when this
// device doesn't have notifications on, a chime plays as well. With them on,
// the phone's own notification already makes the sound, so the app doesn't
// chime on top of it. Chats arrive the moment they change where the database
// sends live updates, and are looked at again every so often anyway. When
// the app is closed, the notification alone tells them.
export default function MessageWatcher() {
  const chats = useChats()
  const { session, features } = useCloud()
  const me = session?.user.id
  const on = !!me && !!features.messages
  const seen = useRef(null) // chat id -> last_at, as last looked at
  const people = usePeople()
  const [pushOn, setPushOn] = useState(true)
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    if (!on) return
    const check = () => pushStatus().then((s) => setPushOn(s === 'on')).catch(() => setPushOn(false))
    check()
    refreshChats().catch(() => {})
    const stop = watchChats()
    const look = () => {
      if (document.hidden) return
      refreshChats().catch(() => {})
      check()
    }
    const t = setInterval(look, isLive() ? 60000 : 12000)
    document.addEventListener('visibilitychange', look)
    return () => {
      stop()
      clearInterval(t)
      document.removeEventListener('visibilitychange', look)
    }
  }, [on])

  // Compare with the last look: what has moved on, from someone else, in a
  // chat I'm in. The first look only sets the starting point.
  useEffect(() => {
    if (!on) return
    const before = seen.current
    seen.current = new Map(chats.map((c) => [c.id, c.last_at]))
    if (!before) return
    const fresh = chats.filter(
      (c) => c.members.includes(me) && c.last_by && c.last_by !== me && c.last_text != null
        && before.get(c.id) !== c.last_at && (!before.has(c.id) || Date.parse(c.last_at) > Date.parse(before.get(c.id))),
    )
    if (!fresh.length || document.hidden) return
    if (!pushOn) chime()
    const chat = fresh[0]
    if (window.location.pathname !== `/messages/${chat.id}`) setBanner(chat)
    // Only `chats` moving on is news; the rest is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 6000)
    return () => clearTimeout(t)
  }, [banner])

  if (!banner) return null
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Someone'
  const group = banner.members.length > 2
  return (
    <button
      key={banner.last_at}
      className="message-banner"
      onClick={() => {
        setBanner(null)
        navigate(`/messages/${banner.id}`)
      }}
    >
      <span className="message-banner-icon" aria-hidden="true"><Icon name="comment" size={18} /></span>
      <span className="message-banner-text">
        <b>{group ? banner.title || 'Group chat' : nameOf(banner.last_by)}</b>
        <small>{group ? `${nameOf(banner.last_by).split(' ')[0]}: ` : ''}{banner.last_text}</small>
      </span>
    </button>
  )
}
