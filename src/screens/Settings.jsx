import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { navigate } from '../App'
import AlbumPhotoPicker from '../components/AlbumPhotoPicker'
import Avatar from '../components/Avatar'
import AvatarFramer from '../components/AvatarFramer'
import { ago } from '../components/HomeLayouts'
import Icon from '../components/Icon'
import { createBackup, restoreBackup } from '../lib/backup'
import { renderEdit } from '../lib/edit'
import { celebrateAdded, setVibrateOn, vibrateOn } from '../lib/feedback'
import { setSoundOn, soundOn } from '../lib/sounds'
import {
  addInvite, answerRequest, avatarOf, deleteInvite, expiryText, fetchInvites, fetchPeople, fetchUsers, setAvatar, setRole, inviteUrl, setInviteActive, setPinned, usePinned, refreshRequests, removePerson, savePerson, setAutoSync, shareUrl, signOut, stopShare, STORAGE_LIMIT, MEDIA_LIMIT, MEDIA_WARN,
  storageUsed, getCloud, setUserName, useCloud, userName, mediaStorageUsed, viewsText,
} from '../lib/cloud'
import { refreshPeople } from '../lib/people'
import { pushStatus, turnOffPush, turnOnPush } from '../lib/push'
import { renameUploader, setImportAlbum, useStore } from '../lib/store'
import {
  COLOURS, LAYOUTS, SEASONS, setColour, setLayout, setSeason, useActiveSeason, useColour, useLayout, useSeason,
} from '../lib/theme'
import { getSyncStatus, onSyncStatus, syncNow } from '../lib/sync'
import { NewPassword, SignIn } from './SignIn'

const mb = (bytes) => (bytes < 1024 ** 2 ? `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`)

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

// The season, first thing in Settings: Auto follows the calendar (each
// season has its month, see SEASONS), or one is picked to stay on. For this device.
const monthName = (m) => new Date(2000, m, 1).toLocaleString(undefined, { month: 'long' })
const CALENDAR = SEASONS.filter((s) => s.month != null).map((s) => `${s.name} in ${monthName(s.month)}`).join(', ')

