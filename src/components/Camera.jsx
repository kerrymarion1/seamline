import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { whereAmI } from '../lib/places'

// Taking a photo or a video inside Hugpix, over the whole screen: the live
// camera, a shutter, and front and back. What was taken shows first, with
// Retake or Send; Send hands it over (`onSend(file, spot)`) to go straight
// into the album, with where the phone is (if it will say), so the photo
// lands on the map. Where the live camera isn't allowed (or a phone has none
// to give a web page), the phone's own camera opens instead.

const LONGEST = 120 // seconds of video, at most

// The kinds of video this browser can record, best first: iPhones make MP4,
// most others WebM.
function videoType() {
  const kinds = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return kinds.find((k) => window.MediaRecorder?.isTypeSupported?.(k)) ?? ''
}

const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

export default function Camera({ albumName, onSend, onClose }) {
  const view = useRef(null)
  const stream = useRef(null)
  const recorder = useRef(null)
  const chunks = useRef([])
  const native = useRef(null)
  const [mode, setMode] = useState('photo') // 'photo' | 'video'
  const [facing, setFacing] = useState('environment')
  const [failed, setFailed] = useState(null) // why the live camera can't be used
  const [recording, setRecording] = useState(0) // seconds so far, while recording
  const [taken, setTaken] = useState(null) // { file, url, spot } waiting for Send
  const [sending, setSending] = useState(false)
  const [here, setHere] = useState(null) // where the phone is, [lat, lng], once the camera is allowed
  const located = useRef(false)

  // The live camera: again when it flips, or video wants the microphone too.
  useEffect(() => {
    if (taken) return
    let live = true
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFailed('This browser can’t show the camera here.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: mode === 'video',
        })
        if (!live) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = s
        setFailed(null)
        // The camera allowed, ask once where we are, so the photo can go on the map.
        if (!located.current) {
          located.current = true
          whereAmI().then(setHere)
        }
        if (view.current) {
          view.current.srcObject = s
          view.current.play().catch(() => {})
        }
      } catch (e) {
        if (live) {
          setFailed(e.name === 'NotAllowedError'
            ? 'Hugpix wasn’t allowed to use the camera. You can allow it in your browser’s settings, or use the phone’s camera.'
            : 'The camera couldn’t be started.')
        }
      }
    }
    start()
    return () => {
      live = false
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [facing, mode, taken])

  // The recording clock, and the stop at the longest allowed.
  useEffect(() => {
    if (!recording) return
    if (recording > LONGEST) {
      stop()
      return
    }
    const t = setTimeout(() => setRecording((n) => (n ? n + 1 : 0)), 1000)
    return () => clearTimeout(t)
    // `stop` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  // Let go of a taken photo's address when it is replaced or closed.
  useEffect(() => () => taken && URL.revokeObjectURL(taken.url), [taken])

  const snap = () => {
    const v = view.current
    if (!v?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0)
    canvas.toBlob(
      (blob) => {
        canvas.width = canvas.height = 0
        if (!blob) return
        const file = new File([blob], `IMG_${stamp()}.jpg`, { type: 'image/jpeg' })
        setTaken({ file, url: URL.createObjectURL(file), spot: here })
      },
      'image/jpeg',
      0.92,
    )
  }

  const record = () => {
    if (!stream.current || !window.MediaRecorder) {
      setFailed('This browser can’t record video here. Use the phone’s camera instead.')
      return
    }
    const type = videoType()
    chunks.current = []
    const r = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined)
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      const kind = r.mimeType || type || 'video/webm'
      const blob = new Blob(chunks.current, { type: kind.split(';')[0] })
      const file = new File([blob], `VID_${stamp()}.${kind.includes('mp4') ? 'mp4' : 'webm'}`, { type: blob.type })
      setTaken({ file, url: URL.createObjectURL(file), spot: here })
    }
    r.start(1000)
    recorder.current = r
    setRecording(1)
  }
  const stop = () => {
    setRecording(0)
    if (recorder.current?.state === 'recording') recorder.current.stop()
    recorder.current = null
  }

  const send = async () => {
    setSending(true)
    try {
      await onSend(taken.file, taken.spot)
    } finally {
      setSending(false)
    }
  }

  const clock = `${Math.floor((recording - 1) / 60)}:${String(Math.max(0, recording - 1) % 60).padStart(2, '0')}`

  return (
    <div className="camera" role="dialog" aria-label="Camera">
      <header className="camera-top">
        <button className="icon-btn" onClick={() => (recording ? stop() : onClose())} aria-label="Close the camera"><Icon name="close" /></button>
        <span className="camera-where">
          {taken ? `Send to ${albumName}?` : recording ? <><i className="camera-dot" /> {clock}</> : albumName}
          {!taken && !recording && here && <i className="camera-here" aria-label="Where you are goes with the photo"><Icon name="pin" size={14} /></i>}
        </span>
        {!taken && !recording && !failed ? (
          <button className="icon-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera">
            <Icon name="rotate" />
          </button>
        ) : (
          <span className="topbar-spacer" />
        )}
      </header>

      <div className="camera-stage">
        {taken ? (
          taken.file.type.startsWith('video/') ? (
            <video src={taken.url} controls playsInline autoPlay loop />
          ) : (
            <img src={taken.url} alt="" />
          )
        ) : failed ? (
          <div className="camera-failed">
            <Icon name="photo" size={36} />
            <p>{failed}</p>
            <button className="primary" onClick={() => native.current.click()}>Use the phone’s camera</button>
          </div>
        ) : (
          <video ref={view} className={facing === 'user' ? 'mirror' : ''} playsInline muted autoPlay />
        )}
      </div>

      <footer className="camera-bottom">
        {taken ? (
          <div className="camera-choice">
            <button className="secondary" onClick={() => setTaken(null)} disabled={sending}>Retake</button>
            <button className="primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        ) : !failed && (
          <>
            <div className="camera-modes" role="radiogroup" aria-label="Photo or video">
              {['photo', 'video'].map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} disabled={!!recording}>
                  {m === 'photo' ? 'Photo' : 'Video'}
                </button>
              ))}
            </div>
            <button
              className={`shutter ${mode} ${recording ? 'recording' : ''}`}
              onClick={mode === 'photo' ? snap : recording ? stop : record}
              aria-label={mode === 'photo' ? 'Take the photo' : recording ? 'Stop recording' : 'Start recording'}
            >
              <i />
            </button>
          </>
        )}
      </footer>

      <input
        ref={native}
        type="file"
        accept={mode === 'video' ? 'video/*' : 'image/*'}
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files[0]
          e.target.value = ''
          if (file) setTaken({ file, url: URL.createObjectURL(file), spot: here })
        }}
      />
    </div>
  )
}
