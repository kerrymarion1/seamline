import { useState } from 'react'
import { navigate } from '../App'
import { requestPasswordReset, setNewPassword, signIn, signUp } from '../lib/cloud'

// The sign-in and new-account form, and the new-password form after a reset
// link: shared by the front door (Gate), the shared page and Settings. Kept
// apart from Settings so those can open without loading all of it.

// Signing in, or making a new account with any email address. `intro`
// replaces the line under the heading, for the shared page. An invite link
// (see inviteUrl) opens straight on the new account, with its code filled in,
// and so does "Join with your code" on the welcome page (?join).
export function SignIn({ intro }) {
  const [invited] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? '')
  const [creating, setCreating] = useState(() => !!invited || new URLSearchParams(window.location.search).has('join'))
  const [name, setName] = useState('')
  const [code, setCode] = useState(invited)
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
    setSent(null)
    try {
      if (creating) {
        const result = await signUp(name, email, password, code)
        setCreating(false)
        if (result === 'exists') {
          setPassword('')
          setSent(
            `${email.trim()} already has an account, perhaps from Plait. Sign in with that password, or tap "Forgot password?" to choose a new one.`,
          )
        } else {
          setSent(`Almost there: open the link we sent to ${email.trim()} to confirm it, then sign in here.`)
        }
      } else {
        await signIn(email, password, remember)
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  const switchMode = () => {
    setCreating((v) => !v)
    setError(null)
    setSent(null)
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
      <h2>{creating ? 'Create an account' : 'Sign in'}</h2>
      <p className="hint">
        {creating
          ? `${invited && code === invited
              ? 'You have been invited. Any email address works; we will send a link to confirm it.'
              : 'Any email address works, with the invite code you were given. We will send a link to confirm the address.'} Already use Plait? You have an account: sign in with it instead.`
          : intro ?? 'Sign in with your Hugpix or Plait account. Signing in keeps your albums and collages in step on every device and lets you share links.'}
      </p>
      {creating && (
        <input
          className="field" name="name" autoComplete="nickname" placeholder="Screen name (what family will see)" maxLength={40}
          value={name} onChange={(e) => setName(e.target.value)} required
        />
      )}
      <input
        className="field" type="email" name="email" id="seamline-email" autoComplete="username" inputMode="email"
        placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
      />
      <div className="password-row">
        <input
          className="field" type={show ? 'text' : 'password'} name="password" id="seamline-password"
          autoComplete={creating ? 'new-password' : 'current-password'} placeholder={creating ? 'Choose a password' : 'Password'}
          minLength={creating ? 6 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        <button type="button" className="pill-btn" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {creating ? (
        <>
          <p className="note">At least 6 characters.</p>
          <input
            className="field" name="invite" autoComplete="off" autoCapitalize="none" spellCheck={false}
            placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} required
          />
        </>
      ) : (
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            Keep me signed in
            <small>{remember ? 'Stays signed in on this device until you sign out.' : 'Signs out when the app is closed.'}</small>
          </span>
        </label>
      )}
      {error && <p className="preview-error" role="alert">{error}</p>}
      {sent && <p className="note" role="status">{sent}</p>}
      <button className="primary block" disabled={busy}>{busy ? 'Working…' : creating ? 'Create account' : 'Sign in'}</button>
      {!creating && <button type="button" className="text-btn" onClick={forgot} disabled={busy}>Forgot password?</button>}
      {creating && !invited && (
        <button type="button" className="text-btn" onClick={() => navigate('/welcome#ask')} disabled={busy}>No code yet? Ask for one</button>
      )}
      <button type="button" className="text-btn" onClick={switchMode} disabled={busy}>
        {creating ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
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
