import Icon from '../components/Icon'
import { backgroundStyle, GRADIENTS, MOTIFS, normalizeBackground, SOLIDS, THEMES } from '../lib/backgrounds'
import { useState } from 'react'
import { MAX_SPOTS, templatesFor, tilesOf } from '../lib/cells'
import { FONTS, TEXT_COLORS } from '../lib/fonts'
import { frameH, FORMATS, MAX_FRAMES, MIN_FRAMES } from '../lib/scene'
import { SHAPE_COLORS, shapeUrl, STICKERS } from '../lib/shapes'
import {
  applyLayout, clearLayout, savePreset, moveLayer, removeLayer, setFormat, setFrames, updateLayer, updateLayout, updateProject, useStore,
} from '../lib/store'

export function Stepper({ value, min, max, onChange }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Fewer">
        <Icon name="minus" size={20} />
      </button>
      <output>{value}</output>
      <button onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="More">
        <Icon name="plus" size={20} />
      </button>
    </div>
  )
}

export function FormatPicker({ value, onChange }) {
  return (
    <div className="segmented">
      {FORMATS.map((f) => (
        <button key={f.id} className={`wide ${value === f.h ? 'on' : ''}`} onClick={() => onChange(f)}>
          {f.name}
        </button>
      ))}
    </div>
  )
}

function Swatches({ colors, value, onPick }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch ${value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
          aria-label={c}
        />
      ))}
      <label className="swatch custom" aria-label="Custom colour">
        <input type="color" value={value ?? '#ffffff'} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  )
}

