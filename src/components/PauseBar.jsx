import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useCloud } from '../lib/cloud'
import { endsAt, PAUSES, pausedLine, refreshQuiet, setQuiet, useQuiet } from '../lib/quiet'

// One slim line: notifications on, with Pause; or paused until a time (or
// off), with Turn back on. Pause opens five choices, each saying when it
// would end, sliding in one after another. For this person on every device
// (lib/quiet.js). Nothing until the database has it.
export default function PauseBar() {
  const { session, features } = useCloud()
  const until = useQuiet()
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState(null)
  const on = !!session && !!features.quiet
  useEffect(() => {
    if (on) refreshQuiet()
  }, [on])
  if (!on) return null

  const line = pausedLine(until)
  const choose = (when) => {
    setChoosing(false)
    setError(null)
    setQuiet(when).catch((e) => setError(e.message))
  }
  return (
    <div className={`quiet-bar ${line ? 'paused' : ''}`}>
      <div className="quiet-row">
        <Icon name="bell" size={16} />
        <span className="quiet-text" role="status">{line ?? 'Notifications are on'}</span>
        {line ? (
          <button className="pill-btn" onClick={() => choose(null)}>Turn back on</button>
        ) : (
          <button className="pill-btn" aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>Pause</button>
        )}
      </div>
      {choosing && !line && (
        <div className="quiet-choices" role="group" aria-label="Pause notifications for">
          {PAUSES.map((p, i) => (
            <button key={p.label} className="quiet-choice" style={{ animationDelay: `${i * 45}ms` }} onClick={() => choose(p.until())}>
              <span>{p.label}</span>
              <small>{endsAt(p.until())}</small>
            </button>
          ))}
        </div>
      )}
      {error && <p className="note warn">{error}</p>}
    </div>
  )
}
