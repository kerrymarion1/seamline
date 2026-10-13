import { useRef, useState, useSyncExternalStore } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import { createBackup, restoreBackup } from '../lib/backup'
import {
  expiryText, requestPasswordReset, setAutoSync, setNewPassword, shareUrl, signIn, signOut, stopShare, STORAGE_LIMIT,
  storageUsed, useCloud, VIDEO_LIMIT, videoStorageUsed,
} from '../lib/cloud'
import StripView from '../components/StripView'
import { deletePreset, setImportAlbum, useStore } from '../lib/store'
import { getSyncStatus, onSyncStatus, syncNow } from '../lib/sync'

const mb = (bytes) => (bytes < 1024 ** 2 ? `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`)

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password, remember)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const forgot = async () => {
    setError(null)
    setSent(null)
    if (!email.trim()) return setError('Type your email above first, then tap "Forgot password?" again.')
    setBusy(true)
    try {
      await requestPasswordReset(email)
      setSent(`If ${email.trim()} has an account, a reset link is on its way. Open it on this device.`)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  // The names and autocomplete hints are what let the browser offer to save
  // the password and fill it in next time.
  return (
    <form className="panel" onSubmit={submit} autoComplete="on">
      <h2>Sign in</h2>
      <p className="hint">
        Use your Plait email and password. Signing in opens the app, keeps your albums and collages in step on every device and
        lets you share links.
      </p>
      <input
        className="field" type="email" name="email" id="seamline-email" autoComplete="username" inputMode="email"
        placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
      />
      <div className="password-row">
        <input
          className="field" type={show ? 'text' : 'password'} name="password" id="seamline-password"
          autoComplete="current-password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        <button type="button" className="pill-btn" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>
          Keep me signed in
          <small>{remember ? 'Stays signed in on this device until you sign out.' : 'Signs out when the app is closed.'}</small>
        </span>
      </label>
      {error && <p className="preview-error" role="alert">{error}</p>}
      {sent && <p className="note" role="status">{sent}</p>}
      <button className="primary block" disabled={busy}>{busy ? 'Working…' : 'Sign in'}</button>
      <button type="button" className="text-btn" onClick={forgot} disabled={busy}>Forgot password?</button>
    </form>
  )
}

// Shown after following the link in a password-reset email.
export function NewPassword() {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setNewPassword(password)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form className="panel" onSubmit={submit} autoComplete="on">
      <h2>Choose a new password</h2>
      <p className="hint">This changes the password for your account everywhere it is used, including Plait.</p>
      <div className="password-row">
        <input
          className="field" type={show ? 'text' : 'password'} name="new-password" autoComplete="new-password"
          placeholder="New password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        <button type="button" className="pill-btn" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {error && <p className="preview-error" role="alert">{error}</p>}
      <button className="primary block" disabled={busy || password.length < 8}>{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  )
}

function SyncPanel({ cloud }) {
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus)
  const projects = useStore((s) => s.projects.length)
  const albums = useStore((s) => s.albums.length)
  if (!cloud.canSync) {
    return (
      <section className="panel">
        <h2>Sync between devices</h2>
        <p className="hint">Not switched on for this account yet. Links still work.</p>
      </section>
    )
  }
  const when = status.lastSync ? new Date(status.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
  return (
    <section className="panel">
      <h2>Sync between devices</h2>
      <p className="hint">
        {status.fetching
          ? `Downloading photo ${status.fetching.done + 1} of ${status.fetching.total}`
          : status.state === 'syncing'
            ? 'Syncing…'
            : when
              ? `Up to date as of ${when}. ${projects} project${projects === 1 ? '' : 's'} and ${albums} album${albums === 1 ? '' : 's'}.`
              : 'Waiting for the first sync.'}
      </p>
      <p className="note">
        Everyone signed in to this library sees and can edit the same projects and albums. If two devices change the
        same one, the most recent save wins.
      </p>
      {status.error && <p className="preview-error" role="alert">Sync problem: {status.error}</p>}
      <button className="secondary block" onClick={syncNow} disabled={status.state === 'syncing'}>Sync now</button>
    </section>
  )
}

const LAST_BACKUP = 'seamline:lastBackup'
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Backup() {
  const projects = useStore((s) => s.projects)
  const albums = useStore((s) => s.albums)
  const images = useStore((s) => s.images)
  const fileInput = useRef(null)
  const [progress, setProgress] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [last, setLast] = useState(() => localStorage.getItem(LAST_BACKUP))
  // Only what is held on this device: a video that plays from its online copy has no file here.
  const list = Object.values(images).filter((i) => i.blob)
  const size = list.reduce((n, i) => n + i.blob.size, 0)

  const run = async (fn) => {
    setError(null)
    setMessage(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    }
    setProgress(null)
  }

  const saveBackup = () =>
    run(async () => {
      setProgress('Preparing…')
      const zip = await createBackup((i, n) => setProgress(`Packing photo ${i + 1} of ${n}`))
      const stamp = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(zip)
      const a = document.createElement('a')
      a.href = url
      a.download = `seamline-backup-${stamp}.zip`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      const when = new Date().toISOString()
      localStorage.setItem(LAST_BACKUP, when)
      setLast(when)
      setMessage('Backup saved to your Downloads folder.')
    })

  const restore = (file) =>
    run(async () => {
      setProgress('Reading backup…')
      const added = await restoreBackup(file, (i, n) => setProgress(`Restoring photo ${i + 1} of ${n}`))
      setMessage(
        added.projects + added.albums + added.photos === 0
          ? 'Everything in that backup is already on this device.'
          : `Restored ${plural(added.projects, 'project')}, ${plural(added.albums, 'album')} and ${plural(added.photos, 'photo')}.`,
      )
    })

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="hint">
        {plural(projects.length, 'project')}, {plural(albums.length, 'album')} and {plural(list.length, 'photo')} on this
        device, about {mb(size)}.
      </p>
      <p className="note">
        {last ? `Last backup ${new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'Not backed up yet.'}{' '}
        Everything lives only on this phone until you save a backup file.
      </p>
      {progress ? (
        <p className="hint"><i className="spinner inline" /> {progress}</p>
      ) : (
        <>
          <button className="primary block" onClick={saveBackup} disabled={!projects.length && !albums.length}>
            <Icon name="download" size={20} /> Save backup file
          </button>
          <button className="secondary block" onClick={() => fileInput.current.click()}>Restore from a backup</button>
        </>
      )}
      {message && <p className="note">{message}</p>}
      {error && <p className="preview-error" role="alert">{error}</p>}
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files[0]
          e.target.value = ''
          if (file) restore(file)
        }}
      />
    </section>
  )
}

function Library() {
  const presets = useStore((s) => s.presets)
  const albums = useStore((s) => s.albums)
  const importAlbum = useStore((s) => s.importAlbum)
  const known = importAlbum === 'auto' || importAlbum === 'off' || albums.some((a) => a.id === importAlbum)
  return (
    <>
      <section className="panel">
        <h2>Photos added from your phone</h2>
        <p className="hint">Photos you pick while editing can also be kept in an album, so they are there next time.</p>
        <select className="field" value={known ? importAlbum : 'auto'} onChange={(e) => setImportAlbum(e.target.value)}>
          <option value="auto">Keep them in "Imported"</option>
          {albums.filter((a) => a.name !== 'Imported').map((a) => (
            <option key={a.id} value={a.id}>Keep them in "{a.name}"</option>
          ))}
          <option value="off">Do not keep them in an album</option>
        </select>
      </section>

      <section className="panel">
        <h2>Your templates</h2>
        {presets.length === 0 && (
          <p className="hint">None yet. In a project, open Layouts and choose "Save this look as a template".</p>
        )}
        {presets.map((t) => (
          <div key={t.id} className="share-row">
            <span className="preset-art"><StripView project={t} scale={40 / t.frameH} /></span>
            <div>
              <h3>{t.name}</h3>
              <p>{t.frames > 1 && `${t.frames} frames · `}{t.cells.length} spot{t.cells.length === 1 ? '' : 's'}</p>
            </div>
            <button className="icon-btn" onClick={() => deletePreset(t.id)} aria-label={`Delete template ${t.name}`}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
      </section>
    </>
  )
}

export default function Settings() {
  const cloud = useCloud()
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const used = storageUsed(cloud.shares)
  const videoUsed = videoStorageUsed(cloud.shares)
  const photos = new Set(cloud.shares.flatMap((s) => s.items.map((it) => it.path))).size

  const copy = async (share) => {
    await navigator.clipboard.writeText(shareUrl(share)).catch(() => {})
    setCopied(share.id)
    setTimeout(() => setCopied(null), 1800)
  }
  const stop = (share) => stopShare(share).catch((e) => setError(e.message))

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="preview-title">Settings</div>
        <span className="topbar-spacer" />
      </header>

      <main className="settings-body">
        <Backup />
        <Library />
        {!cloud.configured ? (
          <section className="panel">
            <h2>Shared links</h2>
            <p className="hint">Links are not set up on this copy of the app.</p>
          </section>
        ) : cloud.loading ? (
          <section className="panel"><p className="hint"><i className="spinner inline" /> Checking your account</p></section>
        ) : cloud.recovering ? (
          <NewPassword />
        ) : !cloud.session ? (
          <SignIn />
        ) : (
          <>
            <section className="panel">
              <h2>Account</h2>
              <p className="hint">Signed in as {cloud.session.user.email}</p>
              {!cloud.uploader && <p className="note warn">This account has not been given access to a library.</p>}
              <p className="note">Signing out leaves what is already on this device in place.</p>
              <button className="secondary block" onClick={signOut}>Sign out</button>
            </section>

            <SyncPanel cloud={cloud} />

            <section className="panel">
              <h2>Keep albums online</h2>
              <p className="hint">
                {cloud.autoSync
                  ? 'On. Photos you add to an album are put online in the background, so sharing an album or a photo is just a link, with no waiting.'
                  : 'Off. Photos are only put online when you create a link, which then has to wait for the upload.'}
              </p>
              <p className="note">Nobody can see an album online until you give them its link.</p>
              <button className="secondary block" onClick={() => setAutoSync(!cloud.autoSync)}>
                {cloud.autoSync ? 'Turn off' : 'Turn on'}
              </button>
            </section>

            <section className="panel">
              <h2>Storage used</h2>
              <div className="meter"><i style={{ width: `${Math.min(100, (used / STORAGE_LIMIT) * 100)}%` }} /></div>
              <p className="hint">
                {mb(used)} of 1 GB · {photos} photo{photos === 1 ? '' : 's'} online in {cloud.shares.length} link{cloud.shares.length === 1 ? '' : 's'}
              </p>
              {videoUsed > 0 && (
                <>
                  <div className="meter"><i style={{ width: `${Math.min(100, (videoUsed / VIDEO_LIMIT) * 100)}%` }} /></div>
                  <p className="hint">{mb(videoUsed)} of 10 GB · videos</p>
                </>
              )}
              <p className="note">
                The free plan pauses after a week with no activity. Links stop working while it is paused and come back
                when the project is restored in Supabase.
              </p>
            </section>

            <section className="panel">
              <h2>Active links</h2>
              {cloud.shares.length === 0 && <p className="hint">Nothing is shared. Create a link from an album or a photo.</p>}
              {cloud.shares.map((s) => (
                <div key={s.id} className="share-row">
                  <div>
                    <h3>{s.title || (s.kind === 'photo' ? 'Photo' : s.kind === 'carousel' ? 'Collage' : 'Album')}</h3>
                    <p>
                      {s.kind === 'photo' ? 'Photo' : s.kind === 'carousel' ? (s.items.length > 1 ? `Collage, ${s.items.length} frames` : 'Collage') : `${s.items.length} photos`} · {mb(s.bytes)} · {expiryText(s)}
                      {cloud.hearts.byShare[s.id] > 0 && ` · ${cloud.hearts.byShare[s.id]} ♥`}
                    </p>
                  </div>
                  <button className="pill-btn" onClick={() => copy(s)}>{copied === s.id ? 'Copied' : 'Copy'}</button>
                  <button className="icon-btn" onClick={() => stop(s)} aria-label={`Stop sharing ${s.title}`}>
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              ))}
              {error && <p className="preview-error" role="alert">{error}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
