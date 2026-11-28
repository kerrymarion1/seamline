import { useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import SeasonDecor from '../components/SeasonDecor'
import { requestCode, useCloud } from '../lib/cloud'
import { activeSeason } from '../lib/theme'

// The front door for anyone not signed in, and /welcome for everyone: what
// Hugpix is, and the ways in. Every real album is private, so the photos here
// are drawn scenes and the people are made up.

// Little picture postcards, 120 by 90, drawn instead of photographed.
const SCENES = {
  sunset: (
    <>
      <defs>
        <linearGradient id="wl-sunset" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b2a7b" /><stop offset=".6" stopColor="#ff6f61" /><stop offset="1" stopColor="#ffb36b" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-sunset)" />
      <circle cx="60" cy="60" r="16" fill="#ffe08a" />
      <rect y="62" width="120" height="28" fill="#2d2459" />
      <path d="M44 68h32M50 74h20M55 80h10" stroke="#ffcf8a" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  beach: (
    <>
      <defs>
        <linearGradient id="wl-beach" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5cc6f2" /><stop offset="1" stopColor="#c8f0ff" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-beach)" />
      <circle cx="96" cy="18" r="9" fill="#fff1a8" />
      <rect y="48" width="120" height="18" fill="#1e8fd6" />
      <path d="M0 64q10-5 20 0t20 0 20 0 20 0 20 0 20 0" stroke="#fff" strokeWidth="2" fill="none" />
      <rect y="65" width="120" height="25" fill="#f5d9a3" />
      <path d="M33 80l2-30" stroke="#6b4a2b" strokeWidth="2" />
      <path d="M19 52q16-18 32 0z" fill="#ff5e7e" />
      <path d="M35 34q-3 9-4 18M35 34q3 9 4 18" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" fill="none" />
    </>
  ),
  camping: (
    <>
      <defs>
        <linearGradient id="wl-camping" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1b3d" /><stop offset="1" stopColor="#3d5a9e" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-camping)" />
      <g fill="#fff">
        <circle cx="14" cy="12" r=".9" /><circle cx="38" cy="22" r="1.1" /><circle cx="66" cy="9" r=".8" />
        <circle cx="88" cy="20" r="1" /><circle cx="108" cy="8" r=".9" /><circle cx="52" cy="30" r=".7" />
      </g>
      <path d="M0 72l26-34 20 22 26-30 24 28 24-18v50H0z" fill="#2a3d6e" />
      <path d="M26 38l-6 8h12zM72 30l-7 9h14z" fill="#e9eefc" />
      <path d="M0 80q40-16 80-2t40-6v18H0z" fill="#16244a" />
      <path d="M56 82l9-14 9 14z" fill="#ff8a4c" />
      <path d="M65 68v14" stroke="#1d0f06" strokeWidth="1.2" />
      <circle cx="65" cy="80" r="14" fill="#ffb36b" opacity=".18" />
    </>
  ),
  party: (
    <>
      <defs>
        <linearGradient id="wl-party" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc2d4" /><stop offset="1" stopColor="#ff9ab5" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-party)" />
      <g>
        <rect x="12" y="12" width="4" height="7" fill="#5aa9ff" transform="rotate(20 14 15)" />
        <rect x="96" y="16" width="4" height="7" fill="#f5c451" transform="rotate(-25 98 19)" />
        <rect x="80" y="8" width="4" height="7" fill="#4fd1a5" transform="rotate(40 82 11)" />
        <rect x="28" y="30" width="4" height="7" fill="#a78bfa" transform="rotate(-15 30 33)" />
        <rect x="104" y="40" width="4" height="7" fill="#5aa9ff" transform="rotate(30 106 43)" />
      </g>
      <rect y="72" width="120" height="18" fill="#e86a92" />
      <rect x="38" y="48" width="44" height="25" rx="4" fill="#fff" />
      <path d="M38 54q5 6 10 0t11 0 11 0 12 0v-2a4 4 0 00-4-4H42a4 4 0 00-4 4z" fill="#ff6b9a" />
      <path d="M38 62h44" stroke="#ffd1df" strokeWidth="2" />
      <rect x="49" y="38" width="3" height="10" fill="#7fd3ff" /><rect x="59" y="38" width="3" height="10" fill="#f5c451" /><rect x="69" y="38" width="3" height="10" fill="#7fd3ff" />
      <g fill="#ffb020"><ellipse cx="50.5" cy="35" rx="2" ry="3" /><ellipse cx="60.5" cy="35" rx="2" ry="3" /><ellipse cx="70.5" cy="35" rx="2" ry="3" /></g>
    </>
  ),
  autumn: (
    <>
      <defs>
        <linearGradient id="wl-autumn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe2b0" /><stop offset="1" stopColor="#ffc78a" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-autumn)" />
      <path d="M0 62q30-14 60-4t60-6v38H0z" fill="#d98a4a" />
      <g fill="#6b3e22"><rect x="22" y="44" width="4" height="26" /><rect x="58" y="40" width="5" height="28" /><rect x="94" y="46" width="4" height="24" /></g>
      <circle cx="24" cy="40" r="13" fill="#e0602e" /><circle cx="60" cy="34" r="16" fill="#f2a33a" /><circle cx="96" cy="42" r="12" fill="#c2452d" />
      <path d="M0 76q40-8 70 0t50-2v16H0z" fill="#8a4a24" />
      <g fill="#e0602e"><circle cx="40" cy="58" r="1.6" /><circle cx="80" cy="22" r="1.4" /><circle cx="108" cy="62" r="1.5" /></g>
    </>
  ),
  snow: (
    <>
      <defs>
        <linearGradient id="wl-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2850" /><stop offset="1" stopColor="#3a4f8a" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-snow)" />
      <g fill="#fff" opacity=".85">
        <circle cx="12" cy="14" r="1.3" /><circle cx="34" cy="30" r="1" /><circle cx="58" cy="12" r="1.4" /><circle cx="90" cy="24" r="1.1" />
        <circle cx="108" cy="40" r="1.3" /><circle cx="22" cy="46" r="1" /><circle cx="76" cy="40" r=".9" />
      </g>
      <path d="M0 70q60-14 120 0v20H0z" fill="#eef4ff" />
      <rect x="45" y="50" width="30" height="22" fill="#7a4a2e" />
      <path d="M40 53l20-17 20 17z" fill="#f4f8ff" />
      <rect x="54" y="57" width="10" height="8" fill="#ffd36b" />
      <circle cx="59" cy="61" r="12" fill="#ffd36b" opacity=".15" />
      <path d="M96 72l9-22 9 22z" fill="#2f6b4f" /><path d="M100 60l5-10 5 10z" fill="#f4f8ff" opacity=".9" />
    </>
  ),
  fireworks: (
    <>
      <defs>
        <linearGradient id="wl-fireworks" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0c22" /><stop offset="1" stopColor="#2a2350" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wl-fireworks)" />
      <g strokeWidth="1.6" strokeLinecap="round">
        <path d="M34 26v-9M34 26l7-6M34 26l9 1M34 26l6 7M34 26v9M34 26l-6 7M34 26l-9 1M34 26l-7-6" stroke="#ff4d5e" />
        <path d="M80 20v-7M80 20l5-5M80 20l7 1M80 20l5 5M80 20v7M80 20l-5 5M80 20l-7 1M80 20l-5-5" stroke="#f5c451" />
        <path d="M60 40v-6M60 40l4-4M60 40h6M60 40l4 4M60 40v6M60 40l-4 4M60 40h-6M60 40l-4-4" stroke="#8fb0ff" />
      </g>
      <path d="M0 90V70h10v-8h8v12h8V60h10v14h6V66h12v-6h8v14h8V64h10v10h8V58h10v12h8v-6h14v26z" fill="#07081a" />
      <g fill="#ffd36b" opacity=".8"><rect x="29" y="64" width="2" height="2" /><rect x="58" y="63" width="2" height="2" /><rect x="91" y="62" width="2" height="2" /></g>
    </>
  ),
}

