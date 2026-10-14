// What visitors have done since the app was last opened on this device: new
// hearts, new comments and new views on the owner's links. The counts from the
// last visit are kept on the device; this visit compares against them all
// the way through, and leaves today's counts behind for next time.
const KEY = 'seamline:seen'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

// The counts from the last visit, read once when the app starts.
const before = read()
let remembered = false

// Leave the counts as they are now, for the next visit to compare against.
// Only once per visit, after the account's activity has loaded.
export function rememberNow({ hearts, shares }) {
  if (remembered) return
  remembered = true
  try {
    localStorage.setItem(KEY, JSON.stringify({
      at: Date.now(),
      hearts: hearts.byShare,
      views: Object.fromEntries(shares.map((s) => [s.id, s.views ?? 0])),
    }))
  } catch {
    // Storage full or blocked: there is simply no news next time.
  }
}

// The album a link was made from, if it still exists.
export function albumOfShare(share, albums) {
  if (!share) return null
  if (share.kind === 'album') return albums.find((a) => a.id === share.source_id.split(':')[0]) ?? null
  if (share.kind === 'photo') return albums.find((a) => a.imageIds.includes(share.source_id)) ?? null
  return null
}

// News since the last visit, as a list of { key, text, albumId } (albumId is
// where tapping it should go). Empty on the very first visit, or when nothing
// has happened.
export function newsSince({ hearts, comments, shares }, albums) {
  if (!before) return []
  const news = []
  const byShare = new Map(shares.map((s) => [s.id, s]))

  // Hearts: compared per link, so a link made since the last visit counts in full.
  let liked = 0
  let mostLiked = null
  for (const [id, n] of Object.entries(hearts.byShare)) {
    const extra = n - (before.hearts?.[id] ?? 0)
    if (extra <= 0) continue
    liked += extra
    if (!mostLiked || extra > mostLiked.extra) mostLiked = { id, extra }
  }
  if (liked > 0) {
    const album = albumOfShare(byShare.get(mostLiked.id), albums)
    news.push({ key: 'hearts', text: `${liked} new heart${liked === 1 ? '' : 's'}`, albumId: album?.id })
  }

  // Comments: anything left after the last visit.
  const fresh = Object.values(comments).flat().filter((c) => Date.parse(c.created_at) > before.at)
  if (fresh.length) {
    const latest = fresh.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a))
    const album = albums.find((a) => a.imageIds.includes(latest.item_id))
    news.push({ key: 'comments', text: `${fresh.length} new comment${fresh.length === 1 ? '' : 's'}`, albumId: album?.id })
  }

  // Views: name the link when only one was opened.
  const opened = shares
    .map((s) => ({ share: s, extra: (s.views ?? 0) - (before.views?.[s.id] ?? 0) }))
    .filter((o) => o.extra > 0)
    .sort((a, b) => b.extra - a.extra)
  if (opened.length) {
    const total = opened.reduce((n, o) => n + o.extra, 0)
    const times = `${total} time${total === 1 ? '' : 's'}`
    const text = opened.length === 1
      ? `“${opened[0].share.title || 'Your link'}” was opened ${times}`
      : `your links were opened ${times}`
    news.push({ key: 'views', text, albumId: albumOfShare(opened[0].share, albums)?.id })
  }
  return news
}

// "Good morning", "Good afternoon", "Good evening", or late at night just "Hello".
export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 23) return 'Good evening'
  return 'Hello'
}
