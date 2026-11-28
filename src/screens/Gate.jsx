import { useEffect, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { hasOpenRequest, openedLinks, recheckAccess, requestAccess, setUserName, signOut, useCloud, userName } from '../lib/cloud'
import { NewPassword, SignIn } from './SignIn'

// The locked front door. The app is private: nothing in it opens until a
// member or approved guest of the library signs in. Someone signed in
// without access can ask to be let in, and is pointed back to the shared
// albums they have opened. Shared links themselves never come through here.
export default function Gate() {
  const cloud = useCloud()
  const signedIn = !!cloud.session && !cloud.recovering
  const links = signedIn ? openedLinks() : []
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (signedIn) hasOpenRequest().then(setAsked).catch(() => {})
  }, [signedIn])

  // While waiting, look again now and then, and whenever the page comes back
  // into view: once approved, the app opens by itself.
  const [checking, setChecking] = useState(false)
  const check = async () => {
    setChecking(true)
    await recheckAccess().catch(() => {})
    await hasOpenRequest().then(setAsked).catch(() => {})
    setChecking(false)
  }
  useEffect(() => {
    if (!signedIn) return
    const t = setInterval(() => !document.hidden && recheckAccess().catch(() => {}), 15000)
    const onVisible = () => !document.hidden && recheckAccess().catch(() => {})
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn])

  // Someone who made their account in Plait has no Hugpix screen name yet, so
  // they choose one before asking; it starts as a guess from their account.
  const named = !!cloud.session?.user?.user_metadata?.seamline_name
  const [name, setName] = useState(() => userName(cloud.session))
  const who = cloud.session?.user?.id
  useEffect(() => {
    if (who) setName((n) => n || userName(cloud.session))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who])
  const ask = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (!named) await setUserName(name)
      const answer = await requestAccess()
      if (answer === 'allowed') return window.location.reload()
      if (answer === 'pending') setAsked(true)
      else setError('Asking is not possible right now.')
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="screen gate ambient">
      <div className="gate-box">
        <Logo />
        {cloud.recovering ? (
          <NewPassword />
        ) : cloud.session ? (
          <section className="panel">
            <h2>Not in yet</h2>
            <p className="hint">
              {asked
                ? `${cloud.session.user.email} has asked to see the albums. They open here once the request is approved.`
                : `${cloud.session.user.email} is signed in. The albums are private until you're approved.`}
            </p>
            {asked ? (
              <>
                <p className="note"><i className="spinner inline" /> Waiting for approval. This page opens the albums by itself once you're in.</p>
                <button className="secondary block" onClick={check} disabled={checking}>
                  {checking ? 'Checking…' : 'Check now'}
                </button>
              </>
            ) : (
              <form className="name-form" onSubmit={ask}>
                {!named && (
                  <>
                    <label className="label" htmlFor="gate-name">Your screen name</label>
                    <input
                      className="field" id="gate-name" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="What family will see" maxLength={40} autoComplete="nickname" required
                    />
                  </>
                )}
                <button className="primary block" disabled={busy || (!named && !name.trim())}>
                  {busy ? 'Asking…' : 'Ask for access'}
                </button>
              </form>
            )}
            {error && <p className="preview-error" role="alert">{error}</p>}
            {links.length > 0 && (
              <>
                <div className="label">Shared with you</div>
                <div className="gate-links">
                  {links.map((l) => (
                    <button key={l.token} className="secondary block" onClick={() => navigate(`/s/${l.token}`)}>
                      <Icon name="photo" size={18} /> {l.title}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="text-btn" onClick={signOut}>Sign out</button>
          </section>
        ) : (
          <>
            <SignIn />
            <button className="text-btn" onClick={() => navigate('/')}>What is Hugpix?</button>
          </>
        )}
      </div>
    </div>
  )
}
