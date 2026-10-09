import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import StripView, { layerBox } from '../components/StripView'
import { cellImageBox, cellRect, clampPan, edgeTargets, linkedEdge, MAX_ZOOM, snapTo } from '../lib/cells'
import { layerSize } from '../lib/fonts'
import { clamp, frameH, FRAME_W, rad, sceneWidth, snapMove, snapRotation } from '../lib/scene'
import { getState, updateCells, updateLayer } from '../lib/store'

const SNAP_PX = 8 // snap distance in screen pixels
const TAP_SLOP = 8
const deg = (r) => (r * 180) / Math.PI

// What a gesture starts from. Text scales through its font size, photos through w/h.
function baseOf(layer) {
  const { w, h } = layerSize(layer)
  return { x: layer.x, y: layer.y, rotation: layer.rotation, w, h, size: layer.size, type: layer.type }
}

function clampFactor(base, s) {
  const long = Math.max(base.w, base.h)
  return clamp(s, 60 / long, 30000 / long)
}

const scaled = (base, s) =>
  base.type === 'text' ? { size: base.size * s } : { w: base.w * s, h: base.h * s }

function Selection({ layer, scale }) {
  return (
    <div className="selection" data-overlay data-layer-id={layer.id} style={layerBox(layer, scale)}>
      {['nw', 'ne', 'sw', 'se'].map((c) => (
        <b key={c} className={`handle ${c}`} data-handle={c} />
      ))}
      <b className="handle rot" data-handle="rotate" />
    </div>
  )
}

// Edge bars move a divider; corner dots move two at once.
function CellSelection({ cell, project, scale }) {
  const r = cellRect(cell, project)
  return (
    <div
      className="selection cell-selection"
      data-overlay
      data-cell-id={cell.id}
      style={{
        width: r.w * scale,
        height: r.h * scale,
        transform: `translate3d(${r.x * scale}px, ${r.y * scale}px, 0)`,
        borderRadius: Math.min(project.layout?.radius ?? 0, r.w / 2, r.h / 2) * scale,
      }}
    >
      {['n', 's', 'e', 'w'].map((c) => (
        <b key={c} className={`handle edge ${c}`} data-cell-handle={c} />
      ))}
      {['nw', 'ne', 'sw', 'se'].map((c) => (
        <b key={c} className={`handle ${c}`} data-cell-handle={c} />
      ))}
    </div>
  )
}

