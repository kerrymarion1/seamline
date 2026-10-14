import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { CanvasPanel, LayersPanel, LayoutPanel, PhotoStylePanel, ShapePanel, TextPanel } from '../editor/panels'
import { useProjectPalette } from '../lib/palette'
import { newShape } from '../lib/shapes'
import PhotoPicker from '../editor/PhotoPicker'
import Stage from '../editor/Stage'
import Preview from './Preview'
import { isDarkBackground } from '../lib/backgrounds'
import { importFile } from '../lib/images'
import { frameH, FRAME_W, uid } from '../lib/scene'
import {
  addImages, addLayers, canRedo, canUndo, clearHistory, duplicateLayer, redo, undo, updateLayer, moveLayer, removeCell, removeLayer, swapCells, updateCells, fileImports,
  updateProject, useProject, useStore,
} from '../lib/store'
import { me } from '../lib/cloud'
import { ensureLocal, photoIdsOf } from '../lib/sync'

// Height of the on-screen keyboard, also published as --kb so fixed sheets
// can sit above it (iOS does not resize the layout viewport for the keyboard).
function useKeyboardInset() {
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const v = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      setKb(v)
      document.documentElement.style.setProperty('--kb', `${v}px`)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--kb')
    }
  }, [])
  return kb
}

