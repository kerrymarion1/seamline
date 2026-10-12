import Logo from '../components/Logo'
import { signOut, useCloud } from '../lib/cloud'
import { NewPassword, SignIn } from './Settings'

// The locked front door. The app is private: nothing in it opens until a
// member of the library signs in. Shared links never come through here.
export default function Gate() {
  const cloud = useCloud()
  return (
    <div className="screen gate ambient">
      <div className="gate-box">
        <Logo />
        {cloud.recovering ? (
          <NewPassword />
        ) : cloud.session ? (
          <section className="panel">
            <h2>No access</h2>
            <p className="hint">{cloud.session.user.email} is signed in, but this account has not been given access to Seamline.</p>
            <button className="secondary block" onClick={signOut}>Sign out</button>
          </section>
        ) : (
          <SignIn />
        )}
      </div>
    </div>
  )
}