// The scrollable canvas strip plus every touch gesture that edits it.
// Nothing selected: the strip scrolls natively and a tap selects.
// Layer selected: drag it to move, two fingers anywhere to scale and rotate.
// Cell selected: drag inside to slide its photo, two fingers to zoom it, drag
// an edge or corner handle to resize the cell and its neighbours.
// In both cases dragging elsewhere pans and tapping elsewhere reselects.
export default function Stage({
  ref, project, selectedId, selectedCellId, onSelect, onSelectCell, onDropIntoCell, onSwapCells, fitAll, inset, onEditText,
}) {
  const shellRef = useRef(null)
  const scrollRef = useRef(null)
  const stripRef = useRef(null)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef({ t: 0, id: null })
  const inertia = useRef(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [guides, setGuides] = useState([])
  const [active, setActive] = useState(false)
  const [dropCellId, setDropCellId] = useState(null)

  useLayoutEffect(() => {
    const el = shellRef.current
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { frames } = project
  const cells = project.cells ?? []
  const sceneW = sceneWidth(frames)
  const height = frameH(project)
  const fitH = (size.h - 72) / height
  const scale = Math.max(0.01, fitAll ? Math.min(fitH, (size.w - 32) / sceneW) : Math.min(fitH, (size.w * 0.84) / FRAME_W))
  const pad = Math.max(16, (size.w - (fitAll ? sceneW : FRAME_W) * scale) / 2)
  // When a sheet covers the bottom, shrink the stage visually to stay in view.
  const shrink = inset > 0 && size.h ? clamp((size.h - inset) / size.h, 0.35, 1) : 1
  const selected = project.layers.find((l) => l.id === selectedId)
  const selectedCell = !selected && cells.find((c) => c.id === selectedCellId)

  useImperativeHandle(ref, () => ({
    visibleFrame() {
      const centre = (scrollRef.current.scrollLeft + size.w / 2 - pad) / scale
      return clamp(Math.floor(centre / FRAME_W), 0, frames - 1)
    },
  }))

  // Handlers read the latest render through this ref.
  const live = useRef(null)
  live.current = { project, cells, height, selectedId: selected?.id, selectedCellId: selectedCell?.id, scale, sceneW }

  const metrics = () => {
    const r = stripRef.current.getBoundingClientRect()
    return { r, s: r.width / live.current.sceneW }
  }
  const toScene = (cx, cy, m = metrics()) => ({ x: (cx - m.r.left) / m.s, y: (cy - m.r.top) / m.s })
  const layerById = (id) => live.current.project.layers.find((l) => l.id === id)
  const cellById = (id) => live.current.cells.find((c) => c.id === id)
  const patch = (id, p) => updateLayer(live.current.project.id, id, p)
  const patchCell = (id, p) => updateCells(live.current.project.id, { [id]: p })

  const showGuides = (g, next) => {
    const key = next.map((x) => x.axis + x.pos).join()
    if (key !== g.snapKey) {
      g.snapKey = key
      setGuides(next)
      if (key) navigator.vibrate?.(4)
    }
  }

  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()]
    return {
      d: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: toScene((a.x + b.x) / 2, (a.y + b.y) / 2),
    }
  }

  function startPinch(layerId) {
    const layer = layerById(layerId)
    if (!layer) return
    const { d, angle, mid } = twoFingers()
    gesture.current = { type: 'pinch', moved: true, layerId, base: baseOf(layer), d0: d, a0: angle, m0: mid }
    setActive(true)
  }

  // Everything needed to pan or zoom the photo inside a cell.
  function cropBase(cell) {
    const image = getState().images[cell.imageId]
    if (!image) return null
    const rect = cellRect(cell, live.current.project)
    const box = cellImageBox(cell, rect, image)
    return {
      cellId: cell.id,
      image,
      rect,
      zoom: cell.zoom ?? 1,
      // Photo offset from its centred position, in scene pixels.
      px: ((cell.ox ?? 0) * box.slackX) / 2,
      py: ((cell.oy ?? 0) * box.slackY) / 2,
    }
  }

  function applyCrop(base, zoom, px, py) {
    const box = cellImageBox({ zoom }, base.rect, base.image)
    patchCell(base.cellId, {
      zoom,
      ox: box.slackX > 0.5 ? clampPan(px / (box.slackX / 2)) : 0,
      oy: box.slackY > 0.5 ? clampPan(py / (box.slackY / 2)) : 0,
    })
  }

  function onPointerDown(e) {
    if (e.button > 0) return
    cancelAnimationFrame(inertia.current)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const handle = e.target.closest('[data-handle]')?.dataset.handle
    const cellHandle = e.target.closest('[data-cell-handle]')?.dataset.cellHandle
    const hitLayer = e.target.closest('[data-layer-id]')?.dataset.layerId
    const hitCell = e.target.closest('[data-cell-id]')?.dataset.cellId
    let layerId = live.current.selectedId
    let cellId = live.current.selectedCellId

    // With a mouse there is no scroll-vs-drag conflict: grab things directly.
    if (e.pointerType === 'mouse' && !handle && !cellHandle) {
      if (hitLayer && hitLayer !== layerId) {
        onSelect(hitLayer)
        layerId = hitLayer
      } else if (!hitLayer && hitCell && hitCell !== cellId) {
        onSelectCell(hitCell)
        layerId = null
        cellId = hitCell
      }
    }

    const start = { startX: e.clientX, startY: e.clientY, t: performance.now(), moved: false }
    const layer = layerId && layerById(layerId)
    const cell = !layer && cellId && cellById(cellId)
    if (!layer && !cell) {
      gesture.current = { type: 'tap', ...start }
      return
    }

    scrollRef.current.setPointerCapture(e.pointerId)
    if (pointers.current.size > 2) return
    const pan = () => ({ type: 'pan', ...start, startScroll: scrollRef.current.scrollLeft, lastX: e.clientX, lastT: start.t, v: 0 })

    if (cell) {
      const base = cropBase(cell)
      if (pointers.current.size === 2) {
        const { d, mid } = twoFingers()
        gesture.current = base ? { type: 'cellpinch', moved: true, base, d0: d, m0: mid } : { type: 'done' }
      } else if (cellHandle) {
        gesture.current = {
          type: 'celledge',
          ...start,
          moved: true,
          groups: cellHandle.split('').map((side) => linkedEdge(live.current.cells, cell, side, live.current.project.frames, live.current.height)),
        }
        setActive(true)
      } else if (hitCell === cell.id && !hitLayer && base) {
        gesture.current = { type: 'cellpan', ...start, base }
      } else {
        gesture.current = pan()
      }
      return
    }

    if (pointers.current.size === 2) return startPinch(layerId)
    const base = baseOf(layer)
    const p0 = toScene(e.clientX, e.clientY)

    if (handle === 'rotate') {
      gesture.current = { type: 'rotate', layerId, base, ...start, moved: true, a0: Math.atan2(p0.y - base.y, p0.x - base.x) }
    } else if (handle) {
      // Corner vector from the centre, in scene space, for the grabbed corner.
      const sx = handle.includes('e') ? 1 : -1
      const sy = handle.includes('s') ? 1 : -1
      const cos = Math.cos(rad(base.rotation))
      const sin = Math.sin(rad(base.rotation))
      const cv = { x: (sx * base.w * cos - sy * base.h * sin) / 2, y: (sx * base.w * sin + sy * base.h * cos) / 2 }
      gesture.current = {
        type: 'resize', layerId, base, ...start, moved: true, cv,
        grab: { x: base.x + cv.x - p0.x, y: base.y + cv.y - p0.y },
      }
    } else if (hitLayer === layerId) {
      gesture.current = { type: 'move', layerId, base, ...start, photo: layer.type === 'photo' }
    } else {
      gesture.current = pan()
    }
    if (handle) setActive(true)
  }

  function onPointerMove(e) {
    const g = gesture.current
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!g) return

    if (g.type === 'pinch') {
      if (pointers.current.size < 2) return
      const { d, angle, mid: m } = twoFingers()
      const s = clampFactor(g.base, d / g.d0)
      const { rotation } = snapRotation(g.base.rotation + deg(angle - g.a0))
      const da = rad(rotation - g.base.rotation)
      // Keep the point under the fingers fixed: rotate and scale the centre about it.
      const vx = (g.base.x - g.m0.x) * s
      const vy = (g.base.y - g.m0.y) * s
      patch(g.layerId, {
        x: m.x + vx * Math.cos(da) - vy * Math.sin(da),
        y: m.y + vx * Math.sin(da) + vy * Math.cos(da),
        rotation,
        ...scaled(g.base, s),
      })
      return
    }
    if (g.type === 'cellpinch') {
      if (pointers.current.size < 2) return
      const { d, mid } = twoFingers()
      const zoom = clamp((g.base.zoom * d) / g.d0, 1, MAX_ZOOM)
      const k = zoom / g.base.zoom
      applyCrop(g.base, zoom, g.base.px * k + mid.x - g.m0.x, g.base.py * k + mid.y - g.m0.y)
      return
    }

    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.moved) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return
      g.moved = true
      if (g.type === 'move') setActive(true)
    }

    const m = metrics()
    if (g.type === 'move') {
      const snap = snapMove({
        x: g.base.x + dx / m.s,
        y: g.base.y + dy / m.s,
        w: g.base.w,
        h: g.base.h,
        rotation: g.base.rotation,
        frames: live.current.project.frames,
        height: live.current.height,
        threshold: SNAP_PX / m.s,
      })
      patch(g.layerId, { x: snap.x, y: snap.y })
      // A photo held over an empty cell will drop into it.
      let target = null
      if (g.photo) {
        const p = toScene(e.clientX, e.clientY, m)
        target = live.current.cells.find((c) => {
          if (c.imageId) return false
          const r = cellRect(c, live.current.project)
          return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
        })?.id ?? null
      }
      if (target !== (g.dropCell ?? null)) {
        g.dropCell = target
        setDropCellId(target)
        if (target) navigator.vibrate?.(6)
      }
      showGuides(g, target ? [] : snap.guides)
    } else if (g.type === 'cellpan') {
      // Inside its own spot the photo slides; carried over another spot it
      // snaps back and that spot lights up as the place it will swap with.
      const pt = toScene(e.clientX, e.clientY, m)
      const target = live.current.cells.find((c) => {
        if (c.id === g.base.cellId) return false
        const r = cellRect(c, live.current.project)
        return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h
      })?.id ?? null
      if (target !== (g.dropCell ?? null)) {
        g.dropCell = target
        setDropCellId(target)
        setActive(!!target)
        if (target) navigator.vibrate?.(6)
      }
      if (target) applyCrop(g.base, g.base.zoom, g.base.px, g.base.py)
      else applyCrop(g.base, g.base.zoom, g.base.px + dx / m.s, g.base.py + dy / m.s)
    } else if (g.type === 'celledge') {
      const patches = {}
      const lines = []
      for (const group of g.groups) {
        const raw = group.pos + (group.axis === 'x' ? dx : dy) / m.s
        const snapped = snapTo(raw, edgeTargets(live.current.cells, group, live.current.project.frames, live.current.height), SNAP_PX / m.s)
        const v = clamp(snapped ?? raw, group.lo, group.hi)
        if (snapped !== null && v === snapped) lines.push({ axis: group.axis, pos: v })
        for (const { id, key } of group.members) patches[id] = { ...patches[id], [key]: v }
      }
      updateCells(live.current.project.id, patches)
      showGuides(g, lines)
    } else if (g.type === 'resize') {
      const p = toScene(e.clientX, e.clientY, m)
      // Opposite corner stays put; project the pointer onto the diagonal.
      const ox = g.base.x - g.cv.x
      const oy = g.base.y - g.cv.y
      const dot = (p.x + g.grab.x - ox) * g.cv.x * 2 + (p.y + g.grab.y - oy) * g.cv.y * 2
      const s = clampFactor(g.base, dot / (4 * (g.cv.x ** 2 + g.cv.y ** 2)))
      patch(g.layerId, { x: ox + g.cv.x * s, y: oy + g.cv.y * s, ...scaled(g.base, s) })
    } else if (g.type === 'rotate') {
      const p = toScene(e.clientX, e.clientY, m)
      const turn = deg(Math.atan2(p.y - g.base.y, p.x - g.base.x) - g.a0)
      patch(g.layerId, { rotation: snapRotation(g.base.rotation + turn).rotation })
    } else if (g.type === 'pan') {
      const k = m.s / live.current.scale
      scrollRef.current.scrollLeft = g.startScroll - dx / k
      const now = performance.now()
      const dt = now - g.lastT
      if (dt > 0) g.v = 0.7 * ((e.clientX - g.lastX) / k / dt) + 0.3 * g.v
      g.lastX = e.clientX
      g.lastT = now
    }
  }

  function handleTap(cx, cy) {
    const hit = document
      .elementsFromPoint(cx, cy)
      .find((el) => (el.dataset?.layerId || el.dataset?.cellId) && !el.closest('[data-overlay]'))
    const id = hit?.dataset.layerId ?? null
    const cellId = id ? null : hit?.dataset.cellId ?? null
    const now = performance.now()
    const double = id && lastTap.current.id === id && now - lastTap.current.t < 350
    lastTap.current = { t: now, id }
    if (cellId) onSelectCell(cellId, cellId === live.current.selectedCellId)
    else if (double && layerById(id)?.type === 'text') onEditText(id)
    else if (id !== (live.current.selectedId ?? null) || live.current.selectedCellId) onSelect(id)
  }

  function glide(v) {
    let last = performance.now()
    const step = (now) => {
      const dt = now - last
      last = now
      scrollRef.current.scrollLeft -= v * dt
      v *= Math.pow(0.95, dt / 16)
      if (Math.abs(v) > 0.02) inertia.current = requestAnimationFrame(step)
    }
    inertia.current = requestAnimationFrame(step)
  }

  function onPointerUp(e) {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    if (!g) return
    // A pinch ends as soon as one finger lifts; the other must not start a move.
    if ((g.type === 'pinch' || g.type === 'cellpinch') && pointers.current.size > 0) {
      gesture.current = { type: 'done' }
      return
    }
    if (pointers.current.size > 0) return
    gesture.current = null
    setGuides([])
    setActive(false)
    setDropCellId(null)
    if (e.type === 'pointercancel') return
    if (!g.moved && g.type !== 'done' && performance.now() - g.t < 500) handleTap(e.clientX, e.clientY)
    else if (g.type === 'move' && g.dropCell) onDropIntoCell(g.layerId, g.dropCell)
    else if (g.type === 'cellpan' && g.dropCell) onSwapCells(g.base.cellId, g.dropCell)
    else if (g.type === 'pan' && Math.abs(g.v) > 0.1 && performance.now() - g.lastT < 80) glide(g.v)
  }

  const onWheel = (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) scrollRef.current.scrollLeft += e.deltaY
  }

  return (
    <div className="stage" ref={shellRef}>
      <div
        ref={scrollRef}
        className={`stage-scroll ${active ? 'gesturing' : ''}`}
        style={{
          touchAction: selected || selectedCell ? 'none' : 'pan-x',
          transform: `translateY(${shrink < 1 ? -inset / 2 : 0}px) scale(${shrink})`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="stage-pad" style={{ width: pad }} />
        {size.h > 0 && (
          <div className="strip-wrap" ref={stripRef} style={{ width: sceneW * scale, height: height * scale }}>
            <StripView project={project} scale={scale} dropCellId={dropCellId} />
            {Array.from({ length: frames - 1 }, (_, i) => (
              <i key={i} className="seam" style={{ left: (i + 1) * FRAME_W * scale }} />
            ))}
            {guides.map((g) => (
              <i
                key={g.axis + g.pos}
                className={`guide ${g.axis}`}
                style={g.axis === 'x' ? { left: g.pos * scale } : { top: g.pos * scale }}
              />
            ))}
            {selected && <Selection layer={selected} scale={scale} />}
            {selectedCell && <CellSelection cell={selectedCell} project={project} scale={scale} />}
            <div className="frame-nums">
              {Array.from({ length: frames }, (_, i) => (
                <span key={i} style={{ width: FRAME_W * scale }}>{i + 1}</span>
              ))}
            </div>
          </div>
        )}
        <div className="stage-pad" style={{ width: pad }} />
      </div>
    </div>
  )
}
