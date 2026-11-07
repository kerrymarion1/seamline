import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// Framing a profile photo, the way most apps do it: a circle stays still in
// the middle, and the photo moves behind it. Drag to move it; pinch, the
// slider or the mouse wheel to zoom in on a face; Turn for a quarter turn.
// `image` is { previewUrl, width, height } (the picture's own size).
// `onSave` gets { turns, crop }, the square inside the circle as fractions of
// the turned picture (see renderEdit in lib/edit.js).

const MOST = 6 // zoom: up to six times the smallest that fills the circle

export default function AvatarFramer({ image, busy, error, onCancel, onSave }) {
  const stage = useRef(null)
  const [room, setRoom] = useState({ w: 0, h: 0 })
  const [turns, setTurns] = useState(0)
  const [zoom, setZoom] = useState(1) // times the smallest that fills the circle
  const [at, setAt] = useState({ x: 0, y: 0 }) // the photo's middle, from the circle's
  const pointers = useRef(new Map())
  const pinch = useRef(null)

  useEffect(() => {
    const el = stage.current
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const sideways = turns % 2 === 1
  const tw = sideways ? image.height : image.width // the turned picture's size
  const th = sideways ? image.width : image.height
  const D = Math.max(0, Math.min(room.w - 40, room.h - 40, 360)) // the circle
  const fill = D / Math.min(tw, th) // screen pixels per picture pixel at zoom 1
  const k = fill * zoom

  // Keep the circle inside the photo, however it is moved or zoomed.
  const keep = (p, z = zoom) => {
    const kk = fill * z
    const mx = Math.max(0, (tw * kk - D) / 2)
    const my = Math.max(0, (th * kk - D) / 2)
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) }
  }
  const zoomTo = (z) => {
    const next = Math.min(MOST, Math.max(1, z))
    // Zoom about the circle's middle: what is there stays there.
    setAt((p) => keep({ x: (p.x * next) / zoom, y: (p.y * next) / zoom }, next))
    setZoom(next)
  }

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { gap: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }
  const move = (e) => {
    const was = pointers.current.get(e.pointerId)
    if (!was) return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      zoomTo((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.gap)
      return
    }
    setAt((p) => keep({ x: p.x + now.x - was.x, y: p.y + now.y - was.y }))
  }
  const up = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }
  const wheel = (e) => zoomTo(zoom * Math.exp(-e.deltaY * 0.0015))

  const turn = () => {
    setTurns((t) => (t + 1) % 4)
    setZoom(1)
    setAt({ x: 0, y: 0 })
  }
  const save = () => {
    const w = D / (k * tw)
    const h = D / (k * th)
    onSave({ turns, crop: { x: 0.5 - (D / 2 + at.x) / (k * tw), y: 0.5 - (D / 2 + at.y) / (k * th), w, h } })
  }

  return (
    <div className="crop-screen" role="dialog" aria-label="Your profile photo">
      <header className="topbar">
        <button className="icon-btn" onClick={onCancel} disabled={busy} aria-label="Cancel"><Icon name="close" /></button>
        <div className="preview-title">Your profile photo</div>
        <button className="pill-btn crop-save" onClick={save} disabled={busy || !D}>
          {busy ? <i className="spinner inline" /> : 'Use'}
        </button>
      </header>
      <div className="framer-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        {D > 0 && (
          <>
            <img
              src={image.previewUrl}
              alt=""
              draggable={false}
              style={{
                width: image.width * k,
                height: image.height * k,
                transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px) rotate(${turns * 90}deg)`,
              }}
            />
            <div className="framer-circle" style={{ width: D, height: D }} />
          </>
        )}
      </div>
      {error && <p className="preview-error" role="alert">{error}</p>}
      <footer className="framer-tools">
        <Icon name="photo" size={16} />
        <input
          type="range"
          min={1}
          max={MOST}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          aria-label="Zoom"
          disabled={busy}
        />
        <Icon name="photo" size={24} />
        <button className="chip small" onClick={turn} disabled={busy}><Icon name="rotate" size={16} /> Turn</button>
      </footer>
      <p className="framer-hint">Drag to move · pinch or slide to zoom</p>
    </div>
  )
}
