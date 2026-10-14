import { flushSync } from 'react-dom'

// Movement between states of the page, using the browser's view transitions
// where it has them. Without them, or when the person has asked their device
// for less motion, the change simply happens at once.
const still = () => !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches
const root = document.documentElement

// Change the page with an animation. `kind` picks which (see styles.css):
// 'forward' and 'back' slide between screens, 'fade' just cross-fades.
export function transition(update, kind = 'fade') {
  if (still()) return update()
  root.dataset.nav = kind
  const t = document.startViewTransition(() => flushSync(update))
  t.finished.finally(() => root.dataset.nav === kind && delete root.dataset.nav)
}

// Grow one thing into another, or shrink it back: a photo out of its tile
// into the full-size viewer ('photo'), or an album's card into the album's
// own screen ('album'). `from` and `to` return the element before and after
// the change. The viewer's photo is tagged in styles.css, so for 'photo'
// whichever side is the viewer is left out.
export function morph(update, { from, to, name = 'photo' } = {}) {
  if (still()) return update()
  const tag = (el, value) => el && (el.style.viewTransitionName = value)
  const start = from?.()
  tag(start, name)
  root.dataset.nav = name
  const t = document.startViewTransition(() => {
    tag(start, '')
    flushSync(update)
    tag(to?.(), name)
  })
  t.finished.finally(() => {
    tag(to?.(), '')
    if (root.dataset.nav === name) delete root.dataset.nav
  })
}

// For <img className="fade" onLoad={fadeIn} onError={fadeIn}>: the picture
// eases in once it has arrived instead of popping.
export const fadeIn = (e) => e.currentTarget.classList.add('in')
