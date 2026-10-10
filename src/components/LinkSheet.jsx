import { useEffect, useState } from 'react'
import { navigate } from '../App'
import {
  EXPIRY_CHOICES, expiryText, findShare, isExpired, outOfDate, rememberedPin, setExpiry, setUploadPin, shareUrl,
  stopShare, syncShare, useCloud,
} from '../lib/cloud'
import { useStore } from '../lib/store'
import Icon from './Icon'
import Sheet from './Sheet'

// Sharing for an album, a photo or a carousel: create, copy, send, update and
// remove a public link to a page that shows it. The files are never sent.
// target: { kind: 'album' | 'photo', sourceId, title, imageIds } for photos kept
// in the app, or { kind: 'carousel', sourceId, title, uploads, stale } for a
// finished carousel, where `uploads` are its exported frames. Null when closed.
export default function LinkSheet({ target, onClose }) {
  const cloud = useCloud()
  const images = useStore((s) => s.images)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [pin, setPin] = useState('')
  // Offer the PIN already on this link, else the one used last time.
  useEffect(() => {
    if (target) setPin(findShare(cloud.shares, target.kind, target.sourceId)?.upload_pin ?? rememberedPin())
    // Only when the sheet opens for something else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.sourceId])

  const share = target && findShare(cloud.shares, target.kind, target.sourceId)
  const url = share && shareUrl(share)
  const carousel = target?.kind === 'carousel'
  const stale = share && (carousel ? target.stale(share) : outOfDate(share, target.imageIds))
  const n = (carousel ? target.uploads : target?.imageIds)?.length ?? 0
  const what = carousel ? (n === 1 ? 'this image' : 'this carousel') : n === 1 ? 'this photo' : 'these photos'

  const run = async (fn) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    }
    setProgress(null)
  }

  const sync = () =>
    run(async () => {
      setProgress('Preparing…')
      await syncShare(
        { ...target, images: carousel ? target.uploads : target.imageIds.map((id) => images[id]).filter(Boolean) },
        (done, total) => setProgress(`Uploading ${done + 1} of ${total}`),
      )
    })

  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })

  const send = () =>
    run(async () => {
      try {
        await navigator.share({ title: target.title, url })
      } catch (e) {
        if (e.name !== 'AbortError') throw e
      }
    })

  const close = () => {
    setError(null)
    onClose()
  }
  const goSettings = () => {
    close()
    navigate('/settings')
  }

  return (
    <Sheet open={!!target} onClose={close} title={carousel ? 'Share by link' : target?.kind === 'photo' ? 'Share photo link' : 'Share album link'} modal>
      {!cloud.configured ? (
        <p className="hint">Links are not set up on this copy of the app.</p>
      ) : cloud.loading ? (
        <p className="hint centre"><i className="spinner inline" /> Checking your account</p>
      ) : !cloud.session ? (
        <>
          <p className="hint">Sign in once to create links that anyone can open without the app.</p>
          <button className="primary block" onClick={goSettings}>Sign in</button>
        </>
      ) : !cloud.uploader ? (
        <p className="hint">This account is not allowed to create links.</p>
      ) : progress ? (
        <p className="hint centre"><i className="spinner inline" /> {progress}</p>
      ) : share ? (
        <>
          <div className="link-box">
            <span>{url.replace(/^https?:\/\//, '')}</span>
            <button className="pill-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {typeof navigator.share === 'function' && (
            <button className="primary block" onClick={send}>
              <Icon name="link" size={20} /> Share link
            </button>
          )}
          {target.kind === 'album' && (
            <div className="visitor-adds">
              <div className="row">
                <div>
                  <div className="label">Visitors can add photos</div>
                  <div className="hint">{share.upload_pin ? `On. They need the PIN ${share.upload_pin}.` : 'Off. Only you can add to this album.'}</div>
                </div>
                {share.upload_pin && (
                  <button className="pill-btn" onClick={() => run(() => setUploadPin(share, null))}>Turn off</button>
                )}
              </div>
              <div className="row">
                <input
                  className="field pin-field"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="PIN, 4 to 8 digits"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
                <button className="pill-btn" disabled={pin.length < 4 || pin === share.upload_pin} onClick={() => run(() => setUploadPin(share, pin))}>
                  {share.upload_pin ? 'Change PIN' : 'Turn on'}
                </button>
              </div>
            </div>
          )}
          {stale && (
            <>
              <p className="note warn">The link still shows the earlier version.</p>
              <button className="secondary block" onClick={sync}>Update link</button>
            </>
          )}
          <div className="row">
            <span className={`label ${isExpired(share) ? 'expired' : ''}`}>{expiryText(share)}</span>
            {cloud.hearts.byShare[share.id] > 0 && (
              <span className="hearts inline"><Icon name="heart" size={13} /> {cloud.hearts.byShare[share.id]} favourite{cloud.hearts.byShare[share.id] === 1 ? '' : 's'}</span>
            )}
          </div>
          <div className="chips">
            {EXPIRY_CHOICES.map((c) => (
              <button key={c.label} className="chip small" onClick={() => run(() => setExpiry(share, c.days))}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="note">
            Anyone with this link can view and download {what}. Choosing a time restarts the countdown from now.
          </p>
          <button className="text-btn danger" onClick={() => run(() => stopShare(share))}>Stop sharing</button>
        </>
      ) : (
        <>
          <p className="hint">
            {carousel
              ? `Uploads ${n === 1 ? 'the finished image' : `the ${n} finished frames`} and makes a link anyone can open and swipe through, as it will look when posted.`
              : `Uploads ${n === 1 ? 'a copy of this photo' : `copies of these ${n} photos`} and makes a link anyone can open, view and download from.`}{' '}
            No app or login needed.
          </p>
          <button className="primary block" onClick={sync}>
            <Icon name="link" size={20} /> Create link
          </button>
        </>
      )}
      {error && <p className="preview-error" role="alert">{error}</p>}
    </Sheet>
  )
}
