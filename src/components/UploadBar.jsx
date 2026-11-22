import { useUploads } from '../lib/cloud'

// A small bar near the foot of every page while photos and videos go up
// (cloud.js, ensurePhotos), and a moment of "3 photos uploaded" once they're
// all there. A phone stops uploading when the app is put away, so on a phone
// it also asks for Hugpix to be kept open.
export default function UploadBar() {
  const now = useUploads()
  if (!now) return null
  const pct = Math.round(now.fraction * 100)
  const label = now.finished ? doneOf(now) : labelOf(now)
  return (
    <div
      className={`upload-bar ${now.finished ? 'finished' : ''}`}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}
    >
      <div className="upload-line">
        <b>{label}</b>
        <span>{pct}%</span>
      </div>
      <span className="bar"><i style={{ width: `${pct}%` }} /></span>
      {!now.finished && <small className="upload-keep">Keep Hugpix open until it’s done</small>}
    </div>
  )
}

// 'photo', 'video', or null for a mix of both.
const kindOf = ({ total, videos }) => (videos === total ? 'video' : videos === 0 ? 'photo' : null)

// "Uploading a video", "Uploading photo 3 of 12", or "Uploading 3 of 12" for a mix.
function labelOf(now) {
  const kind = kindOf(now)
  if (now.total === 1) return `Uploading a ${kind}`
  const at = `${Math.min(now.done + 1, now.total)} of ${now.total}`
  return kind ? `Uploading ${kind} ${at}` : `Uploading ${at}`
}

// "Video uploaded", "3 photos uploaded", or "All 4 uploaded" for a mix.
function doneOf(now) {
  const kind = kindOf(now)
  if (now.total === 1) return `${kind === 'video' ? 'Video' : 'Photo'} uploaded`
  return kind ? `${now.total} ${kind}s uploaded` : `All ${now.total} uploaded`
}
