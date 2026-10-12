import { useEffect, useLayoutEffect, useRef } from 'react'
import Icon from './Icon'

// Full-size photos side by side: swipe left or right to move between them.
// Arrow keys and on-screen arrows do the same where there is no touch screen.
// slides: [{ key, src, alt }], or for a video { key, src, poster, video: true }
export default function PhotoPager({ slides, index, onIndex }) {
  const strip = useRef(null)
  const reported = useRef(null) // the index this component last announced itself

  // Jump to the photo that was opened. Skipped when the change came from the
  // viewer's own swipe, which is already heading there.
  useLayoutEffect(() => {
    if (reported.current === index) return
    const el = strip.current
    el.scrollTo({ left: index * el.clientWidth, behavior: 'instant' })
    reported.current = index
  }, [index])

  const onScroll = () => {
    const el = strip.current
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== reported.current && i >= 0 && i < slides.length) {
      reported.current = i
      onIndex(i)
    }
  }

  const go = (step) => {
    const el = strip.current
    const i = Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth) + step))
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `go` only reads the strip, which does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length])

  return (
    <div className="viewer-body">
      <div className="viewer-strip" ref={strip} onScroll={onScroll}>
        {slides.map((s, i) => (
          <div key={s.key}>
            {/* Only the video in view gets a player; swiping away stops it. */}
            {s.video && i === index ? (
              <video src={s.src} poster={s.poster} controls playsInline preload="metadata" />
            ) : (
              <img src={s.video ? s.poster : s.src} alt={s.alt ?? ''} loading="lazy" decoding="async" draggable={false} />
            )}
          </div>
        ))}
      </div>
      {index > 0 && (
        <button className="pager-btn prev" onClick={() => go(-1)} aria-label="Previous photo">
          <Icon name="back" />
        </button>
      )}
      {index < slides.length - 1 && (
        <button className="pager-btn next" onClick={() => go(1)} aria-label="Next photo">
          <Icon name="back" />
        </button>
      )}
    </div>
  )
}
