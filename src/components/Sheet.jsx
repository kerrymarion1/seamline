import { useEffect, useRef, useState } from 'react'

// Slide-up bottom sheet. Non-modal by default so the canvas stays live above
// it; pass `modal` for a dimmed backdrop. Drag the header down to dismiss.
export default function Sheet({ open, onClose, title, modal = false, onHeight, children }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const [dy, setDy] = useState(0)

  useEffect(() => {
    if (!onHeight || !ref.current) return
    const ro = new ResizeObserver(() => onHeight(ref.current.offsetHeight))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [onHeight])

  const onPointerDown = (e) => {
    drag.current = { y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    if (dy > 70) onClose()
    setDy(0)
  }

  return (
    <>
      {modal && <div className={`backdrop ${open ? 'open' : ''}`} onClick={onClose} />}
      <section
        ref={ref}
        className={`sheet ${open ? 'open' : ''} ${dy ? 'dragging' : ''}`}
        style={dy ? { transform: `translateY(${dy}px)` } : undefined}
        inert={!open}
        aria-label={title}
      >
        <header
          className="sheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="grabber" />
          <div className="sheet-title-row">
            <h2>{title}</h2>
            <button className="pill-btn" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
              {modal ? 'Cancel' : 'Done'}
            </button>
          </div>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </>
  )
}
