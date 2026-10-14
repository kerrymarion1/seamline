// Zooming into the photo in view in the full-size viewer: pinch with two
// fingers, double-tap (or double-click) to jump in and out, drag to move
// around once zoomed, and the mouse wheel on a computer. While a photo is
// zoomed the strip stops swiping to the next one, so dragging moves the photo.
const MAX = 5
const DOUBLE_TAP_ZOOM = 2.5
const DOUBLE_TAP_MS = 300

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const apart = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

// `strip` is the viewer's scrolling row of slides. Returns { reset, detach }.
export function attachZoom(strip) {
  let scale = 1
  let x = 0
  let y = 0
  let pinch = null // { dist, scale, x, y, mx, my } when two fingers went down
  let drag = null // { px, py, x, y } while one finger or the mouse moves a zoomed photo
  let lastTap = null // { t, px, py }
  let moved = false

  const slide = () => strip.querySelector('.current')
  const photo = () => slide()?.querySelector('img')
  // A point on the screen, measured from the middle of the viewer.
  const fromCentre = (px, py) => {
    const r = strip.getBoundingClientRect()
    return [px - r.left - r.width / 2, py - r.top - r.height / 2]
  }

  function paint(smooth = false) {
    const img = photo()
    if (!img) return
    // The photo may be moved only as far as its enlarged edges allow.
    const r = strip.getBoundingClientRect()
    x = clamp(x, (-r.width * (scale - 1)) / 2, (r.width * (scale - 1)) / 2)
    y = clamp(y, (-r.height * (scale - 1)) / 2, (r.height * (scale - 1)) / 2)
    img.style.transition = smooth ? 'transform 0.25s cubic-bezier(0.2, 0.9, 0.25, 1)' : 'none'
    img.style.transform = scale === 1 ? '' : `translate(${x}px, ${y}px) scale(${scale})`
    const zoomed = scale > 1
    strip.classList.toggle('zoomed', zoomed)
    slide().classList.toggle('zoomed', zoomed)
  }

  // Zoom to `next`, keeping the point (px, py) of the screen where it is.
  function zoomAt(next, px, py, smooth) {
    const [cx, cy] = fromCentre(px, py)
    const k = next / scale
    x = cx - (cx - x) * k
    y = cy - (cy - y) * k
    scale = next
    if (scale === 1) x = y = 0
    paint(smooth)
  }

  function reset(smooth = false) {
    // Clear the photo that was zoomed even if another has since become current.
    for (const el of strip.querySelectorAll('.zoomed')) el.classList.remove('zoomed')
    for (const img of strip.querySelectorAll('img')) img.style.transform = ''
    scale = 1
    x = y = 0
    pinch = drag = null
    paint(smooth)
  }

  const toggle = (px, py) => (scale > 1 ? zoomAt(1, px, py, true) : zoomAt(DOUBLE_TAP_ZOOM, px, py, true))

  // ----- fingers -----
  function onTouchStart(e) {
    if (!photo()) return
    moved = false
    if (e.touches.length === 2) {
      const [a, b] = e.touches
      pinch = { dist: apart(a, b), scale, x, y, mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 }
      drag = null
      e.preventDefault()
    } else if (e.touches.length === 1 && scale > 1) {
      drag = { px: e.touches[0].clientX, py: e.touches[0].clientY, x, y }
    }
  }

  function onTouchMove(e) {
    if (pinch && e.touches.length === 2) {
      const [a, b] = e.touches
      const next = clamp((pinch.scale * apart(a, b)) / pinch.dist, 1, MAX)
      const [sx, sy] = fromCentre(pinch.mx, pinch.my)
      const [nx, ny] = fromCentre((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
      const k = next / pinch.scale
      x = nx - (sx - pinch.x) * k
      y = ny - (sy - pinch.y) * k
      scale = next
      moved = true
      paint()
      e.preventDefault()
    } else if (drag && e.touches.length === 1) {
      x = drag.x + e.touches[0].clientX - drag.px
      y = drag.y + e.touches[0].clientY - drag.py
      moved = true
      paint()
      e.preventDefault()
    } else if (e.touches.length === 1) {
      moved = true
    }
  }

  function onTouchEnd(e) {
    if (pinch && e.touches.length < 2) {
      pinch = null
      if (scale < 1.05) zoomAt(1, 0, 0, true)
      // A finger left on the glass carries on as a drag.
      if (e.touches.length === 1 && scale > 1) drag = { px: e.touches[0].clientX, py: e.touches[0].clientY, x, y }
      return
    }
    if (e.touches.length > 0) return
    drag = null
    const t = e.changedTouches[0]
    if (moved || !photo() || !t) return
    const now = Date.now()
    if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(t.clientX - lastTap.px, t.clientY - lastTap.py) < 40) {
      lastTap = null
      toggle(t.clientX, t.clientY)
      e.preventDefault() // not also a click
    } else {
      lastTap = { t: now, px: t.clientX, py: t.clientY }
    }
  }

  // ----- mouse -----
  const onDoubleClick = (e) => photo() && toggle(e.clientX, e.clientY)

  function onWheel(e) {
    if (!photo()) return
    e.preventDefault()
    zoomAt(clamp(scale * Math.exp(-e.deltaY * 0.0022), 1, MAX), e.clientX, e.clientY)
  }

  function onPointerDown(e) {
    if (e.pointerType !== 'mouse' || scale === 1 || !photo()) return
    drag = { px: e.clientX, py: e.clientY, x, y }
    strip.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e) {
    if (e.pointerType !== 'mouse' || !drag) return
    x = drag.x + e.clientX - drag.px
    y = drag.y + e.clientY - drag.py
    paint()
  }
  function onPointerUp(e) {
    if (e.pointerType === 'mouse') drag = null
  }

  // Not passive: a pinch or a drag on a zoomed photo must stop the page moving.
  const active = { passive: false }
  strip.addEventListener('touchstart', onTouchStart, active)
  strip.addEventListener('touchmove', onTouchMove, active)
  strip.addEventListener('touchend', onTouchEnd, active)
  strip.addEventListener('touchcancel', onTouchEnd, active)
  strip.addEventListener('wheel', onWheel, active)
  strip.addEventListener('dblclick', onDoubleClick)
  strip.addEventListener('pointerdown', onPointerDown)
  strip.addEventListener('pointermove', onPointerMove)
  strip.addEventListener('pointerup', onPointerUp)

  return {
    reset,
    detach() {
      strip.removeEventListener('touchstart', onTouchStart)
      strip.removeEventListener('touchmove', onTouchMove)
      strip.removeEventListener('touchend', onTouchEnd)
      strip.removeEventListener('touchcancel', onTouchEnd)
      strip.removeEventListener('wheel', onWheel)
      strip.removeEventListener('dblclick', onDoubleClick)
      strip.removeEventListener('pointerdown', onPointerDown)
      strip.removeEventListener('pointermove', onPointerMove)
      strip.removeEventListener('pointerup', onPointerUp)
    },
  }
}