const Scene = ({ kind }) => (
  <svg className="wl-scene" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {SCENES[kind]}
  </svg>
)

const HEART = 'M12 21C5 15 1 11.5 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 4.5-4 8-11 14z'
const Heart = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 22" aria-hidden="true"><path d={HEART} /></svg>
)

// The hero film (public/welcome/hero.mp4, 720p, made in Runway): prints of
// family moments drifting through warm light. Its last frame doesn't match
// its first, so two copies take turns, the next fading in over the last
// stretch of the one before, and the loop never jumps. With reduced motion
// it stays on its first frame.
const FADE = 1.2 // seconds

function Film() {
  const a = useRef(null)
  const b = useRef(null)
  const [front, setFront] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const films = [a.current, b.current]
    let current = 0
    films[0].play().catch(() => {})
    const onTime = (e) => {
      const v = films[current]
      if (e.target !== v || !v.duration || v.currentTime < v.duration - FADE) return
      current = 1 - current
      films[current].currentTime = 0
      films[current].play().catch(() => {})
      setFront(current)
    }
    films.forEach((v) => v.addEventListener('timeupdate', onTime))
    return () => films.forEach((v) => v.removeEventListener('timeupdate', onTime))
  }, [])
  return (
    <div className="wl-film-wrap" aria-hidden="true">
      <div className="wl-film">
        {[a, b].map((ref, i) => (
          <video
            key={i} ref={ref} className={front === i ? 'front' : ''} src="/welcome/hero.mp4" poster="/welcome/hero.jpg"
            muted playsInline preload="auto"
          />
        ))}
      </div>
    </div>
  )
}

