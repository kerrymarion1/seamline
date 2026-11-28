import { useEffect, useRef, useState } from 'react'
import PeoplePicker from './PeoplePicker'
import Sheet from './Sheet'
import { sendMessage, startChat } from '../lib/chat'
import { fetchMedia, useCloud } from '../lib/cloud'
import { holidayNow } from '../lib/holidays'
import { importFile } from '../lib/images'
import { usePeople } from '../lib/people'
import { canShareFiles, downloadFile, shareFiles } from '../lib/share'

// A holiday card from one photo: the photo in a frame, the holiday's words in
// its own lettering, a line under them, and the season's love sticker in the
// corner. Drawn on a canvas (so what is seen is what is sent), then sent in
// Hugpix as a photo in a chat, or to the phone's share sheet (a computer saves
// it). `image` is a photo record on this device; `holiday` the holiday's id,
// else today's, else an everyday card.

const FRAMES = {
  gold: { name: 'Gold', paper: '#f7f1e3', line: '#c9a04a', ink: '#7a1420', soft: '#3b2b1e' },
  snow: { name: 'Snow', paper: '#eef4f7', line: '#9cc3d6', ink: '#1f4f6b', soft: '#2a3a44' },
  harvest: { name: 'Harvest', paper: '#f5e9d6', line: '#b5652b', ink: '#8a3b12', soft: '#4a2a14' },
  night: { name: 'Night', paper: '#1d1228', line: '#ff7518', ink: '#ff9a3c', soft: '#e6dcef' },
  plain: { name: 'Plain', paper: '#ffffff', line: null, ink: '#2b2622', soft: '#5a524b' },
}
// Each holiday's words, lettering (fonts loaded in main.jsx) and frame.
const LOOKS = {
  christmas: { words: 'Merry Christmas', font: "700 PXpx 'Mountains of Christmas', serif", frame: 'gold' },
  thanksgiving: { words: 'Happy Thanksgiving', font: "400 PXpx 'Lobster', serif", frame: 'harvest' },
  halloween: { words: 'Happy Halloween', font: "400 PXpx 'Creepster', serif", frame: 'night' },
  newyear: { words: 'Happy New Year', font: "400 PXpx 'Bebas Neue', sans-serif", frame: 'gold' },
  july4: { words: 'Happy Fourth of July', font: "400 PXpx 'Bebas Neue', sans-serif", frame: 'plain' },
  everyday: { words: 'With love', font: "italic 400 PXpx 'Instrument Serif', serif", frame: 'plain' },
}
const W = 1200
const H = 1600
const PAD = 64

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

// The photo as something a canvas may draw and still save: the file on this
// phone, else fetched afresh from storage (a copy the browser kept for an
// <img> can't be drawn and saved), else its small copy.
async function photoOf(image) {
  if (image.blob) return { src: URL.createObjectURL(image.blob), own: true }
  if (image.url?.startsWith('blob:')) return { src: image.url }
  try {
    const res = await fetchMedia(image.url)
    if (res.ok) return { src: URL.createObjectURL(await res.blob()), own: true }
  } catch {
    // Offline: the small copy will do.
  }
  return { src: image.previewUrl }
}

// The card as a JPEG blob.
async function drawCard({ image, theme, look, frame, words, line }) {
  const f = FRAMES[frame]
  const font = (px) => look.font.replace('PX', px)
  await Promise.all([document.fonts.load(font(120)), document.fonts.load("400 60px 'Instrument Serif'")]).catch(() => {})
  const source = await photoOf(image)
  const [photo, sticker] = await Promise.all([
    loadImage(source.src).finally(() => source.own && setTimeout(() => URL.revokeObjectURL(source.src), 0)),
    loadImage(`/reactions/${theme}-love.webp`).catch(() => null),
  ])
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  g.fillStyle = f.paper
  g.fillRect(0, 0, W, H)
  if (f.line) {
    g.strokeStyle = f.line
    g.lineWidth = 6
    g.strokeRect(26, 26, W - 52, H - 52)
  }
  // The photo, filling its window.
  const box = { x: PAD, y: PAD, w: W - PAD * 2, h: 1010 }
  const k = Math.max(box.w / photo.width, box.h / photo.height)
  const sw = box.w / k
  const sh = box.h / k
  g.save()
  g.beginPath()
  g.roundRect(box.x, box.y, box.w, box.h, 22)
  g.clip()
  g.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, box.x, box.y, box.w, box.h)
  g.restore()
  // The words, as large as fit across.
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  let px = 150
  g.font = font(px)
  while (px > 60 && g.measureText(words).width > W - PAD * 2 - 40) g.font = font((px -= 6))
  g.fillStyle = f.ink
  g.fillText(words, W / 2, box.y + box.h + 120 + px * 0.25)
  g.font = "400 60px 'Instrument Serif', serif"
  g.fillStyle = f.soft
  g.fillText(line, W / 2, H - PAD - 70, W - PAD * 2)
  if (sticker) g.drawImage(sticker, W - PAD - 230, box.y + box.h - 190, 250, 250)
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92))
}

