import { useEffect, useRef } from 'react'

// Cloudflare Turnstile, the are-you-a-person check that signing in, making an
// account and asking for a password reset now need: the accounts are shared
// with Plait, whose Supabase project checks every one of those for a token
// (Authentication > Attack Protection). The site key is Plait's "plait
// sign-in" widget, public by design; the widget must list hugpix.com among its
// hostnames, or Cloudflare gives no token here.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF3SWS0fQwir6mvN'

let loading = null
function load() {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Turnstile did not load'))
    }
    document.head.appendChild(s)
  })
  return loading
}

// Hands up a token once Cloudflare is satisfied (`onToken(token)`), and null
// when it lapses or fails. Most people never see it; the doubtful get a tick
// box, and `onAsk(true)` says it is showing (`onAsk(false)` once it is done
// with). Several tries in quick succession bring the box too. A token is good
// for one try: bump `resetKey` after each for a new one.
export default function Turnstile({ onToken, onAsk, resetKey }) {
  const box = useRef(null)
  const id = useRef(null)
  const say = useRef(onToken)
  say.current = onToken
  const ask = useRef(onAsk)
  ask.current = onAsk

  useEffect(() => {
    let gone = false
    load()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return
        id.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: 'dark',
          callback: (t) => say.current(t),
          'expired-callback': () => say.current(null),
          'error-callback': () => say.current(null),
          'before-interactive-callback': () => ask.current?.(true),
          'after-interactive-callback': () => ask.current?.(false),
        })
      })
      .catch(() => say.current(null))
    return () => {
      gone = true
      if (id.current && window.turnstile) window.turnstile.remove(id.current)
      id.current = null
    }
  }, [])

  useEffect(() => {
    if (!resetKey || !id.current || !window.turnstile) return
    say.current(null)
    ask.current?.(false)
    window.turnstile.reset(id.current)
  }, [resetKey])

  return <div ref={box} className="turnstile" />
}
