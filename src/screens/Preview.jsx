import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import LinkSheet from '../components/LinkSheet'
import { renderFrames } from '../lib/render'
import { frameH } from '../lib/scene'
import { canShareFiles, downloadFile, downloadZip, shareFiles, toFiles } from '../lib/share'
import { getState } from '../lib/store'
import { ensureLocal, photoIdsOf } from '../lib/sync'

// Full-screen preview of the finished collage. What you see here is the
// actual JPEG that gets shared (older projects with several frames show each).
export default function Preview({ project, onClose }) {
  const [files, setFiles] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(null)
  const scroller = useRef(null)

  useEffect(() => {
    let cancelled = false
    // Photos this device only holds small copies of are fetched in full first.
    ensureLocal(photoIdsOf(project))
      .then((ok) => {
        if (!ok) throw new Error('Some photos could not be downloaded. Check your connection and try again.')
        return renderFrames(project, getState().images, (p) => !cancelled && setProgress(p))
      })
      .then((blobs) => !cancelled && setFiles(toFiles(blobs, project.name)))
      .catch((e) => !cancelled && setError(e.message || 'Could not render the frames'))
    return () => {
      cancelled = true
    }
    // Render once for the project as it was when the preview opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const urls = useMemo(() => files?.map((f) => URL.createObjectURL(f)) ?? [], [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  const shareable = useMemo(() => !!files && canShareFiles(files), [files])

  const run = (fn) => async () => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    }
    setBusy(false)
  }
  const share = run(() => shareFiles(files))
  const single = project.frames === 1
  const zip = run(() => (single ? downloadFile(files[0]) : downloadZip(files, project.name)))
  const saveLabel = single ? 'Download image' : 'Download as zip'

  // A link to the finished frames. Every render gets fresh ids, so updating
  // the link replaces all of them.
  const shareLink = () => {
    const stamp = Date.now().toString(36)
    setLinking({
      kind: 'carousel',
      sourceId: project.id,
      title: project.name,
      uploads: files.map((f, i) => ({ id: `${stamp}-${i}`, ready: true, blob: f, name: f.name, width: 1080, height: frameH(project) })),
      stale: (share) => new Date(share.updated_at).getTime() < project.updatedAt,
    })
  }

  const onScroll = () => {
    const el = scroller.current
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="preview">
      <header className="topbar">
        <button className="icon-btn" onClick={onClose} aria-label="Close preview">
          <Icon name="close" />
        </button>
        <div className="preview-title">{files && !single ? `${index + 1} of ${files.length}` : 'Preview'}</div>
        <span className="topbar-spacer" />
      </header>

      <div className="preview-body">
        {files ? (
          <>
            <div className="carousel" ref={scroller} onScroll={onScroll} style={{ '--ratio': 1080 / frameH(project) }}>
              {urls.map((u, i) => (
                <img key={u} src={u} alt={`Frame ${i + 1}`} draggable={false} />
              ))}
            </div>
            {!single && (
              <div className="dots" aria-hidden="true">
                {urls.map((u, i) => (
                  <i key={u} className={i === index ? 'on' : ''} />
                ))}
              </div>
            )}
          </>
        ) : (
          !error && (
            <div className="rendering">
              <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <span>Rendering</span>
            </div>
          )
        )}
        {error && <p className="preview-error" role="alert">{error}</p>}
      </div>

      <footer className="preview-actions">
        {shareable ? (
          <>
            <button className="primary block" onClick={share} disabled={busy}>
              {single ? 'Share image' : `Share ${files.length} frames`}
            </button>
            <div className="btn-pair">
              <button className="text-btn" onClick={shareLink} disabled={busy}>Share link</button>
              <button className="text-btn" onClick={zip} disabled={busy}>{saveLabel}</button>
            </div>
          </>
        ) : (
          <>
            <button className="primary block" onClick={zip} disabled={!files || busy}>
              {saveLabel}
            </button>
            <button className="text-btn" onClick={shareLink} disabled={!files || busy}>Share link</button>
          </>
        )}
      </footer>
      <LinkSheet target={linking} onClose={() => setLinking(null)} />
    </div>
  )
}