export default function CardMaker({ open, image, holiday, onClose, onDone }) {
  const { session } = useCloud()
  const people = usePeople()
  const me = session?.user.id
  const theme = holiday ?? holidayNow()?.id ?? 'everyday'
  const look = LOOKS[theme] ?? LOOKS.everyday
  const [frame, setFrame] = useState(look.frame)
  const [words, setWords] = useState(look.words)
  const [line, setLine] = useState('love from all of us')
  const [preview, setPreview] = useState(null) // { url, blob }
  const [mode, setMode] = useState('make') // 'make' | 'send'
  const [chosen, setChosen] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const round = useRef(0)

  // A fresh start each time it opens.
  useEffect(() => {
    if (!open) return
    setFrame(look.frame)
    setWords(look.words)
    setMode('make')
    setChosen(people.filter((p) => p.id !== me).map((p) => p.id))
    setError(null)
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Drawn again a moment after each change.
  useEffect(() => {
    if (!open || !image) return
    const mine = ++round.current
    const t = setTimeout(async () => {
      try {
        const blob = await drawCard({ image, theme, look, frame, words: words.trim() || look.words, line: line.trim() })
        if (mine !== round.current) return
        setPreview((was) => {
          if (was) URL.revokeObjectURL(was.url)
          return { url: URL.createObjectURL(blob), blob }
        })
      } catch {
        if (mine === round.current) setError('This photo could not be made into a card.')
      }
    }, 180)
    return () => clearTimeout(t)
    // `look` follows from the holiday.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, image, theme, frame, words, line])

  const file = () => new File([preview.blob], `${(words.trim() || 'card').replace(/[^\w ]+/g, '').replace(/ +/g, '-').toLowerCase()}.jpg`, { type: 'image/jpeg' })

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const chat = await startChat(chosen)
      const record = await importFile(file())
      await sendMessage(chat, { image: record })
      onDone?.(`Card sent to ${chosen.length === 1 ? (people.find((p) => p.id === chosen[0])?.name ?? 'them').split(' ')[0] : `${chosen.length} people`}`)
      onClose()
    } catch (e) {
      setError(e.message || 'The card could not be sent.')
    }
    setBusy(false)
  }
  const elsewhere = async () => {
    const f = file()
    try {
      if (canShareFiles([f])) {
        if (await shareFiles([f])) onClose()
      } else {
        downloadFile(f)
        onDone?.('Card saved to your Downloads folder')
        onClose()
      }
    } catch (e) {
      setError(e.message || 'The card could not be shared.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'send' ? 'Send the card' : 'Make a card'} modal>
      <div className="card-preview">
        {preview ? <img src={preview.url} alt="The card" /> : <i className="spinner" />}
      </div>
      {mode === 'make' ? (
        <>
          <div className="label">Frame</div>
          <div className="chips" role="radiogroup" aria-label="Frame">
            {Object.entries(FRAMES).map(([id, f]) => (
              <button key={id} role="radio" aria-checked={frame === id} className={`chip small card-frame ${frame === id ? 'on' : ''}`} onClick={() => setFrame(id)}>
                <span aria-hidden="true" style={{ background: f.paper, boxShadow: f.line ? `inset 0 0 0 2px ${f.line}` : 'inset 0 0 0 1px #ccc' }} />
                {f.name}
              </button>
            ))}
          </div>
          <label className="card-field">
            <span className="label">Words</span>
            <input className="field" value={words} onChange={(e) => setWords(e.target.value)} maxLength={40} />
          </label>
          <label className="card-field">
            <span className="label">Under them</span>
            <input className="field" value={line} onChange={(e) => setLine(e.target.value)} maxLength={60} placeholder="love from all of us" />
          </label>
          {error && <p className="preview-error">{error}</p>}
          <button className="primary block" disabled={!preview} onClick={() => setMode('send')}>Send in Hugpix</button>
          <button className="secondary block" disabled={!preview} onClick={elsewhere}>{canShareFiles([new File([''], 'x.jpg', { type: 'image/jpeg' })]) ? 'Share to other apps' : 'Save it'}</button>
        </>
      ) : (
        <>
          <PeoplePicker people={people.filter((p) => p.id !== me)} value={chosen} onChange={setChosen} placeholder="Who to? Type a name" />
          {error && <p className="preview-error">{error}</p>}
          <button className="primary block" disabled={!chosen.length || busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
          <button className="text-btn" onClick={() => setMode('make')} disabled={busy}>Back</button>
        </>
      )}
    </Sheet>
  )
}