export function CanvasPanel({ project, onPickBackground }) {
  const bg = normalizeBackground(project.background)
  const set = (background) => updateProject(project.id, { background })
  // A new colour keeps the image on top but lets it pick a readable tint again.
  const setBase = (base) => set({ ...base, motif: bg.motif, strength: bg.strength })
  const same = (t) => JSON.stringify(t) === JSON.stringify(bg)
  return (
    <>
      <div className="row">
        <div>
          <div className="label">Frames</div>
          <div className="hint">Slides to swipe, 1080 × {frameH(project)} each</div>
        </div>
        <Stepper
          value={project.frames}
          min={MIN_FRAMES}
          max={MAX_FRAMES}
          onChange={(frames) => setFrames(project.id, frames)}
        />
      </div>
      <div className="row">
        <div className="label">Shape</div>
        <FormatPicker value={frameH(project)} onChange={(f) => setFormat(project.id, f.id)} />
      </div>

      <div className="label">Colour</div>
      <Swatches
        colors={SOLIDS}
        value={bg.type === 'solid' ? bg.color : null}
        onPick={(color) => setBase({ type: 'solid', color })}
      />
      <div className="label">Gradient</div>
      <div className="swatches">
        {GRADIENTS.map((g) => (
          <button
            key={g.id}
            className={`swatch wide ${bg.type === 'gradient' && bg.id === g.id ? 'on' : ''}`}
            style={backgroundStyle({ type: 'gradient', id: g.id })}
            onClick={() => setBase({ type: 'gradient', id: g.id })}
            aria-label={g.name}
          />
        ))}
      </div>

      <div className="label">Photo</div>
      {bg.type === 'photo' ? (
        <>
          <label className="row range-row">
            <span className="label">Blur</span>
            <input className="slider" type="range" min={0} max={60} value={bg.blur ?? 0} onChange={(e) => set({ ...bg, blur: +e.target.value })} />
          </label>
          <label className="row range-row">
            <span className="label">Dim</span>
            <input className="slider" type="range" min={0} max={80} value={Math.round((bg.dim ?? 0) * 100)} onChange={(e) => set({ ...bg, dim: +e.target.value / 100 })} />
          </label>
          <div className="btn-pair">
            <button className="text-btn" onClick={onPickBackground}>Change photo</button>
            <button className="text-btn" onClick={() => set({ type: 'solid', color: '#F2F0EB' })}>Remove photo</button>
          </div>
        </>
      ) : (
        <button className="secondary block" onClick={onPickBackground}>Use a photo as the background</button>
      )}

      {bg.type !== 'photo' && <div className="label">Image</div>}
      <div className="templates" hidden={bg.type === 'photo'}>
        <button className={`tpl ${bg.motif ? '' : 'on'}`} onClick={() => set({ ...bg, motif: undefined, ink: undefined })}>
          <span className="bg-art" style={backgroundStyle({ ...bg, motif: undefined })} />
          <span>None</span>
        </button>
        {MOTIFS.map((m) => (
          <button
            key={m.id}
            className={`tpl ${bg.motif === m.id ? 'on' : ''}`}
            onClick={() => set({ ...bg, motif: m.id })}
          >
            <span className="bg-art" style={backgroundStyle({ ...bg, motif: m.id, strength: Math.max(2, bg.strength ?? 1) }, 0.14)} />
            <span>{m.name}</span>
          </button>
        ))}
      </div>
      {bg.motif && bg.type !== 'photo' && (
        <label className="row range-row">
          <span className="label">Strength</span>
          <input
            className="slider"
            type="range"
            min={3}
            max={50}
            value={Math.round((bg.strength ?? 1) * 10)}
            onChange={(e) => set({ ...bg, strength: +e.target.value / 10 })}
          />
        </label>
      )}

      <div className="label">Seasonal</div>
      <div className="templates">
        {THEMES.map((t) => (
          <button key={t.name} className={`tpl ${same(t.bg) ? 'on' : ''}`} onClick={() => set(t.bg)}>
            <span className="bg-art" style={backgroundStyle(t.bg, 0.14)} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export function TextPanel({ project, layer }) {
  if (!layer) return null
  const set = (patch) => updateLayer(project.id, layer.id, patch)
  return (
    <>
      <textarea
        className="text-input"
        rows={2}
        value={layer.text}
        placeholder="Type something"
        onChange={(e) => set({ text: e.target.value })}
        onFocus={(e) => layer.text === 'Your text' && e.target.select()}
      />
      <div className="chips">
        {FONTS.map((f) => (
          <button
            key={f.id}
            className={`chip ${layer.font === f.id ? 'on' : ''}`}
            style={{ fontFamily: f.family, fontWeight: f.weight }}
            onClick={() => set({ font: f.id })}
          >
            {f.name}
          </button>
        ))}
      </div>
      <Swatches colors={TEXT_COLORS} value={layer.color} onPick={(color) => set({ color })} />
      <div className="row">
        <input
          className="slider"
          type="range"
          min={24}
          max={600}
          value={Math.min(600, Math.round(layer.size))}
          onChange={(e) => set({ size: +e.target.value })}
          aria-label="Size"
        />
        <div className="segmented">
          {['left', 'center', 'right'].map((a) => (
            <button
              key={a}
              className={layer.align === a ? 'on' : ''}
              onClick={() => set({ align: a })}
              aria-label={`Align ${a}`}
            >
              <Icon name={`align${a[0].toUpperCase()}${a.slice(1)}`} size={20} />
            </button>
          ))}
        </div>
      </div>
      <div className="chips">
        {[['outline', 'Outline'], ['shadow', 'Shadow'], ['pill', 'Backing']].map(([key, label]) => (
          <button key={key} className={`chip small ${layer[key] ? 'on' : ''}`} onClick={() => set({ [key]: !layer[key] })}>
            {label}
          </button>
        ))}
      </div>
      <label className="row range-row">
        <span className="label">Spacing</span>
        <input
          className="slider"
          type="range"
          min={-5}
          max={40}
          value={Math.round((layer.spacing ?? 0) * 100)}
          onChange={(e) => set({ spacing: +e.target.value / 100 })}
        />
      </label>
    </>
  )
}

// Add a shape or sticker, or recolour the selected one.
export function ShapePanel({ project, layer, color, onColor, onAdd }) {
  const current = layer?.color ?? color
  const pick = (c) => {
    onColor(c)
    if (layer) updateLayer(project.id, layer.id, { color: c })
  }
  return (
    <>
      <Swatches colors={SHAPE_COLORS} value={current} onPick={pick} />
      <div className="sticker-grid">
        {STICKERS.map((st) => (
          <button key={st.id} className="sticker" onClick={() => onAdd(st)} aria-label={`Add ${st.name}`}>
            <img src={shapeUrl({ shape: st.id, color: current, w: st.ratio, h: 1 })} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </>
  )
}

// Border and shadow for a free photo.
export function PhotoStylePanel({ project, layer }) {
  if (!layer) return null
  const set = (patch) => updateLayer(project.id, layer.id, patch)
  return (
    <>
      <label className="row range-row">
        <span className="label">Border</span>
        <input className="slider" type="range" min={0} max={80} value={layer.border ?? 0} onChange={(e) => set({ border: +e.target.value })} />
      </label>
      <div className="chips">
        <button className={`chip small ${layer.shadow ? 'on' : ''}`} onClick={() => set({ shadow: !layer.shadow })}>Shadow</button>
      </div>
    </>
  )
}

export function LayersPanel({ project, selectedId, onSelect }) {
  const images = useStore((s) => s.images)
  const layers = [...project.layers].reverse() // top first
  if (!layers.length) return <p className="hint centre">Nothing here yet. Add a photo or some text.</p>
  return (
    <ul className="layer-list">
      {layers.map((l, i) => (
        <li key={l.id} className={l.id === selectedId ? 'on' : ''}>
          <button className="layer-pick" onClick={() => onSelect(l.id)}>
            {l.type === 'text' ? (
              <span className="thumb text-thumb">T</span>
            ) : (
              <img className={`thumb ${l.type === 'shape' ? 'shape-thumb' : ''}`} src={l.type === 'shape' ? shapeUrl(l) : images[l.imageId]?.previewUrl} alt="" />
            )}
            <span className="layer-name">{l.type === 'text' ? l.text || 'Text' : l.type === 'shape' ? STICKERS.find((x) => x.id === l.shape)?.name ?? 'Shape' : 'Photo'}</span>
          </button>
          <button className="icon-btn" disabled={i === 0} onClick={() => moveLayer(project.id, l.id, 1)} aria-label="Bring forward">
            <Icon name="up" size={20} />
          </button>
          <button className="icon-btn" disabled={i === layers.length - 1} onClick={() => moveLayer(project.id, l.id, -1)} aria-label="Send back">
            <Icon name="down" size={20} />
          </button>
          <button className="icon-btn" onClick={() => removeLayer(project.id, l.id)} aria-label="Delete">
            <Icon name="trash" size={20} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Range({ label, value, max, onChange }) {
  return (
    <label className="row range-row">
      <span className="label">{label}</span>
      <input className="slider" type="range" min={0} max={max} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

// Small drawing of a template's cells for the current frame and photo counts.
export function TemplateThumb({ template, frames, count, ratio }) {
  const H = 50
  const fw = H / ratio
  return (
    <span className="tpl-art" style={{ width: frames * fw, height: H }}>
      {tilesOf(template, frames, count).map(([x0, y0, x1, y1], i) => (
        <i key={i} style={{ left: x0 * fw, top: y0 * H, width: (x1 - x0) * fw, height: (y1 - y0) * H }} />
      ))}
    </span>
  )
}

export function LayoutPanel({ project }) {
  const layout = project.layout
  const cells = project.cells ?? []
  // Start from the spots already on the canvas, else one photo per frame.
  const [chosen, setChosen] = useState(null)
  const count = chosen ?? (cells.length || project.frames)
  const templates = templatesFor(project.frames, count)
  const [naming, setNaming] = useState(null) // text while naming a template
  const [savedAs, setSavedAs] = useState(null)
  const saveTemplate = () => {
    const preset = savePreset(project.id, naming)
    setNaming(null)
    setSavedAs(preset?.name)
    setTimeout(() => setSavedAs(null), 2500)
  }

  // Changing the number keeps the current style when it can make that many spots.
  const setCount = (n) => {
    setChosen(n)
    if (layout && templatesFor(project.frames, n).some((t) => t.id === layout.template)) {
      applyLayout(project.id, layout.template, n)
    }
  }

  return (
    <>
      <div className="row">
        <div>
          <div className="label">Photos</div>
          <div className="hint">
            {count} spot{count === 1 ? '' : 's'} across {project.frames} frame{project.frames === 1 ? '' : 's'}
          </div>
        </div>
        <Stepper value={count} min={1} max={MAX_SPOTS} onChange={setCount} />
      </div>
      <div className="templates">
        <button className={`tpl ${layout ? '' : 'on'}`} onClick={() => clearLayout(project.id)}>
          <span className="tpl-art none" style={{ width: 40, height: 50 }} />
          <span>None</span>
        </button>
        {templates.map((t) => (
          <button
            key={t.id}
            className={`tpl ${layout?.template === t.id && cells.length === count ? 'on' : ''}`}
            onClick={() => applyLayout(project.id, t.id, count)}
          >
            <TemplateThumb template={t} frames={project.frames} count={count} ratio={frameH(project) / 1080} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      {layout ? (
        <>
          <Range label="Gap" max={120} value={layout.gap} onChange={(gap) => updateLayout(project.id, { gap })} />
          <Range label="Margin" max={160} value={layout.margin} onChange={(margin) => updateLayout(project.id, { margin })} />
          <Range label="Corners" max={200} value={layout.radius} onChange={(radius) => updateLayout(project.id, { radius })} />
        </>
      ) : (
        <p className="hint">Set how many photos you have, pick a layout, then tap a spot to fill it.</p>
      )}
      {naming === null ? (
        <button className="secondary block" onClick={() => setNaming(project.name)}>
          {savedAs ? `Saved "${savedAs}"` : 'Save this look as a template'}
        </button>
      ) : (
        <div className="row">
          <input
            className="field"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            placeholder="Template name"
            enterKeyHint="done"
            onKeyDown={(e) => e.key === 'Enter' && saveTemplate()}
          />
          <button className="pill-btn" onClick={saveTemplate}>Save</button>
        </div>
      )}
    </>
  )
}
