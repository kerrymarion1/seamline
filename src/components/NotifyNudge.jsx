import { useEffect, useState } from 'react'
import { useCloud } from '../lib/cloud'
import { pushStatus, turnOnPush } from '../lib/push'
import Icon from './Icon'

// A card that slides up on the front page, a moment after it opens, asking
// someone who hasn't yet to turn on notifications on this device. On an
// iPhone not yet added to the Home Screen it explains that step instead.
// "Not now" puts it away for a week; once they are on it never shows.
const LATER = 'seamline:notifyNudge'
const WEEK = 7 * 24 * 3600e3

export default function NotifyNudge({ raised }) {
  const cloud = useCloud()
  const [status, setStatus] = useState(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (Date.now() - Number(localStorage.getItem(LATER) ?? 0) < WEEK) return
    let live = true
    pushStatus().then((s) => live && setStatus(s)).catch(() => {})
    const t = setTimeout(() => live && setShown(true), 2500)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [cloud.canSync, cloud.features])

  if (!shown || (status !== 'off' && status !== 'install')) return null

  const later = () => {
    localStorage.setItem(LATER, String(Date.now()))
    setShown(false)
  }
  const turnOn = async () => {
    setBusy(true)
    setError(null)
    try {
      await turnOnPush()
      setShown(false)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <aside className={`nudge ${raised ? 'raised' : ''}`} role="dialog" aria-label="Turn on notifications">
      <span className="nudge-icon" aria-hidden="true"><Icon name="bell" size={20} /></span>
      <div className="nudge-text">
        <b>Turn on notifications</b>
        {status === 'install' ? (
          <p>On iPhone, first add Hugpix to your Home Screen: tap Share, then “Add to Home Screen”, and open it from there.</p>
        ) : (
          <p>Hear when someone adds photos or makes an album.</p>
        )}
        {error && <p className="nudge-error">{error}</p>}
        <div className="nudge-actions">
          {status === 'off' && (
            <button className="pill-btn on" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</button>
          )}
          <button className="pill-btn" onClick={later}>{status === 'install' ? 'Got it' : 'Not now'}</button>
        </div>
      </div>
    </aside>
  )
}