function ToolButton({ icon, label, onClick, danger, disabled, on }) {
  return (
    <button className={`tool ${danger ? 'danger' : ''} ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

const EMPTY_CROP = { ox: 0, oy: 0, zoom: 1 }

export default function Editor({ projectId }) {
  const project = useProject(projectId)
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  // Recomputed on every store change, which is exactly when these can change.
  const palette = useProjectPalette(project, images)
  const undoable = useStore(() => canUndo(projectId))
  const redoable = useStore(() => canRedo(projectId))
  const stage = useRef(null)
  const fileInput = useRef(null)
  const toolbar = useRef(null)
  const pickFor = useRef(null) // cell the photo picker was opened for
  const [selectedId, setSelectedId] = useState(null)
  const [cellId, setCellId] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [heights, setHeights] = useState({})
  const [fitAll, setFitAll] = useState(false)
  const [notice, setNotice] = useState(null)
  const [shapeColor, setShapeColor] = useState('#FFFFFF')
  const [previewing, setPreviewing] = useState(false)
  const kb = useKeyboardInset()

  useEffect(() => {
    if (!project) navigate('/', { replace: true })
  }, [project])

  // A photo that reached this device as a small copy is fetched in full once
  // it is in a collage, so the editor and the finished image are sharp.
  const small = project ? photoIdsOf(project).filter((id) => images[id] && !images[id].blob) : []
  useEffect(() => {
    if (small.length) ensureLocal(small)
    // Only when the set of small copies changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [small.join()])

  // Undo history lasts for one editing session.
  useEffect(() => () => clearHistory(projectId), [projectId])

  const cells = project?.cells ?? []
  const selected = project?.layers.find((l) => l.id === selectedId)
  const cell = !selected && cells.find((c) => c.id === cellId)

  const select = (id) => {
    setSelectedId(id)
    setCellId(null)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) removeLayer(projectId, selected.id)
      if (e.key === 'Escape') select(null)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        ;(e.shiftKey ? redo : undo)(projectId)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo(projectId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [projectId, selected])

  useEffect(() => {
    if (!notice || notice.busy) return
    const t = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(t)
  }, [notice])

  const onHeight = useCallback(
    (name) => (h) => setHeights((prev) => (prev[name] === h ? prev : { ...prev, [name]: h })),
    [],
  )
  // Stable per-sheet callbacks so Sheet's ResizeObserver is not re-created.
  const heightCbs = useRef({
    canvas: onHeight('canvas'), text: onHeight('text'), layers: onHeight('layers'), layout: onHeight('layout'),
    photos: onHeight('photos'), shapes: onHeight('shapes'), photostyle: onHeight('photostyle'),
  }).current

  if (!project) return null

  // The text sheet only makes sense while a text layer is selected.
  const openSheet =
    (sheet === 'text' && selected?.type !== 'text') || (sheet === 'photostyle' && selected?.type !== 'photo') ? null : sheet
  const inset = openSheet
    ? Math.max(0, (heights[openSheet] ?? 0) + kb - (toolbar.current?.offsetHeight ?? 80))
    : 0
  const H = frameH(project)
  const hasContent = project.layers.length > 0 || cells.some((c) => c.imageId)

  // With photos in an album, offer the pool first; otherwise go straight to the phone.
  const pickPhotos = (forCell = null) => {
    pickFor.current = forCell
    if (albums.some((a) => a.imageIds.length)) setSheet('photos')
    else fileInput.current.click()
  }

  async function addPhotos(files) {
    if (!files.length) return
    const records = []
    let failed = 0
    // One at a time: decoding several large photos at once can exhaust memory on phones.
    for (const [i, file] of files.entries()) {
      setNotice({ busy: true, text: `Importing ${i + 1} of ${files.length}` })
      try {
        records.push(await importFile(file))
      } catch {
        failed++
      }
    }
    addImages(records)
    fileImports(records.map((r) => r.id), me())
    placePhotos(records)
    setNotice(failed ? { text: `${failed} photo${failed > 1 ? 's' : ''} could not be read` } : null)
  }

  function placePhotos(records) {
    // Picked for the background rather than the canvas.
    if (pickFor.current === 'background') {
      pickFor.current = null
      if (records[0]) updateProject(project.id, { background: { type: 'photo', imageId: records[0].id, blur: 24, dim: 0.25 } })
      return
    }
    const start = stage.current.visibleFrame()
    // Photos snap into the collage first: the cell the picker was opened for,
    // then empty cells left to right. Anything left over becomes a free layer.
    const rest = [...records]
    const patches = {}
    const target = cells.find((c) => c.id === pickFor.current)
    const slots = [...(target ? [target] : []), ...cells.filter((c) => !c.imageId && c !== target)]
    for (const slot of slots) {
      if (!rest.length) break
      patches[slot.id] = { imageId: rest.shift().id, ...EMPTY_CROP }
    }
    if (Object.keys(patches).length) updateCells(project.id, patches)

    const layers = rest.map((img, i) => {
      const frame = Math.min(start + i, project.frames - 1)
      const stacked = Math.max(0, start + i - (project.frames - 1))
      const k = Math.min((FRAME_W * 0.9) / img.width, (H * 0.9) / img.height)
      return {
        id: uid(),
        type: 'photo',
        imageId: img.id,
        x: (frame + 0.5) * FRAME_W + stacked * 50,
        y: H / 2 + stacked * 50,
        w: img.width * k,
        h: img.height * k,
        rotation: 0,
      }
    })
    addLayers(project.id, layers)
    if (layers.length) select(layers.at(-1).id)
  }

  function addShape(sticker) {
    const frame = stage.current.visibleFrame()
    const layer = newShape(uid(), sticker, shapeColor, (frame + 0.5) * FRAME_W, H / 2)
    addLayers(project.id, [layer])
    select(layer.id)
    setSheet(null)
  }

  function addText() {
    const frame = stage.current.visibleFrame()
    const layer = {
      id: uid(),
      type: 'text',
      text: 'Your text',
      font: 'serif',
      color: isDarkBackground(project.background) ? '#FFFFFF' : '#0E0E10',
      size: 140,
      align: 'center',
      x: (frame + 0.5) * FRAME_W,
      y: H / 2,
      rotation: 0,
    }
    addLayers(project.id, [layer])
    select(layer.id)
    setSheet('text')
  }

  // `again` is true when the tapped cell was already selected.
  function selectCell(id, again) {
    if (again && !cells.find((c) => c.id === id)?.imageId) pickPhotos(id)
    setSelectedId(null)
    setCellId(id)
  }

  function dropIntoCell(layerId, targetId) {
    const layer = project.layers.find((l) => l.id === layerId)
    if (!layer) return
    updateCells(project.id, { [targetId]: { imageId: layer.imageId, ...EMPTY_CROP } })
    removeLayer(project.id, layerId)
    setSelectedId(null)
    setCellId(targetId)
  }

  const openPreview = () => {
    setSheet(null)
    select(null)
    setPreviewing(true)
  }

  const toggle = (name) => setSheet((s) => (s === name ? null : name))
  const bar = selected ? 'layer' : cell ? 'cell' : 'main'

  return (
    <div className="screen editor">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back to projects">
          <Icon name="back" />
        </button>
        <button className="icon-btn" onClick={() => undo(project.id)} disabled={!undoable} aria-label="Undo">
          <Icon name="undo" size={22} />
        </button>
        <button className="icon-btn" onClick={() => redo(project.id)} disabled={!redoable} aria-label="Redo">
          <Icon name="redo" size={22} />
        </button>
        <input
          className="title-input"
          value={project.name}
          onChange={(e) => updateProject(project.id, { name: e.target.value })}
          onBlur={(e) => !e.target.value.trim() && updateProject(project.id, { name: 'Untitled' })}
          aria-label="Project name"
        />
        <button
          className="icon-btn"
          onClick={() => setFitAll((v) => !v)}
          aria-label={fitAll ? 'Zoom to frame' : 'Show whole strip'}
        >
          <Icon name={fitAll ? 'fitFrame' : 'fitAll'} />
        </button>
        <button className="export-btn" onClick={openPreview} disabled={!hasContent}>
          Export
        </button>
      </header>

      <Stage
        ref={stage}
        project={project}
        selectedId={selected?.id ?? null}
        selectedCellId={cell ? cell.id : null}
        onSelect={select}
        onSelectCell={selectCell}
        onDropIntoCell={dropIntoCell}
        onSwapCells={(from, to) => {
          swapCells(project.id, from, to)
          setCellId(to)
        }}
        fitAll={fitAll}
        inset={inset}
        onEditText={(id) => {
          select(id)
          setSheet('text')
        }}
      />

      {!project.layers.length && !cells.length && (
        <div className="canvas-hint">
          <strong>Start with a photo or a layout</strong>
          <span>{project.frames > 1 ? 'Photos can stretch across the dashed lines to span frames.' : 'A layout gives you spots to drop photos into.'}</span>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice.busy && <i className="spinner" />}
          {notice.text}
        </div>
      )}

      <nav className="toolbar" ref={toolbar}>
        <div className={`tools ${bar === 'main' ? 'show' : ''}`} inert={bar !== 'main'}>
          <ToolButton icon="photo" label="Photos" onClick={() => pickPhotos()} />
          <ToolButton icon="layout" label="Layouts" onClick={() => toggle('layout')} />
          <ToolButton icon="text" label="Text" onClick={addText} />
          <ToolButton icon="shapes" label="Shapes" onClick={() => toggle('shapes')} />
          <ToolButton icon="canvas" label="Canvas" onClick={() => toggle('canvas')} />
          <ToolButton icon="layers" label="Layers" onClick={() => toggle('layers')} />
        </div>
        <div className={`tools ${bar === 'layer' ? 'show' : ''}`} inert={bar !== 'layer'}>
          {selected?.type === 'text' && <ToolButton icon="edit" label="Edit" onClick={() => setSheet('text')} />}
          {selected?.type === 'photo' && <ToolButton icon="edit" label="Style" onClick={() => setSheet('photostyle')} />}
          {selected?.type === 'shape' && <ToolButton icon="edit" label="Colour" onClick={() => setSheet('shapes')} />}
          <ToolButton icon="forward" label="Forward" onClick={() => moveLayer(project.id, selectedId, 1)} />
          <ToolButton icon="backward" label="Back" onClick={() => moveLayer(project.id, selectedId, -1)} />
          <ToolButton icon="copy" label="Copy" onClick={() => select(duplicateLayer(project.id, selectedId))} />
          <ToolButton
            icon={selected?.locked ? 'unlock' : 'lock'}
            label={selected?.locked ? 'Unlock' : 'Lock'}
            onClick={() => {
              updateLayer(project.id, selectedId, { locked: !selected.locked })
              // Once locked it is out of the way; unlock it again from Layers.
              if (!selected.locked) select(null)
            }}
          />
          <ToolButton icon="trash" label="Delete" danger onClick={() => removeLayer(project.id, selectedId)} />
          <ToolButton icon="check" label="Done" onClick={() => select(null)} />
        </div>
        <div className={`tools ${bar === 'cell' ? 'show' : ''}`} inert={bar !== 'cell'}>
          <ToolButton icon="photo" label={cell?.imageId ? 'Replace' : 'Add'} onClick={() => pickPhotos(cellId)} />
          {/* Deleting a photo empties the spot; only an empty spot can itself be removed. */}
          {cell?.imageId ? (
            <ToolButton
              icon="trash"
              label="Delete photo"
              danger
              onClick={() => updateCells(project.id, { [cellId]: { imageId: null, ...EMPTY_CROP } })}
            />
          ) : (
            <ToolButton icon="trash" label="Remove spot" danger onClick={() => removeCell(project.id, cellId)} />
          )}
          <ToolButton icon="check" label="Done" onClick={() => select(null)} />
        </div>
      </nav>

      <Sheet open={openSheet === 'photos'} onClose={() => setSheet(null)} title="Add photos" onHeight={heightCbs.photos}>
        <PhotoPicker
          albums={albums}
          images={images}
          emptySpots={cells.filter((c) => !c.imageId).length}
          usedIds={cells.map((c) => c.imageId).filter(Boolean)}
          onPhone={() => {
            setSheet(null)
            fileInput.current.click()
          }}
          onAdd={(ids) => {
            setSheet(null)
            placePhotos(ids.map((id) => images[id]).filter(Boolean))
          }}
        />
      </Sheet>
      <Sheet open={openSheet === 'layout'} onClose={() => setSheet(null)} title="Layouts" onHeight={heightCbs.layout}>
        <LayoutPanel project={project} />
      </Sheet>
      <Sheet open={openSheet === 'canvas'} onClose={() => setSheet(null)} title="Canvas" onHeight={heightCbs.canvas}>
        <CanvasPanel project={project} palette={palette} onPickBackground={() => pickPhotos('background')} />
      </Sheet>
      <Sheet open={openSheet === 'text'} onClose={() => setSheet(null)} title="Text" onHeight={heightCbs.text}>
        <TextPanel project={project} palette={palette} layer={selected?.type === 'text' ? selected : null} />
      </Sheet>
      <Sheet open={openSheet === 'shapes'} onClose={() => setSheet(null)} title="Shapes" onHeight={heightCbs.shapes}>
        <ShapePanel
          project={project}
          palette={palette}
          layer={selected?.type === 'shape' ? selected : null}
          color={shapeColor}
          onColor={setShapeColor}
          onAdd={addShape}
        />
      </Sheet>
      <Sheet open={openSheet === 'photostyle'} onClose={() => setSheet(null)} title="Photo style" onHeight={heightCbs.photostyle}>
        <PhotoStylePanel project={project} layer={selected?.type === 'photo' ? selected : null} />
      </Sheet>
      <Sheet open={openSheet === 'layers'} onClose={() => setSheet(null)} title="Layers" onHeight={heightCbs.layers}>
        <LayersPanel project={project} selectedId={selectedId} onSelect={select} />
      </Sheet>

      {previewing && <Preview project={project} onClose={() => setPreviewing(false)} />}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...e.target.files]
          e.target.value = ''
          addPhotos(files)
        }}
      />
    </div>
  )
}
