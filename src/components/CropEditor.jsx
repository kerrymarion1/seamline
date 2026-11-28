import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// Turning and cropping one photo, over the whole screen. The frame's corners
// resize it and dragging inside moves it; Turn rotates a quarter turn
// clockwise (and starts the frame over). `onSave` gets { turns, crop }, the
// crop as fractions of the turned photo (see lib/edit.js).

const FULL = { x: 0, y: 0, w: 1, h: 1 }
const MIN = 0.08 // the smallest frame, as a share of each side

export default function CropEditor({ image, busy, error, onCancel, onSave }) {
  const stage = useRef(null)
  const [room, setRoom] = useState({ w: 0, h: 0 })
  const [turns, setTurns] = useState(0)
  const [crop, setCrop] = useState(FULL)
  const [square, setSquare] = useState(false)
  const drag = useRef(null)

  useEffect(() => {
    const el = stage.current
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // The turned photo, fitted into the room there is.
  const sideways = turns % 2 === 1
  const ratio = sideways ? image.height / image.width : image.width / image.height
  const k = Math.min((room.w - 32) / ratio, room.h - 32)
  const bw = Math.max(0, Math.round(k * ratio))
  const bh = Math.max(0, Math.round(k))

  // A square frame as large as fits, in the middle.
  const squareFrame = () => {
    const side = Math.min(bw, bh)
    return { x: (bw - side) / 2 / bw, y: (bh - side) / 2 / bh, w: side / bw, h: side / bh }
  }

  const start = (mode) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, sx: e.clientX, sy: e.clientY, from: crop }
  }
  const move = (e) => {
    const d = drag.current
    if (!d || !bw || !bh) return
    const dx = (e.clientX - d.sx) / bw
    const dy = (e.clientY - d.sy) / bh
    const f = d.from
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
    if (d.mode === 'move') {
      setCrop({ ...f, x: clamp(f.x + dx, 0, 1 - f.w), y: clamp(f.y + dy, 0, 1 - f.h) })
      return
    }
    // A corner: the opposite corner stays put.
    let { x, y, w, h } = f
    if (d.mode.includes('w')) {
      const nx = clamp(f.x + dx, 0, f.x + f.w - MIN)
      w = f.w + (f.x - nx)
      x = nx
    }
    if (d.mode.includes('e')) w = clamp(f.w + dx, MIN, 1 - f.x)
    if (d.mode.includes('n')) {
      const ny = clamp(f.y + dy, 0, f.y + f.h - MIN)
      h = f.h + (f.y - ny)
      y = ny
    }
    if (d.mode.includes('s')) h = clamp(f.h + dy, MIN, 1 - f.y)
    if (square) {
      // Keep it square on screen: the smaller side decides, and it grows
      // away from the corner that stays put.
      const side = Math.min(w * bw, h * bh)
      const nw = side / bw
      const nh = side / bh
      if (d.mode.includes('w')) x = f.x + f.w - nw
      if (d.mode.includes('n')) y = f.y + f.h - nh
      w = nw
      h = nh
    }
    setCrop({ x, y, w, h })
  }
  const end = () => {
    drag.current = null
  }

  const turn = () => {
    setTurns((t) => (t + 1) % 4)
    setCrop(FULL)
    setSquare(false)
  }
  const toggleSquare = () => {
    if (square) {
      setSquare(false)
      setCrop(FULL)
    } else {
      setSquare(true)
      setCrop(squareFrame())
    }
  }
  const reset = () => {
    setTurns(0)
    setCrop(FULL)
    setSquare(false)
  }
  const changed = turns !== 0 || crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999

  return (
    <div className="crop-screen" role="dialog" aria-label="Crop and turn">
      <header className="topbar">
        <button className="icon-btn" onClick={onCancel} disabled={busy} aria-label="Cancel"><Icon name="close" /></button>
        <div className="preview-title">Crop and turn</div>
        <button className="pill-btn crop-save" onClick={() => onSave({ turns, crop })} disabled={busy || !changed}>
          {busy ? <i className="spinner inline" /> : 'Save'}
        </button>
      </header>
      <div className="crop-stage" ref={stage}>
        {bw > 0 && (
          <div className="crop-box" style={{ width: bw, height: bh }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            <img
              src={image.previewUrl}
              alt=""
              draggable={false}
              style={{
                width: sideways ? bh : bw,
                height: sideways ? bw : bh,
                transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
              }}
            />
            <div
              className="crop-frame"
              style={{ left: crop.x * bw, top: crop.y * bh, width: crop.w * bw, height: crop.h * bh }}
              onPointerDown={start('move')}
            >
              <i className="crop-grid" />
              {['nw', 'ne', 'sw', 'se'].map((c) => (
                <span key={c} className={`crop-handle ${c}`} onPointerDown={start(c)} />
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <p className="preview-error" role="alert">{error}</p>}
      <footer className="crop-tools">
        <button className="chip small" onClick={turn} disabled={busy}><Icon name="rotate" size={16} /> Turn</button>
        <button className={`chip small ${square ? 'on' : ''}`} onClick={toggleSquare} disabled={busy}><Icon name="crop" size={16} /> Square</button>
        <button className="chip small" onClick={reset} disabled={busy || !changed}>Reset</button>
      </footer>
    </div>
  )
}
