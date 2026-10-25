import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// Framing an album's cover for the front page: a window the shape of its big
// picture stays still in the middle, and the photo moves behind it. Drag to
// bring the right part into view; pinch, the slider or the mouse wheel to
// zoom in, never out past filling the window. `image` is
// { previewUrl, width, height }. `at` and `onSave(at)` are the framing,
// [x, y, zoom]: the point of the photo (percentages) that sits at the same
// point of whatever frame it fills, and how far in it is zoomed about that
// point (CSS object-position and scale, see focusStyleOf in HomeLayouts), so
// the album's tile and a wider cover keep it in view too.

const MOST = 4 // zoom: up to four times the size that just fills the window

// The front page's big picture on this device (see .mo-hero in styles.css).
function heroRatio() {
  const w = window.innerWidth
  return Math.min(2.2, Math.max(0.6, (w - 12) / (w >= 700 ? 460 : 400)))
}
const clamp = (v) => Math.min(100, Math.max(0, v))

export default function CoverFramer({ image, at: start, onCancel, onSave }) {
  const stage = useRef(null)
  const [room, setRoom] = useState({ w: 0, h: 0 })
  const [at, setAt] = useState({ x: start?.[0] ?? 50, y: start?.[1] ?? 50, z: Math.min(MOST, Math.max(1, start?.[2] ?? 1)) })
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

  // The window, as big as the stage allows; the photo scaled to fill it, times the zoom.
  const ratio = heroRatio()
  let W = Math.max(0, Math.min(room.w - 32, 520))
  let H = W / ratio
  if (H > room.h - 32) {
    H = Math.max(0, room.h - 32)
    W = H * ratio
  }
  const k = W && H ? Math.max(W / image.width, H / image.height) : 0
  const size = (z) => ({ dw: image.width * k * z, dh: image.height * k * z })
  const { dw, dh } = size(at.z)
  // How far the photo can move each way, and where it is for this framing.
  const sx = dw - W
  const sy = dh - H
  const ox = (0.5 - at.x / 100) * sx
  const oy = (0.5 - at.y / 100) * sy

  // Zoom about the middle of the window: what is there stays there.
  const zoomTo = (z) =>
    setAt((p) => {
      const next = Math.min(MOST, Math.max(1, z))
      const was = size(p.z)
      const will = size(next)
      const cx = ((p.x / 100) * (was.dw - W) + W / 2) / was.dw // the photo's point under the middle
      const cy = ((p.y / 100) * (was.dh - H) + H / 2) / was.dh
      const nx = will.dw - W
      const ny = will.dh - H
      return {
        x: nx > 0 ? clamp(((cx * will.dw - W / 2) / nx) * 100) : 50,
        y: ny > 0 ? clamp(((cy * will.dh - H / 2) / ny) * 100) : 50,
        z: next,
      }
    })

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { gap: Math.hypot(a.x - b.x, a.y - b.y), z: at.z }
    }
  }
  const move = (e) => {
    const was = pointers.current.get(e.pointerId)
    if (!was) return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      zoomTo((pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.gap)
      return
    }
    const dx = now.x - was.x
    const dy = now.y - was.y
    setAt((p) => ({
      ...p,
      x: sx > 0 ? clamp(p.x - (dx / sx) * 100) : p.x,
      y: sy > 0 ? clamp(p.y - (dy / sy) * 100) : p.y,
    }))
  }
  const up = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }
  const wheel = (e) => zoomTo(at.z * Math.exp(-e.deltaY * 0.0015))

  return (
    <div className="crop-screen" role="dialog" aria-label="Frame the cover">
      <header className="topbar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><Icon name="close" /></button>
        <div className="preview-title">Frame the cover</div>
        <button
          className="pill-btn crop-save"
          onClick={() => onSave([Math.round(at.x), Math.round(at.y), Math.round(at.z * 100) / 100])}
          disabled={!W}
        >
          Use
        </button>
      </header>
      <div className="framer-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        {W > 0 && (
          <>
            <img
              src={image.previewUrl}
              alt=""
              draggable={false}
              style={{ width: dw, height: dh, transform: `translate(-50%, -50%) translate(${ox}px, ${oy}px)` }}
            />
            <div className="framer-window" style={{ width: W, height: H }} />
          </>
        )}
      </div>
      <footer className="framer-tools">
        <Icon name="photo" size={16} />
        <input type="range" min={1} max={MOST} step={0.01} value={at.z} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="Zoom" />
        <Icon name="photo" size={24} />
      </footer>
      <p className="framer-hint">Pinch or slide to zoom, and drag the photo until the right part is in the window. The front page and the album's tile show it this way.</p>
    </div>
  )
}
