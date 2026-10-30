import { useEffect, useState } from 'react'
import Icon from './Icon'
import PeoplePicker from './PeoplePicker'
import Sheet from './Sheet'
import { sendAlbumPhoto, startChat } from '../lib/chat'
import { useCloud } from '../lib/cloud'
import { usePeople } from '../lib/people'
import { canShareFiles, downloadFile, shareFiles } from '../lib/share'

// Sharing one photo, from any album, secret ones included:
// - Send in Hugpix: into a chat with the people chosen.
// - Share to other apps: the phone's own share sheet (Messages, WhatsApp,
//   email), with the photo itself and no link; a computer saves it instead.
// - Add to another album: the same photo, in one more album.
// - A link: as before, a page anyone with the link can open. From a secret
//   album it asks first, since the photo is then no longer only its people's.
// The photo's file is got ready as the sheet opens, so the phone's share
// sheet opens straight from the tap (phones refuse it after a wait).
export default function PhotoShareSheet({ open, onClose, image, secret, canSend, canLinkIt, onLink, onToAlbum, fileOf, onDone }) {
  const { features, session } = useCloud()
  const people = usePeople()
  const me = session?.user.id
  const [mode, setMode] = useState('menu') // 'menu' | 'send' | 'link'
  const [file, setFile] = useState(null)
  const [chosen, setChosen] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !image) return
    let live = true
    fileOf(image).then((f) => live && setFile(f)).catch(() => live && setError('This photo could not be got ready to share.'))
    return () => {
      live = false
    }
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toApps = async () => {
    if (!file) return
    setError(null)
    try {
      if (canShareFiles([file])) {
        if (await shareFiles([file])) onClose()
      } else {
        downloadFile(file)
        onDone('Saved to your Downloads folder')
        onClose()
      }
    } catch (e) {
      setError(e.message || 'Could not share this photo.')
    }
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const chat = await startChat(chosen)
      await sendAlbumPhoto(chat, image)
      const names = chosen.map((id) => (people.find((p) => p.id === id)?.name ?? 'Someone').split(' ')[0])
      onDone(`Sent to ${names.join(', ')}`)
      onClose()
    } catch (e) {
      setError(e.message || 'Could not send this photo.')
    }
    setBusy(false)
  }

  const shareable = !file || canShareFiles([file])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'send' ? 'Send in Hugpix' : mode === 'link' ? 'Share a link?' : 'Share this photo'}
      modal
    >
      {mode === 'menu' && (
        <ul className="layer-list share-ways">
          {features.messages && canSend && (
            <li>
              <button className="layer-pick share-way" onClick={() => setMode('send')}>
                <span className="share-way-icon"><Icon name="comment" size={20} /></span>
                <span className="share-way-text">
                  <b>Send in Hugpix</b>
                  <small>Into a chat with the people you choose</small>
                </span>
              </button>
            </li>
          )}
          <li>
            <button className="layer-pick share-way" onClick={toApps} disabled={!file}>
              <span className="share-way-icon"><Icon name={shareable ? 'share' : 'download'} size={20} /></span>
              <span className="share-way-text">
                <b>{shareable ? 'Share to other apps' : 'Save to this device'}</b>
                <small>{!file ? 'Getting the photo ready' : shareable ? 'Messages, WhatsApp, email and more' : 'Then attach it anywhere'}</small>
              </span>
            </button>
          </li>
          <li>
            <button className="layer-pick share-way" onClick={onToAlbum}>
              <span className="share-way-icon"><Icon name="photos" size={20} /></span>
              <span className="share-way-text">
                <b>Add to another album</b>
                <small>Keep it in more than one album</small>
              </span>
            </button>
          </li>
          {canLinkIt && (
            <li>
              <button className="layer-pick share-way" onClick={() => (secret ? setMode('link') : onLink())}>
                <span className="share-way-icon"><Icon name="link" size={20} /></span>
                <span className="share-way-text">
                  <b>Share a link</b>
                  <small>A page anyone with the link can open</small>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      {mode === 'send' && (
        <>
          <PeoplePicker people={people.filter((p) => p.id !== me)} value={chosen} onChange={setChosen} placeholder="Who to? Type a name" />
          {secret && <p className="note">This photo is in a secret album: the people you send it to will see it, even if they are not in the album.</p>}
          <button className="primary block" disabled={!chosen.length || busy} onClick={send}>
            {busy ? 'Sending…' : 'Send'}
          </button>
          <button className="text-btn" onClick={() => setMode('menu')} disabled={busy}>Back</button>
        </>
      )}

      {mode === 'link' && (
        <>
          <p className="hint">
            This photo is in a secret album. A link lets anyone who has it see this one photo, without signing in, and it shows in
            the family's list of links in Settings.
          </p>
          <button className="primary block" onClick={onLink}>Make a link anyway</button>
          <button className="text-btn" onClick={() => setMode('menu')}>Back</button>
        </>
      )}

      {error && <p className="preview-error" role="alert">{error}</p>}
    </Sheet>
  )
}
