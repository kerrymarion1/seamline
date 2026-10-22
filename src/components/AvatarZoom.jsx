import { useEffect, useState } from 'react'
import Icon from './Icon'

// A profile photo, big (Kerry: "clicking on profile picture anywhere should
// enlarge it"). Any Avatar with a photo opens it through zoomAvatar(); one of
// these, mounted in App, shows it over everything. A tap anywhere, or Escape,
// puts it away.
const EVENT = 'hugpix:avatar'

export const zoomAvatar = (person) =>
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { src: person.avatar, name: (person.name ?? '').trim() } }))

export default function AvatarZoom() {
  const [shown, setShown] = useState(null) // { src, name }
  useEffect(() => {
    const open = (e) => setShown(e.detail)
    window.addEventListener(EVENT, open)
    return () => window.removeEventListener(EVENT, open)
  }, [])
  useEffect(() => {
    if (!shown) return
    const onKey = (e) => e.key === 'Escape' && setShown(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shown])
  if (!shown) return null
  return (
    <div
      className="avatar-zoom" role="dialog" aria-modal="true"
      aria-label={shown.name ? `${shown.name}'s profile photo` : 'Profile photo'}
      onClick={() => setShown(null)}
    >
      <button className="icon-btn avatar-zoom-close" aria-label="Close"><Icon name="close" /></button>
      <img src={shown.src} alt="" draggable={false} />
      {shown.name && <p>{shown.name}</p>}
    </div>
  )
}