function Season() {
  const chosen = useSeason()
  const showing = useActiveSeason()
  const name = (id) => SEASONS.find((s) => s.id === id)?.name
  const hint =
    chosen === 'auto'
      ? `${CALENDAR}, everyday the rest of the year. ${showing ? `${name(showing)} is on now.` : 'Everyday for now.'}`
      : chosen === 'everyday'
        ? 'Your own colour, all year round.'
        : `${name(chosen)} stays on until you change it.`
  return (
    <section className="panel">
      <h2>Season</h2>
      <div className="season-pick" role="radiogroup" aria-label="Season">
        {SEASONS.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={chosen === s.id}
            className={`${s.id} ${chosen === s.id ? 'on' : ''}`}
            onClick={() => setSeason(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <p className="note">{hint}</p>
    </section>
  )
}

// The sound and the pulse when photos go into an album (and the message
// chime), for this device. Try it plays what adding photos does right now.
function Feedback() {
  const [sound, setSound] = useState(soundOn)
  const [vibrate, setVibrate] = useState(vibrateOn)
  const showing = useActiveSeason()
  const name = SEASONS.find((s) => s.id === showing)?.name
  return (
    <section className="panel">
      <h2>Sounds and vibration</h2>
      <div className="chips">
        <button
          className={`chip small ${sound ? 'on' : ''}`}
          aria-pressed={sound}
          onClick={() => {
            setSoundOn(!sound)
            setSound(!sound)
          }}
        >
          Sounds {sound ? 'on' : 'off'}
        </button>
        <button
          className={`chip small ${vibrate ? 'on' : ''}`}
          aria-pressed={vibrate}
          onClick={() => {
            setVibrateOn(!vibrate)
            setVibrate(!vibrate)
          }}
        >
          Vibrate {vibrate ? 'on' : 'off'}
        </button>
        <button className="chip small" onClick={() => celebrateAdded(1)}>Try it</button>
      </div>
      <p className="note">
        When photos go into an album: {name ? `${name}'s` : 'a'} sound, a pulse (Android phones; iPhones can't vibrate for web pages) and
        a burst on screen. The chime for a new message follows these too.
      </p>
    </section>
  )
}

// The app's accent colour, for this device.
function Colour() {
  const colour = useColour()
  const showing = useActiveSeason()
  return (
    <section className="panel">
      <h2>Colour</h2>
      <div className="colour-row">
        {COLOURS.map((c) => (
          <button key={c.id} className={colour === c.id ? 'on' : ''} onClick={() => setColour(c.id)} aria-pressed={colour === c.id}>
            <span className={`swatch ${colour === c.id ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${c.accent}, ${c.light})` }} />
            {c.name}
          </button>
        ))}
      </div>
      <p className="note">
        {showing
          ? 'The season sets the colours while it is on; this one comes back afterwards.'
          : 'Changes buttons, highlights and the logo on this device.'}
      </p>
    </section>
  )
}

// Notifications on this device when someone else adds photos (see lib/push.js).
// Hidden until the database and this copy of the app are set up for them.
const PUSH_TEXT = {
  on: 'On. This device hears when someone else adds photos or videos to an album, or a visitor adds photos through a link.',
  off: 'Hear when someone else adds photos or videos to an album, or a visitor adds photos through a link.',
  install: 'On iPhone and iPad, first add Hugpix to the Home Screen (Share, then Add to Home Screen) and open it from there.',
  unsupported: 'This browser cannot show notifications from Hugpix.',
  blocked: 'Notifications are blocked for Hugpix. Allow them in the browser or phone settings, then come back here.',
}

function Notifications({ cloud }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const check = () => pushStatus().then(setStatus).catch(() => setStatus('unsupported'))
  useEffect(() => {
    check()
  }, [cloud.canSync, cloud.features])
  if (!status || status === 'unavailable') return null

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      await (status === 'on' ? turnOffPush() : turnOnPush())
    } catch (e) {
      setError(e.message)
    }
    await check()
    setBusy(false)
  }
  return (
    <section className="panel">
      <h2>Notifications</h2>
      <p className="hint">{PUSH_TEXT[status]}</p>
      {error && <p className="note warn">{error}</p>}
      {(status === 'on' || status === 'off') && (
        <button className="secondary block" onClick={toggle} disabled={busy}>
          {status === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      )}
    </section>
  )
}

// The admin's list (see seamline_rights). People ask to add photos from a
// shared album and wait here for Approve or Decline; below them, everyone
// already decided on, with what they may do. Anyone not listed may leave
// notes, and may add photos only if they are a member.
function People({ requests }) {
  const [people, setPeople] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const load = () => fetchPeople().then(setPeople).catch((e) => setError(e.message))
  useEffect(() => {
    load()
    refreshRequests()
    // Arriving from the bell on the front page: straight to the requests.
    if (window.location.hash === '#people') document.getElementById('people')?.scrollIntoView({ block: 'start' })
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <section className="panel" id="people">
      <h2>People</h2>
      <p className="hint">
        People ask to add photos from a shared album once they have signed in. Anyone signed in can leave notes unless you stop
        them here.
      </p>
      {requests.length === 0 && <p className="note">No one is waiting.</p>}
      {requests.map((r) => (
        <div key={r.user_id} className="person-row request">
          <div className="person-who">
            <span className="person-email">{r.name || r.email}</span>
            <small>{r.name && `${r.email} · `}{r.album ? `asked to add photos to ${r.album}` : 'asked to see the albums'}</small>
          </div>
          <div className="chips">
            <button className="pill-btn approve" disabled={busy} onClick={() => run(() => answerRequest(r.user_id, true))}>
              Approve
            </button>
            <button className="pill-btn" disabled={busy} onClick={() => run(() => answerRequest(r.user_id, false))}>
              Decline
            </button>
          </div>
        </div>
      ))}
      {people?.map((p) => (
        <div key={p.email} className="person-row">
          <span className="person-email">{p.email}</span>
          <div className="chips">
            <button
              className={`chip small ${p.uploads ? 'on' : ''}`} aria-pressed={p.uploads} disabled={busy}
              onClick={() => run(() => savePerson(p.email, { uploads: !p.uploads }))}
            >
              Add photos
            </button>
            <button
              className={`chip small ${p.comments ? 'on' : ''}`} aria-pressed={p.comments} disabled={busy}
              onClick={() => run(() => savePerson(p.email, { comments: !p.comments }))}
            >
              Leave notes
            </button>
            <button className="icon-btn" aria-label={`Take ${p.email} off the list`} disabled={busy} onClick={() => run(() => removePerson(p.email))}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      ))}
      {people?.length > 0 && (
        <p className="note">Highlighted means allowed. Taking someone off the list puts them back to the usual: notes yes, photos no.</p>
      )}
      {error && <p className="preview-error" role="alert">{error}</p>}
    </section>
  )
}

// Everyone on Hugpix, for the admin (see seamline_users): who they are,
// whether they are in, when they joined and when they were last seen.
// Approving and blocking stay in People; this is the roll call.
const USER_STATUS = {
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
  waiting: 'Waiting',
  'signed up': 'Not in yet',
}
const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function Users({ canSwitch }) {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // whose role is changing
  const load = () => fetchUsers().then(setUsers).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  // A guest sees everything and adds to it; a member can also edit, remove,
  // and make links.
  const switchRole = async (u) => {
    setBusy(u.id)
    setError(null)
    try {
      await setRole(u.id, u.status === 'guest' ? 'member' : 'guest')
      await load()
    } catch (e) {
      setError(e.message)
    }
    setBusy(null)
  }

  const count = (...statuses) => users.filter((u) => statuses.includes(u.status)).length
  const summary = !users
    ? 'Loading…'
    : users.length === 0
      ? 'No one yet.'
      : [
          `${users.length} ${users.length === 1 ? 'person' : 'people'}`,
          count('admin', 'member') && `${count('admin', 'member')} in as members`,
          count('guest') && plural(count('guest'), 'guest'),
          count('waiting') && `${count('waiting')} waiting`,
          count('signed up') && `${count('signed up')} signed up but not in yet`,
        ].filter(Boolean).join(' · ')

  return (
    <section className="panel">
      <h2>Users</h2>
      <p className="hint">{summary}</p>
      {users?.map((u) => (
        <div key={u.id} className="person-row user-row">
          <Avatar person={{ name: u.name || u.email, avatar: u.avatar }} size={36} />
          <div className="person-who">
            <span className="person-email">{u.name || u.email}</span>
            <small>
              {[
                u.name && u.email,
                `joined ${day(u.joined)}`,
                u.last_seen ? `last seen ${ago(Date.parse(u.last_seen))}` : 'never signed in',
                !u.confirmed && 'email not confirmed',
              ].filter(Boolean).join(' · ')}
            </small>
          </div>
          <div className="user-side">
            <span className={`user-status ${u.status.replace(' ', '-')}`}>{USER_STATUS[u.status] ?? u.status}</span>
            {canSwitch && (u.status === 'guest' || u.status === 'member') && (
              <button className="text-btn user-switch" disabled={busy === u.id} onClick={() => switchRole(u)}>
                {busy === u.id ? 'Changing…' : u.status === 'guest' ? 'Make member' : 'Make guest'}
              </button>
            )}
          </div>
        </div>
      ))}
      {canSwitch && users?.some((u) => u.status === 'guest' || u.status === 'member') && (
        <p className="note">
          Guests see every album and add photos to them. Members can also edit and remove things, and make links.
        </p>
      )}
      {users?.some((u) => u.status === 'waiting') && <p className="note">Approve people waiting under People, above.</p>}
      {error && <p className="preview-error" role="alert">{error}</p>}
    </section>
  )
}

// Invite codes for new accounts, for the admin. The admin names each code;
// anyone who has it can use it until it is switched off. What gets sent is a
// link that opens the sign-up with the code filled in, plus the code itself.
// (Plait's own codes may carry a limit, shown as "used 2 of 5".)
const usesText = (c) =>
  c.max_uses ? `used ${c.uses} of ${c.max_uses}` : c.uses ? `used ${plural(c.uses, 'time')}` : 'not used yet'

function Invites({ canDelete }) {
  const [codes, setCodes] = useState(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState(null)
  const [doomed, setDoomed] = useState(null)
  const [copied, setCopied] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const load = () => fetchInvites().then(setCodes).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  // Codes are matched without caring about capitals (see handle_new_user), so
  // they are kept in small letters, with dashes for spaces.
  const make = (e) => {
    e.preventDefault()
    const code = name.trim().toLowerCase().replace(/\s+/g, '-')
    if (!/^[a-z0-9-]{3,40}$/.test(code)) return setError('Use 3 to 40 letters, numbers or dashes.')
    if (codes.some((c) => c.code === code)) return setError(`${code} already exists. Turn it on below if it is off.`)
    run(async () => {
      await addInvite(code, note.trim(), null)
      setName('')
      setNote('')
      setFresh(code)
    })
  }

  const message = (code) => `You're invited to Hugpix, our family photo albums. Make your account here: ${inviteUrl(code)}\n\nInvite code: ${code}`
  const copy = async (code) => {
    await navigator.clipboard.writeText(message(code)).catch(() => {})
    setCopied(code)
    setTimeout(() => setCopied(null), 1800)
  }
  const share = (code) => navigator.share({ title: 'Hugpix invite', text: message(code) }).catch(() => {})

  return (
    <section className="panel">
      <h2>Invite codes</h2>
      <p className="hint">
        New accounts need an invite code. Anyone with a code can use it until you turn it off. The message you send has a
        link that fills the code in for them.
      </p>
      <form className="invite-form" onSubmit={make}>
        <input
          className="field" placeholder="Code name, like smith-family" maxLength={40} value={name} required
          onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}
        />
        <input
          className="field" placeholder="Who it's for (optional)" maxLength={60} value={note}
          onChange={(e) => setNote(e.target.value)} enterKeyHint="done"
        />
        <button className="primary block" disabled={busy || !codes}>{busy ? 'Working…' : 'Make invite code'}</button>
      </form>
      {codes?.map((c) => {
        const usedUp = c.max_uses != null && c.uses >= c.max_uses
        const live = c.active && !usedUp
        return (
          <div key={c.code} className={`person-row invite-row ${live ? '' : 'off'} ${fresh === c.code ? 'fresh' : ''}`}>
            <div className="person-who">
              <span className="person-email">{c.code}</span>
              <small>
                {doomed === c.code
                  ? 'Delete for good? Accounts already made with it stay.'
                  : [c.note, usesText(c), !c.active && 'switched off'].filter(Boolean).join(' · ')}
              </small>
            </div>
            {doomed === c.code ? (
              <div className="chips">
                <button className="pill-btn delete" disabled={busy} onClick={() => run(() => deleteInvite(c.code).then(() => setDoomed(null)))}>Delete</button>
                <button className="pill-btn" disabled={busy} onClick={() => setDoomed(null)}>Keep</button>
              </div>
            ) : (
              <div className="chips">
                {live && <button className="pill-btn" onClick={() => copy(c.code)}>{copied === c.code ? 'Copied' : 'Copy'}</button>}
                {live && navigator.share && <button className="pill-btn" onClick={() => share(c.code)}>Share</button>}
                {!usedUp && (
                  <button className="pill-btn" disabled={busy} onClick={() => run(() => setInviteActive(c.code, !c.active))}>
                    {c.active ? 'Turn off' : 'Turn on'}
                  </button>
                )}
                {canDelete && (
                  <button className="icon-btn" aria-label={`Delete ${c.code}`} disabled={busy} onClick={() => setDoomed(c.code)}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      <p className="note">
        Once they have an account they tap “Ask for access”, and you approve them under People. Codes work for Plait sign-ups
        too, since the accounts are shared.
      </p>
      {error && <p className="preview-error" role="alert">{error}</p>}
    </section>
  )
}

// How the front page shows the albums, for this device. Each choice carries a
// small sketch of its page.
function Layout() {
  const layout = useLayout()
  const pin = usePinned()
  // Read once, outside find(): a hook called per item would run a different
  // number of times for each season and break the page when it changes.
  const active = useActiveSeason()
  const season = SEASONS.find((s) => s.id === active)?.name
  const albums = useStore((s) => s.albums)
  const pinnedFrom = pin && albums.find((a) => a.id === pin.album)?.name
  const { guest, features } = useCloud()
  const canPin = !guest && features.pins
  return (
    <section className="panel">
      <h2>Front page</h2>
      <div className="layout-row">
        {LAYOUTS.map((l) => (
          <button key={l.id} className={layout === l.id ? 'on' : ''} onClick={() => setLayout(l.id)} aria-pressed={layout === l.id}>
            <span className={`layout-sketch ${l.id}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>
            <b>{l.name}</b>
          </button>
        ))}
      </div>
      <p className="note">{LAYOUTS.find((l) => l.id === layout).note}.</p>
      {pinnedFrom ? (
        <div className="row">
          <p className="note">A photo from {pinnedFrom} leads everyone's front page{season ? ` for ${season}` : ''}.</p>
          {canPin && <button className="pill-btn" onClick={() => setPinned(null).catch(() => {})}>Unpin</button>}
        </div>
      ) : (
        canPin && (
          <p className="note">
            To have a photo lead everyone's front page, open it in an album and tap “Pin to the front page”.
          </p>
        )
      )}
    </section>
  )
}

// Your profile photo: shown beside your name everywhere. It comes from the
// phone or from a photo already in an album, then framed in a circle (moved
// and zoomed), so a face can be picked out of a group.
function ProfilePhoto({ session }) {
  const avatar = avatarOf(session)
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [fromAlbums, setFromAlbums] = useState(false)
  const [framing, setFraming] = useState(null) // { previewUrl, width, height, own }: the photo being framed
  const [frameError, setFrameError] = useState(null)

  // `own` is a picture made here for the purpose, let go of afterwards.
  const frame = async (url, own) => {
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = reject
        el.src = url
      })
      setMessage(null)
      setFrameError(null)
      setFraming({ previewUrl: url, width: img.naturalWidth, height: img.naturalHeight, own })
    } catch {
      if (own) URL.revokeObjectURL(url)
      setMessage('That file could not be read as a photo.')
    }
  }
  const stopFraming = () => {
    if (framing?.own) URL.revokeObjectURL(framing.previewUrl)
    setFraming(null)
  }
  const use = async (change) => {
    setBusy(true)
    setFrameError(null)
    try {
      const { blob } = await renderEdit(framing.previewUrl, change)
      await setAvatar(blob)
      refreshPeople(true)
      setMessage('Saved')
      stopFraming()
    } catch (e) {
      setFrameError(e.message)
    }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true)
    try {
      await setAvatar(null)
      refreshPeople(true)
      setMessage('Taken off')
    } catch (e) {
      setMessage(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="profile-photo">
      <button className="profile-photo-pick" disabled={busy} onClick={() => input.current.click()} aria-label={avatar ? 'Change your profile photo' : 'Add a profile photo'}>
        <Avatar person={{ id: session.user.id, name: userName(session), avatar }} size={64} />
        <span className="profile-photo-badge" aria-hidden="true"><Icon name="photo" size={14} /></span>
      </button>
      <div>
        <div className="label">Profile photo</div>
        <div className="profile-photo-btns">
          <button className="pill-btn" disabled={busy} onClick={() => input.current.click()}>From your phone</button>
          <button className="pill-btn" disabled={busy} onClick={() => setFromAlbums(true)}>From an album</button>
          {avatar && <button className="pill-btn" disabled={busy} onClick={remove}>Remove</button>}
        </div>
        <p className="note">{message ?? 'Shown beside your name everywhere: chats, comments, photos you add and lists.'}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files[0]
          e.target.value = ''
          if (file) frame(URL.createObjectURL(file), true)
        }}
      />
      <AlbumPhotoPicker
        open={fromAlbums}
        onClose={() => setFromAlbums(false)}
        max={1}
        title="Choose your photo"
        action={(n) => (n ? 'Use this photo' : 'Tap a photo')}
        onPick={(ids, images) => {
          setFromAlbums(false)
          frame(images[ids[0]].previewUrl, false)
        }}
      />
      {framing && (
        <AvatarFramer
          image={framing}
          busy={busy}
          error={frameError}
          onCancel={stopFraming}
          onSave={use}
        />
      )}
    </div>
  )
}

// The name shown at the top of the front page and on what you add to albums.
function YourName({ session }) {
  const current = userName(session)
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await setUserName(name)
      // Everything already added under the old name follows the new one.
      renameUploader(session.user.id, userName(getCloud().session))
      setMessage('Saved')
    } catch (err) {
      setMessage(err.message)
    }
    setBusy(false)
  }
  return (
    <form className="name-form" onSubmit={save}>
      <label className="label" htmlFor="seamline-name">Your name</label>
      <div className="password-row">
        <input
          className="field" id="seamline-name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name" maxLength={40} autoComplete="name" enterKeyHint="done"
        />
        <button className="pill-btn" disabled={busy || name.trim() === current}>{busy ? 'Saving' : 'Save'}</button>
      </div>
      <p className="note">{message ?? 'Shown at the top of the front page and on the photos and videos you add.'}</p>
    </form>
  )
}

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
  const albums = useStore((s) => s.albums)
  const importAlbum = useStore((s) => s.importAlbum)
  const known = importAlbum === 'auto' || importAlbum === 'off' || albums.some((a) => a.id === importAlbum)
  return (
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
  )
}

export default function Settings() {
  const cloud = useCloud()
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const used = storageUsed(cloud.shares)
  const mediaUsed = mediaStorageUsed(cloud.shares)
  const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(bytes < 10 * 1024 ** 3 ? 2 : 1)} GB`
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
        {cloud.session && !cloud.loading && !cloud.recovering && (
          <section className="panel">
            <h2>Account</h2>
            {cloud.features.avatars && <ProfilePhoto session={cloud.session} />}
            <YourName session={cloud.session} />
            <p className="hint">Signed in as {cloud.session.user.email}</p>
            {!cloud.uploader && <p className="note warn">This account has not been given access to a library.</p>}
            <p className="note">Signing out leaves what is already on this device in place.</p>
            <button className="secondary block" onClick={() => turnOffPush().catch(() => {}).finally(signOut)}>Sign out</button>
          </section>
        )}
        <Season />
        <Feedback />
        <Colour />
        <Layout />
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
            <Notifications cloud={cloud} />
            {cloud.admin && cloud.features.people && <People requests={cloud.requests} />}
            {cloud.admin && cloud.features.users && <Users canSwitch={!!cloud.features.roles} />}
            {cloud.admin && <Invites canDelete={!!cloud.features.inviteDelete} />}
            <SyncPanel cloud={cloud} />

            {/* Links and storage are the members' business, not a guest's. */}
            {!cloud.guest && <>
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
              <div className={`meter ${mediaUsed > MEDIA_WARN ? 'warn' : ''}`}>
                <i style={{ width: `${Math.min(100, (mediaUsed / MEDIA_LIMIT) * 100)}%` }} />
              </div>
              <p className="hint">{gb(mediaUsed)} of 100 GB · photos and videos, on Cloudflare</p>
              {mediaUsed > MEDIA_WARN ? (
                <p className="note warn">Nearly full. Remove photos or videos you no longer need, or ask for the limit to be raised.</p>
              ) : (
                <p className="note">The first 10 GB are free; above that Cloudflare charges about $0.015 per GB a month.</p>
              )}
              {used > 0 && (
                <p className="hint">
                  {mb(used)} of 1 GB · older photos and visitors' uploads, on Supabase ·
                  {' '}{photos} photo{photos === 1 ? '' : 's'} in {cloud.shares.length} link{cloud.shares.length === 1 ? '' : 's'}
                </p>
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
                      {cloud.features.views && ` · ${viewsText(s)}`}
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
            </>}
          </>
        )}
      </main>
    </div>
  )
}
