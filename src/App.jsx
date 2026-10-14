import { useEffect, useState, useSyncExternalStore } from 'react'
import { clearTextCache } from './lib/fonts'
import { FontsContext } from './lib/fontsContext'
import CloudSync from './components/CloudSync'
import Logo from './components/Logo'
import SharedInbox from './components/SharedInbox'
import { useCloud } from './lib/cloud'
import { transition } from './lib/motion'
import { useStore } from './lib/store'
import Album from './screens/Album'
import Home from './screens/Home'
import Editor from './screens/Editor'
import Gate from './screens/Gate'
import Settings from './screens/Settings'
import ShareView from './screens/ShareView'

// Minimal path router: "/" and "/albums" home, "/album/:id" one album,
// "/p/:id" the editor, "/settings" account and storage, "/s/:code" a shared link.
const subscribe = (cb) => {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}

// The front page is the top level; everything else is one step in.
const depth = (path) => (path === '/' || path === '/albums' ? 0 : 1)

// `animate: false` is for callers that run their own animation around the move.
export function navigate(to, { replace = false, animate = true } = {}) {
  const move = () => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  if (!animate) return move()
  const step = depth(to) - depth(window.location.pathname)
  transition(move, step > 0 ? 'forward' : step < 0 ? 'back' : 'fade')
}

// Bumps whenever a webfont finishes loading so measured text is re-laid out.
function useFontsTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => {
      clearTextCache()
      setTick((t) => t + 1)
    }
    document.fonts.addEventListener('loadingdone', bump)
    return () => document.fonts.removeEventListener('loadingdone', bump)
  }, [])
  return tick
}

export default function App() {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname)
  const fontsTick = useFontsTick()
  const ready = useStore((s) => s.ready)
  const cloud = useCloud()
  const projectId = path.match(/^\/p\/([^/]+)/)?.[1]
  const albumId = path.match(/^\/album\/([^/]+)/)?.[1]
  const shareToken = path.match(/^\/s\/([^/]+)/)?.[1]

  // A visitor opening a shared link gets just that page, nothing of the editor.
  if (shareToken) return <ShareView key={shareToken} token={shareToken} />

  // Everything else is private: it opens only for a signed-in member.
  if (cloud.configured) {
    if (cloud.loading) return <div className="splash"><Logo as="div" /></div>
    if (!cloud.session || !cloud.uploader || cloud.recovering) return <Gate />
  }

  // Wait for saved work to load so a reload lands back where you were.
  if (!ready) return <div className="splash"><Logo as="div" /></div>

  return (
    <FontsContext.Provider value={fontsTick}>
      {projectId ? (
        <Editor key={projectId} projectId={projectId} />
      ) : path === '/settings' ? (
        <Settings />
      ) : albumId ? (
        <Album key={albumId} albumId={albumId} />
      ) : (
        <Home />
      )}
      <SharedInbox />
      <CloudSync />
    </FontsContext.Provider>
  )
}
