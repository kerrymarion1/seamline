import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// Framing an album's cover for the front page: a window the shape of its big
// picture stays still in the middle, and the photo moves behind it. Drag to
// bring the right part into view. `image` is { previewUrl, width, height }.
// `at` and `onSave(at)` are the focus, [x, y] as percentages: the point of
// the photo that sits at the same point of whatever frame it fills (CSS
// object-position), so the album's tile and a wider cover keep it in view
// too.

// The front page's big picture on this device (see .mo-hero in styles.css).
function heroRatio() {
  const w = window.innerWidth
  return Math.min(2.2, Math.max(0.6, (w - 12) / (w >= 700 ? 460 : 400)))
}

export default function CoverFramer({ image, at: start, onCancel, onSave }) {
  const stage = useRef(null)
  const [room, setRoom] = useState({ w: 0, h: 0 })
  const [at, setAt] = useState({ x: start?.[0] ?? 50, y: start?.[1] ?? 50 })
  const drag = useRef(null)

  useEffect(() => {
    const el = stage.current
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // The window, as big as the stage allows; the photo scaled to fill it.
  const ratio = heroRatio()
  let W = Math.max(0, Math.min(room.w - 32, 520))
  let H = W / ratio
  if (H > room.h - 32) {
    H = Math.max(0, room.h - 32)
    W = H * ratio
  }
  const k = W && H ? Math.max(W / image.width, H / image.height) : 0
  const DW = image.width * k
  const DH = image.height * k
  // How far the photo can move each way, and where it is for this focus.
  const sx = DW - W
  const sy = DH - H
  const ox = (0.5 - at.x / 100) * sx
  const oy = (0.5 - at.y / 100) * sy

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const move = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    drag.current = { ...d, x: e.clientX, y: e.clientY }
    setAt((p) => ({
      x: sx > 0 ? Math.min(100, Math.max(0, p.x - (dx / sx) * 100)) : p.x,
      y: sy > 0 ? Math.min(100, Math.max(0, p.y - (dy / sy) * 100)) : p.y,
    }))
  }
  const up = () => {
    drag.current = null
  }

  return (
    <div className="crop-screen" role="dialog" aria-label="Frame the cover">
      <header className="topbar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><Icon name="close" /></button>
        <div className="preview-title">Frame the cover</div>
        <button className="pill-btn crop-save" onClick={() => onSave([Math.round(at.x), Math.round(at.y)])} disabled={!W}>Use</button>
      </header>
      <div className="framer-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {W > 0 && (
          <>
            <img
              src={image.previewUrl}
              alt=""
              draggable={false}
              style={{ width: DW, height: DH, transform: `translate(-50%, -50%) translate(${ox}px, ${oy}px)` }}
            />
            <div className="framer-window" style={{ width: W, height: H }} />
          </>
        )}
      </div>
      <p className="framer-hint">Drag the photo until the right part is in the window. The front page and the album's tile show it this way.</p>
    </div>
  )
}