// "Ask for a code": a name, an email and a note go to Kerry by email (see
// requestCode). Opens from the hero, and from the sign-up form (/welcome#ask).
function AskForCode({ open, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await requestCode({ name, email, note })
      setDone(true)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  const first = name.trim().split(/\s+/)[0]
  return (
    <>
      <div className={`backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <section className={`sheet ${open ? 'open' : ''}`} role="dialog" aria-label="Ask for a code" aria-hidden={!open}>
        <div className="sheet-head">
          <span className="grabber" />
          <div className="sheet-title-row">
            <h2>Ask for a code</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
        </div>
        <div className="sheet-body wl-ask">
          {done ? (
            <>
              <p className="hint">Thanks{first ? `, ${first}` : ''}! Your request is on its way, and a code will come to {email.trim()} by email.</p>
              <button className="primary block" onClick={onClose}>Done</button>
            </>
          ) : (
            <form onSubmit={submit}>
              <p className="hint">Hugpix is just for family and friends. Say who you are, and a code will come to you by email.</p>
              <input
                className="field" name="name" autoComplete="name" placeholder="Your name" maxLength={60} required
                value={name} onChange={(e) => setName(e.target.value)}
              />
              <input
                className="field" type="email" name="email" autoComplete="email" inputMode="email" placeholder="Your email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
              <textarea
                className="field" rows={3} maxLength={300} placeholder="How do you know us? (optional)"
                value={note} onChange={(e) => setNote(e.target.value)}
              />
              {error && <p className="preview-error" role="alert">{error}</p>}
              <button className="primary block" disabled={busy}>{busy ? 'Sending…' : 'Ask for a code'}</button>
            </form>
          )}
        </div>
      </section>
    </>
  )
}

function Hero({ onJoin, onSignIn, onAsk, signedIn }) {
  return (
    <section className="wl-hero">
      <div className="wl-glow" aria-hidden="true"><i /><i /><i /></div>
      <Logo loop />
      <p className="wl-eyebrow">Photo albums for family &amp; friends</p>
      <h1 className="wl-title">
        Hugs, in <span className="wl-shine">pictures.</span>
      </h1>
      <p className="wl-lead">
        Private albums the whole family fills together. Everyone adds, everyone sees, and everyone hears the moment new
        photos land.
      </p>
      <div className="wl-ctas">
        {signedIn ? (
          <button className="primary" onClick={onSignIn}>Open your albums</button>
        ) : (
          <>
            <button className="primary" onClick={onJoin}><Icon name="heart" size={18} /> Join with your code</button>
            <button className="secondary wl-ghost" onClick={onSignIn}>Sign in</button>
          </>
        )}
      </div>
      {!signedIn && (
        <p className="wl-small">
          No code yet? <button className="wl-link" onClick={onAsk}>Ask for one</button>. Already use Plait? Just sign in.
        </p>
      )}
      <Film />
    </section>
  )
}

const FEATURES = [
  { icon: 'photo', title: 'Albums together', text: 'Everyone adds photos and videos to the same albums.' },
  { icon: 'bell', title: 'Never miss one', text: 'A buzz on your phone when someone adds new ones.' },
  { icon: 'link', title: 'Share a link', text: 'Send an album to anyone. No account needed to look.' },
  { icon: 'lock', title: 'Just family', text: 'Invite only. Nobody gets in without a yes.' },
]

// A phone showing the front page, where news keeps arriving.
const TILES = [
  { kind: 'party', name: "Gran's 80th" },
  { kind: 'beach', name: 'Beach week' },
  { kind: 'camping', name: 'Lake trip' },
  { kind: 'autumn', name: 'Fall walk' },
  { kind: 'snow', name: 'Snow day' },
]
const NEWS = [
  { who: 'Gran', n: 12, tile: 0 },
  { who: 'Mia', n: 5, tile: 1 },
  { who: 'Uncle Joe', n: 23, tile: 2 },
  { who: 'Sam', n: 8, tile: 3 },
]

function Phone() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => !document.hidden && setN((x) => x + 1), 4200)
    return () => clearInterval(t)
  }, [])
  const news = NEWS[n % NEWS.length]
  return (
    <div className="wl-phone" aria-hidden="true">
      <div key={n} className="wl-ph-note">
        <span className="wl-ph-icon">h<b>p</b></span>
        <span>
          <b>Hugpix</b>
          {news.who} added {news.n} photos to {TILES[news.tile].name}
        </span>
        <small>now</small>
      </div>
      <div className="wl-ph-head">
        <span className="wl-ph-logo">hug<b>pix</b></span>
        <span className="wl-ph-me">S</span>
      </div>
      <p className="wl-ph-hello">Good evening, <em>Sam</em></p>
      <div className="wl-ph-grid">
        {TILES.map((t, i) => (
          <div key={t.kind} className={`wl-ph-tile ${i === 0 ? 'wide' : ''}`}>
            <Scene kind={t.kind} />
            <span>{t.name}</span>
            {i === news.tile && <b key={n} className="wl-ph-new">+{news.n}</b>}
          </div>
        ))}
      </div>
    </div>
  )
}

// The seasons in calendar order, taking turns until one is picked, starting
// from the one that is on now.
const DEMO_SEASONS = [
  { id: 'newyear', name: 'New Year', hello: ['Happy', 'New Year'], tiles: ['fireworks', 'party', 'snow'] },
  { id: 'july4', name: 'July 4th', hello: ['Happy', 'Fourth of July'], tiles: ['fireworks', 'beach', 'camping'] },
  { id: 'halloween', name: 'Halloween', hello: ['Happy', 'Halloween'], tiles: ['sunset', 'camping', 'party'] },
  { id: 'thanksgiving', name: 'Thanksgiving', hello: ['Happy', 'Thanksgiving'], tiles: ['autumn', 'party', 'sunset'] },
  { id: 'christmas', name: 'Christmas', hello: ['Merry', 'Christmas'], tiles: ['snow', 'party', 'camping'] },
]

function Seasons() {
  const [i, setI] = useState(() => Math.max(0, DEMO_SEASONS.findIndex((s) => s.id === activeSeason()?.id)))
  const [picked, setPicked] = useState(false)
  useEffect(() => {
    if (picked) return
    const t = setInterval(() => !document.hidden && setI((x) => (x + 1) % DEMO_SEASONS.length), 5200)
    return () => clearInterval(t)
  }, [picked])
  const s = DEMO_SEASONS[i]
  return (
    <div className="wl-season-wrap">
      <div className="wl-season-pick" role="radiogroup" aria-label="Season">
        {DEMO_SEASONS.map((x, j) => (
          <button
            key={x.id} role="radio" aria-checked={i === j} className={i === j ? 'on' : ''}
            onClick={() => { setI(j); setPicked(true) }}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="wl-season" data-s={s.id} aria-hidden="true">
        <SeasonDecor key={s.id} show={s.id} />
        <p key={`hello-${s.id}`} className="wl-season-hello">{s.hello[0]} <em>{s.hello[1]}</em></p>
        <div className="wl-season-tiles">
          {s.tiles.map((k, j) => (
            <div key={`${s.id}-${k}`} className="wl-season-tile" style={{ '--i': j }}><Scene kind={k} /></div>
          ))}
        </div>
      </div>
    </div>
  )
}

// A link sent in a message, collecting hearts.
function Link() {
  const [hearts, setHearts] = useState(9)
  useEffect(() => {
    const t = setInterval(() => !document.hidden && setHearts((h) => (h >= 24 ? 9 : h + 1)), 1600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="wl-chat" aria-hidden="true">
      <p className="wl-bubble">Our beach week, have a look!</p>
      <div className="wl-linkcard">
        <Scene kind="beach" />
        <div>
          <b>Beach week</b>
          <span>48 photos · hugpix.com</span>
        </div>
      </div>
      <div className="wl-reacts">
        <span key={hearts} className="wl-heartcount"><Heart className="wl-heart-mini" /> {hearts}</span>
        <span className="wl-note-chip">“Love the sandcastle!”</span>
      </div>
    </div>
  )
}

const STEPS = [
  { title: 'Get a code', text: 'Whoever invited you has one. Their link fills it in for you.' },
  { title: 'Make your account', text: 'Any email address works. Confirm it with one tap.' },
  { title: 'Come on in', text: 'Ask for access, and the albums open once you are let in.' },
]

export default function Welcome() {
  const cloud = useCloud()
  const signedIn = !!cloud.session && !cloud.recovering
  const root = useRef(null)
  const join = () => navigate('/signin?join')
  const signIn = () => navigate(signedIn ? '/' : '/signin')
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const [asking, setAsking] = useState(() => window.location.hash === '#ask')
  const closeAsk = () => {
    setAsking(false)
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }

  // The small logo in the bar only comes in once the big one has scrolled
  // away, hugging as it arrives, so the page never shows two.
  const [pastLogo, setPastLogo] = useState(false)
  useEffect(() => {
    const big = root.current.querySelector('.wl-hero .logo')
    if (!big || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setPastLogo(!e.isIntersecting), { root: root.current, rootMargin: '-60px 0px 0px' })
    io.observe(big)
    return () => io.disconnect()
  }, [])

  // Sections rise into place as they scroll into view.
  useEffect(() => {
    const els = root.current.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window)) return els.forEach((el) => el.classList.add('in'))
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('in')
        io.unobserve(e.target)
      }),
      { root: root.current, threshold: 0.18 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="screen welcome" ref={root}>
      <header className="wl-top">
        <div className="wl-top-left">
          <div className={`wl-brand ${pastLogo ? 'on' : ''}`} aria-hidden={!pastLogo}>
            {pastLogo && <Logo as="div" />}
          </div>
          <nav className="wl-nav" aria-label="On this page">
            <button onClick={() => jump('albums')}>Albums</button>
            <button onClick={() => jump('seasons')}>Seasons</button>
            <button onClick={() => jump('sharing')}>Sharing</button>
            <button onClick={() => jump('join')}>How to join</button>
          </nav>
        </div>
        <button className="pill-btn" onClick={signIn}>{signedIn ? 'Open' : 'Sign in'}</button>
      </header>

      <Hero onJoin={join} onSignIn={signIn} onAsk={() => setAsking(true)} signedIn={signedIn} />
      <AskForCode open={asking} onClose={closeAsk} />

      <section className="wl-features">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="wl-feature reveal" style={{ '--i': i }}>
            <span className="wl-feature-icon"><Icon name={f.icon} size={24} /></span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <section className="wl-story reveal" id="albums">
        <div className="wl-story-art"><Phone /></div>
        <div className="wl-story-text">
          <p className="wl-eyebrow">Albums together</p>
          <h2>Everyone's photos. <span className="wl-accent">One</span> home.</h2>
          <p>
            Gran's from the party, your cousin's from the lake, the kids' from the trampoline. They all land in the same
            albums, and everyone sees them the moment they're added.
          </p>
          <p>Turn on notifications and your phone buzzes when there's something new to see.</p>
        </div>
      </section>

      <section className="wl-story flip reveal" id="seasons">
        <div className="wl-story-art"><Seasons /></div>
        <div className="wl-story-text">
          <p className="wl-eyebrow">Seasons</p>
          <h2>It dresses up for the <span className="wl-accent">holidays</span>.</h2>
          <p>
            Fireworks and confetti for New Year, bunting for the Fourth of July, bats and lightning at Halloween, falling
            leaves at Thanksgiving, twinkling lights and snow at Christmas. Hugpix follows the calendar, or you pick the
            one you like.
          </p>
        </div>
      </section>

      <section className="wl-story reveal" id="sharing">
        <div className="wl-story-art"><Link /></div>
        <div className="wl-story-text">
          <p className="wl-eyebrow">Share a link</p>
          <h2>Show the <span className="wl-accent">neighbours</span>.</h2>
          <p>
            Send an album or a single photo as a link. Anyone can look, leave a heart or a note, and add their own photos
            if you let them. Switch the link off whenever you like.
          </p>
        </div>
      </section>

      <section className="wl-join" id="join">
        <div className="reveal">
          <p className="wl-eyebrow">How to join</p>
          <h2>Three steps, then you're in.</h2>
        </div>
        <ol className="wl-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="reveal" style={{ '--i': i }}>
              <b>{i + 1}</b>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wl-end reveal">
        <Logo as="div" loop />
        <h2>Come on in.</h2>
        <div className="wl-ctas">
          {signedIn ? (
            <button className="primary" onClick={signIn}>Open your albums</button>
          ) : (
            <>
              <button className="primary" onClick={join}>Join with your code</button>
              <button className="secondary wl-ghost" onClick={signIn}>Sign in</button>
            </>
          )}
        </div>
      </section>

      <footer className="wl-foot">
        <p>Hugpix · photo albums, shared with family and friends.</p>
        <p className="wl-credit">Produced by <span>Kerry Marion</span></p>
      </footer>
    </div>
  )
}
