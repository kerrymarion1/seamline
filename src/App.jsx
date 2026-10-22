import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { clearTextCache } from './lib/fonts'
import { FontsContext } from './lib/fontsContext'
import AddedFx from './components/AddedFx'
import AvatarZoom from './components/AvatarZoom'
import { GreetingStage } from './components/Greetings'
import CloudSync from './components/CloudSync'
import Logo from './components/Logo'
import MessageWatcher from './components/MessageWatcher'
import Presence from './components/Presence'
import SharedInbox from './components/SharedInbox'
import { useCloud } from './lib/cloud'
import { transition } from './lib/motion'
import { useStore } from './lib/store'
import Album from './screens/Album'
import Home from './screens/Home'
import Gate from './screens/Gate'

// The front page, albums and sign-in come with the app; everything else is
// fetched the first time it is opened, so the app starts sooner.
const Editor = lazy(() => import('./screens/Editor'))
const Messages = lazy(() => import('./screens/Messages'))
const News = lazy(() => import('./screens/News'))
const Settings = lazy(() => import('./screens/Settings'))
const ShareView = lazy(() => import('./screens/ShareView'))
const Welcome = lazy(() => import('./screens/Welcome'))
const Favourites = lazy(() => import('./screens/Wall').then((m) => ({ default: m.Favourites })))
const Person = lazy(() => import('./screens/Wall').then((m) => ({ default: m.Person })))
const PlaceMap = lazy(() => import('./screens/PlaceMap'))
const splash = <div className="splash"><Logo as="div" loop /></div>

// Minimal path router: "/" and "/albums" home, "/album/:id" one album,
// "/p/:id" the editor, "/settings" account and storage, "/s/:code" a shared link,
// "/messages" and "/messages/:id" chats between people, "/news" what's new,
// "/favourites" the most loved photos, "/people/:tag" everyone tagged in
// photos, "/map" where the albums were, "/welcome" what Hugpix is. Signed out, "/" is the welcome page too, and
// "/signin" (or any other address) the sign-in page.
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
  const chatId = path.match(/^\/messages\/([^/]+)/)?.[1]
  const personTag = path.match(/^\/people\/([^/]+)/)?.[1]

  // A tapped notification asks the open app to go to an album (see public/push.js).
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    const onMessage = (e) => e.data?.type === 'seamline:open' && e.data.url?.startsWith('/') && navigate(e.data.url)
    sw.addEventListener('message', onMessage)
    return () => sw.removeEventListener('message', onMessage)
  }, [])

  // Signed in from the sign-in page: on to the front page.
  const inside = cloud.session && cloud.uploader && !cloud.recovering
  useEffect(() => {
    if (inside && path === '/signin') navigate('/', { replace: true, animate: false })
  }, [inside, path])

  // A visitor opening a shared link gets just that page, nothing of the editor.
  if (shareToken) return <Suspense fallback={splash}><ShareView key={shareToken} token={shareToken} /></Suspense>
  if (path === '/welcome') return <Suspense fallback={splash}><Welcome /></Suspense>

  // Everything else is private: it opens only for a signed-in member. Someone
  // signed out at the front door sees what Hugpix is, unless an invite link
  // brought them, which goes straight to making an account.
  if (cloud.configured) {
    if (cloud.loading) return splash
    if (!cloud.session && !cloud.recovering && path === '/' && !window.location.search) {
      return <Suspense fallback={splash}><Welcome /></Suspense>
    }
    if (!inside) return <Gate />
  }

  // Wait for saved work to load so a reload lands back where you were.
  if (!ready) return splash

  return (
    <FontsContext.Provider value={fontsTick}>
      <Suspense fallback={splash}>
        {projectId ? (
          <Editor key={projectId} projectId={projectId} />
        ) : path === '/settings' ? (
          <Settings />
        ) : chatId || path === '/messages' ? (
          <Messages chatId={chatId} />
        ) : path === '/news' ? (
          <News />
        ) : path === '/favourites' ? (
          <Favourites />
        ) : personTag ? (
          <Person key={personTag} tag={decodeURIComponent(personTag)} />
        ) : path === '/map' ? (
          <PlaceMap />
        ) : albumId ? (
          <Album key={albumId} albumId={albumId} />
        ) : (
          <Home />
        )}
      </Suspense>
      <SharedInbox />
      <CloudSync />
      <Presence />
      <MessageWatcher />
      <AddedFx />
      <GreetingStage />
      <AvatarZoom />
    </FontsContext.Provider>
  )
}
