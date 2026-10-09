import { memo, useContext } from 'react'
import { backgroundStyle } from '../lib/backgrounds'
import { cellImageBox, cellRect } from '../lib/cells'
import Icon from './Icon'
import { fontOf, layerSize, LINE_HEIGHT } from '../lib/fonts'
import { FontsContext } from '../lib/fontsContext'
import { frameH, sceneWidth } from '../lib/scene'
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

const LayerView = memo(function LayerView({ layer, scale, image }) {
  useContext(FontsContext) // re-measure text when fonts arrive
  const box = layerBox(layer, scale)

  if (layer.type === 'text') {
    const f = fontOf(layer.font)
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
        }}
      >
        {layer.text}
      </div>
    )
  }

  return (
    <div className="layer" data-layer-id={layer.id} style={box}>
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

// The whole carousel strip: background, collage cells, then free layers.
export default function StripView({ project, scale, dropCellId }) {
  const images = useStore((s) => s.images)
  return (
    <div
      className="strip"
      style={{
        width: sceneWidth(project.frames) * scale,
        height: frameH(project) * scale,
        ...backgroundStyle(project.background, scale),
      }}
    >
      {(project.cells ?? []).map((c) => (
        <CellView key={c.id} cell={c} project={project} scale={scale} image={images[c.imageId]} drop={c.id === dropCellId} />
      ))}
      {project.layers.map((l) => (
        <LayerView key={l.id} layer={l} scale={scale} image={images[l.imageId]} />
      ))}
    </div>
  )
}
