import { useEffect, useState, useSyncExternalStore } from 'react'
import { clearTextCache } from './lib/fonts'
import { FontsContext } from './lib/fontsContext'
import CloudSync from './components/CloudSync'
import SharedInbox from './components/SharedInbox'
import { useStore } from './lib/store'
import Album from './screens/Album'
import Home from './screens/Home'
import Editor from './screens/Editor'
import Settings from './screens/Settings'
import ShareView from './screens/ShareView'

// Minimal path router: "/" projects, "/albums" albums, "/album/:id" one album,
// "/p/:id" the editor, "/settings" account and storage, "/s/:code" a shared link.
const subscribe = (cb) => {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}

export function navigate(to, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
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
  const projectId = path.match(/^\/p\/([^/]+)/)?.[1]
  const albumId = path.match(/^\/album\/([^/]+)/)?.[1]
  const shareToken = path.match(/^\/s\/([^/]+)/)?.[1]

  // A visitor opening a shared link gets just that page, nothing of the editor.
  if (shareToken) return <ShareView key={shareToken} token={shareToken} />

  // Wait for saved work to load so a reload lands back where you were.
  if (!ready) return <div className="splash">Seamline</div>

  return (
    <FontsContext.Provider value={fontsTick}>
      {projectId ? (
        <Editor key={projectId} projectId={projectId} />
      ) : path === '/settings' ? (
        <Settings />
      ) : albumId ? (
        <Album key={albumId} albumId={albumId} />
      ) : (
        <Home tab={path === '/albums' ? 'albums' : 'projects'} />
      )}
      <SharedInbox />
      <CloudSync />
    </FontsContext.Provider>
  )
}
