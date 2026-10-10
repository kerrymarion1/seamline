import { memo, useContext } from 'react'
import { backgroundStyle, normalizeBackground, photoCover } from '../lib/backgrounds'
import { cellImageBox, cellRect } from '../lib/cells'
import Icon from './Icon'
import { fontOf, layerSize, LINE_HEIGHT, photoDecor, textDecor } from '../lib/fonts'
import { FontsContext } from '../lib/fontsContext'
import { frameH, sceneWidth } from '../lib/scene'
import { shapeUrl } from '../lib/shapes'
import { useStore } from '../lib/store'

// CSS box for a layer at a given display scale (scene px -> screen px).
export function layerBox(layer, scale) {
  const { w, h } = layerSize(layer)
  return {
    width: w * scale,
    height: h * scale,
    transform: `translate3d(${(layer.x - w / 2) * scale}px, ${(layer.y - h / 2) * scale}px, 0) rotate(${layer.rotation}deg)`,
  }
}

const shadowCss = (s, scale, spread = 0) =>
  `0 ${s.y * scale}px ${s.blur * scale}px ${spread * scale}px ${s.color}`

const LayerView = memo(function LayerView({ layer, scale, image }) {
  useContext(FontsContext) // re-measure text when fonts arrive
  // A locked layer lets taps and drags fall through to whatever is beneath it.
  const box = { ...layerBox(layer, scale), pointerEvents: layer.locked ? 'none' : undefined }

  if (layer.type === 'text') {
    const f = fontOf(layer.font)
    const d = textDecor(layer)
    return (
      <div
        className="layer layer-text"
        data-layer-id={layer.id}
        style={{
          ...box,
          fontFamily: f.family,
          fontWeight: f.weight,
          fontSize: layer.size * scale,
          lineHeight: LINE_HEIGHT,
          color: layer.color,
          textAlign: layer.align,
          letterSpacing: `${layer.spacing ?? 0}em`,
          WebkitTextStroke: d.outline ? `${d.outline.width * scale}px ${d.outline.color}` : undefined,
          paintOrder: 'stroke fill',
          textShadow: d.shadow ? `0 ${d.shadow.y * scale}px ${d.shadow.blur * scale}px ${d.shadow.color}` : undefined,
          background: d.pill?.color,
          borderRadius: d.pill ? d.pill.radius * scale : undefined,
          boxShadow: d.pill ? `0 0 0 ${d.pill.pad * scale}px ${d.pill.color}` : undefined,
        }}
      >
        {layer.text}
      </div>
    )
  }

  if (layer.type === 'shape') {
    return (
      <div className="layer" data-layer-id={layer.id} style={box}>
        <img src={shapeUrl(layer)} alt="" draggable={false} />
      </div>
    )
  }

  const d = photoDecor(layer)
  const shadows = [
    d.border && `0 0 0 ${d.border * scale}px #fff`,
    d.shadow && shadowCss(d.shadow, scale, d.border),
  ].filter(Boolean)
  return (
    <div className="layer" data-layer-id={layer.id} style={{ ...box, boxShadow: shadows.join(', ') || undefined }}>
      {image && <img src={image.previewUrl} alt="" draggable={false} />}
    </div>
  )
})

// One collage cell: a rounded window with its photo cropped to fill.
function CellView({ cell, project, scale, image, drop }) {
  const rect = cellRect(cell, project)
  const box = image && cellImageBox(cell, rect, image)
  return (
    <div
      className={`cell ${image ? '' : 'empty'} ${drop ? 'drop' : ''}`}
      data-cell-id={cell.id}
      style={{
        width: rect.w * scale,
        height: rect.h * scale,
        transform: `translate3d(${rect.x * scale}px, ${rect.y * scale}px, 0)`,
        borderRadius: Math.min(project.layout?.radius ?? 0, rect.w / 2, rect.h / 2) * scale,
      }}
    >
      {image ? (
        <img
          src={image.previewUrl}
          alt=""
          draggable={false}
          style={{
            width: box.w * scale,
            height: box.h * scale,
            transform: `translate3d(${box.left * scale}px, ${box.top * scale}px, 0)`,
          }}
        />
      ) : (
        rect.w * scale > 28 && <Icon name="plus" size={Math.min(22, rect.w * scale * 0.4)} />
      )}
    </div>
  )
}

// A photo used as the background: stretched to cover the whole strip, blurred
// and dimmed so whatever sits on top stays readable.
function BackgroundPhoto({ bg, image, W, H, scale }) {
  const r = photoCover(bg, image, W, H)
  return (
    <>
      <img
        className="bg-photo"
        src={image.previewUrl}
        alt=""
        draggable={false}
        style={{
          width: r.w * scale,
          height: r.h * scale,
          transform: `translate3d(${r.x * scale}px, ${r.y * scale}px, 0)`,
          filter: bg.blur ? `blur(${bg.blur * scale}px)` : undefined,
        }}
      />
      {bg.dim > 0 && <i className="bg-dim" style={{ background: `rgba(0, 0, 0, ${bg.dim})` }} />}
    </>
  )
}

// The whole carousel strip: background, collage cells, then free layers.
export default function StripView({ project, scale, dropCellId }) {
  const images = useStore((s) => s.images)
  const bg = normalizeBackground(project.background)
  const W = sceneWidth(project.frames)
  const H = frameH(project)
  return (
    <div className="strip" style={{ width: W * scale, height: H * scale, ...backgroundStyle(bg, scale) }}>
      {bg.type === 'photo' && images[bg.imageId] && (
        <BackgroundPhoto bg={bg} image={images[bg.imageId]} W={W} H={H} scale={scale} />
      )}
      {(project.cells ?? []).map((c) => (
        <CellView key={c.id} cell={c} project={project} scale={scale} image={images[c.imageId]} drop={c.id === dropCellId} />
      ))}
      {project.layers.map((l) => (
        <LayerView key={l.id} layer={l} scale={scale} image={images[l.imageId]} />
      ))}
    </div>
  )
}
