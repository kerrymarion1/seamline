// The holidays Hugpix keeps, by the calendar: each one's month (its season,
// see seasonHoliday), its day, and its album each year. The
// family's holiday album is made by the calendar, whatever look a phone has
// chosen; see components/HolidayHome.jsx.

const DAY = 864e5

// The fourth Thursday of November.
const thanksgiving = (y) => {
  const first = new Date(y, 10, 1).getDay()
  return new Date(y, 10, 1 + ((4 - first + 7) % 7) + 21)
}

// `font` and `ink`: its name's lettering and colour on a dark page (the same
// as the greeting's seasonal word in styles.css).
export const HOLIDAYS = [
  { id: 'newyear', name: 'New Year', plural: 'New Years', month: 0, dayOf: (y) => new Date(y, 0, 1), font: "400 1em/1 'Bebas Neue', sans-serif", ink: '#f5c451' },
  { id: 'july4', name: 'Fourth of July', plural: 'Fourths of July', month: 6, dayOf: (y) => new Date(y, 6, 4), font: "800 0.8em/1.05 'Fraunces Variable', serif", ink: '#ff4d5e' },
  { id: 'halloween', name: 'Halloween', plural: 'Halloweens', month: 9, dayOf: (y) => new Date(y, 9, 31), font: "400 0.85em/1.1 'Creepster', serif", ink: '#ff7518' },
  { id: 'thanksgiving', name: 'Thanksgiving', plural: 'Thanksgivings', month: 10, dayOf: thanksgiving, font: "400 0.9em/1.05 'Lobster', serif", ink: '#f2b45a' },
  { id: 'christmas', name: 'Christmas', plural: 'Christmases', month: 11, dayOf: (y) => new Date(y, 11, 25), font: "700 1em/1 'Mountains of Christmas', serif", ink: '#e8c372' },
]
export const holidayById = (id) => HOLIDAYS.find((h) => h.id === id) ?? null

// Today. On localhost a date can be tried instead (localStorage
// 'hugpix:today' = '2026-12-03'), to see what each part of the year shows.
export function today() {
  if (import.meta.env.DEV) {
    try {
      const t = localStorage.getItem('hugpix:today')
      if (t) return new Date(`${t}T12:00`)
    } catch {
      // Storage blocked: the real day.
    }
  }
  return new Date()
}

const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
// The holiday as it falls in `year`: { ...holiday, year, day }.
export const holidayIn = (h, year) => ({ ...h, year, day: h.dayOf(year) })

// The holiday whose season it is, or null: each holiday has its month, except
// that Christmas starts the day after Thanksgiving. The Auto look
// (lib/theme.js) and the front page's holiday follow this.
export function seasonHoliday(date = today()) {
  const d = startOf(date)
  const id = d.getMonth() === 10 && d > thanksgiving(d.getFullYear()) ? 'christmas' : HOLIDAYS.find((x) => x.month === d.getMonth())?.id
  return id ? holidayById(id) : null
}

// The holiday whose season it is, as it falls this year, or null.
export function holidayNow(date = today()) {
  const h = seasonHoliday(date)
  return h ? holidayIn(h, date.getFullYear()) : null
}

// Whole days from `date` to the holiday's day (0 on the day, less after).
export const daysTo = (h, date = today()) => Math.round((startOf(h.day) - startOf(date)) / DAY)

// "24 days to go", "Thursday · 3 days to go", "Tomorrow", "Today", or null once it is past.
export function countdown(h, date = today()) {
  const n = daysTo(h, date)
  if (n < 0) return null
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n <= 6) return `${h.day.toLocaleDateString(undefined, { weekday: 'long' })} · ${n} days to go`
  return `${n} days to go`
}

// The Sunday after the holiday: when its album has had its week, and the recap is made.
export function sundayAfter(h) {
  const d = startOf(h.day)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - d.getDay()))
}

// The holiday whose recap is showing: from the Sunday after it, for a week.
// Christmas's runs into January, so the holidays of last year count too.
export function recapNow(date = today()) {
  const today = startOf(date)
  for (const year of [date.getFullYear(), date.getFullYear() - 1]) {
    for (const h of HOLIDAYS) {
      const at = holidayIn(h, year)
      const from = sundayAfter(at)
      if (today >= from && today - from < 7 * DAY) return at
    }
  }
  return null
}

// The album Hugpix makes for a holiday: one id per holiday and year, so two
// phones making it at once make the same one.
export const holidayAlbumId = (id, year) => `holiday-${id}-${year}`

// The family's album for a holiday in a year: one marked as it by hand first
// (with photos first), else the one Hugpix made.
export function holidayAlbum(albums, id, year) {
  const all = albums.filter((a) => a.holiday?.id === id && a.holiday.year === year)
  const made = holidayAlbumId(id, year)
  return all.filter((a) => a.id !== made).sort((a, b) => b.imageIds.length - a.imageIds.length)[0] ?? all.find((a) => a.id === made) ?? null
}

// Words that name each holiday in an album's name.
const NAMED = {
  newyear: /new\s*year|\bnye\b/i,
  july4: /(4th|fourth)\s+of\s+july|july\s*4(th)?\b|independence\s+day/i,
  halloween: /hall?ow(e|ee)n/i,
  thanksgiving: /thanks\s*giving|turkey\s+day/i,
  christmas: /christmas|x-?mas|navidad|no[eë]l/i,
}

// An album the family made for the holiday themselves, not marked as it
// (`h` as holidayIn gives it): its name says the holiday, and it is this
// year's, by the year in its name ("Christmas 26", "Christmas 2026") or by
// being made in the two months before the day. The one with the most photos;
// secret albums, and albums already some holiday's or family day's, are left alone.
export function holidayCandidate(albums, h) {
  const words = NAMED[h.id]
  if (!words) return null
  const yy = String(h.year % 100).padStart(2, '0')
  const year = new RegExp(`(^|\\D)(${h.year}|'?${yy})(\\D|$)`)
  const from = h.day.getTime() - 61 * DAY
  const until = h.day.getTime() + 14 * DAY
  return albums
    .filter((a) => !a.secret && !a.holiday && !a.familyDay && words.test(a.name ?? ''))
    .filter((a) => year.test(a.name) || (a.createdAt >= from && a.createdAt <= until))
    .sort((a, b) => b.imageIds.length - a.imageIds.length)[0] ?? null
}

// Every year's album for one holiday, the newest first (one a year).
export function holidayYears(albums, id) {
  const years = [...new Set(albums.filter((a) => a.holiday?.id === id).map((a) => a.holiday.year))].sort((a, b) => b - a)
  return years.map((year) => holidayAlbum(albums, id, year)).filter(Boolean)
}

// "Thanksgiving 2026", or "New Year 2027".
export const holidayName = (h) => `${h.name} ${h.year}`

// ---------- Advent: a photo a day, December 1 to 24 ----------
// Something to look for each day, for the family's Christmas album.
export const ADVENT = [
  'Something red', 'Your front door', 'A window', 'Something warm to drink', 'Lights', 'Something you made',
  'Hands', 'A tree', 'Something sweet', 'Outside today', 'A favourite ornament', 'Something green',
  'Wrapping', 'Someone laughing', 'Something old', 'Your table', 'A card or a letter', 'Something that sparkles',
  'A pet, or a friend', 'Shoes by the door', 'After dark', 'Something cooking', 'Getting ready', 'Christmas Eve',
]

// Which day of Advent it is (1 to 24), or null.
export function adventDay(date = today()) {
  return date.getMonth() === 11 && date.getDate() <= 24 ? date.getDate() : null
}

// The days of Advent that have a photo: added to the album on that December day.
// `addedAt` gives when a photo was added (lib/store.js).
export function adventDone(album, year, addedAt) {
  const days = new Set()
  for (const id of album?.imageIds ?? []) {
    const d = new Date(addedAt(id))
    if (d.getFullYear() === year && d.getMonth() === 11 && d.getDate() <= 24) days.add(d.getDate())
  }
  return days
}

// ---------- each person's holidays ----------
// The holidays someone has turned off for themselves (screens/Holidays.jsx):
// no theme for it on Auto, no card on the front page. Kept on the phone.
const OFF = 'hugpix:holidaysOff'
export function holidaysOff() {
  try {
    const list = JSON.parse(localStorage.getItem(OFF) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
export const holidayOn = (id) => !holidaysOff().includes(id)
export function saveHolidaysOff(ids) {
  try {
    if (ids.length) localStorage.setItem(OFF, JSON.stringify(ids))
    else localStorage.removeItem(OFF)
  } catch {
    // Storage blocked: the choice lasts until the app closes.
  }
}

// ---------- family days (lib/familyDays.js) ----------
// "Regine's birthday", "Kerry and Regine's anniversary", or the day's own name.
export const familyDayTitle = (d) =>
  d.kind === 'birthday' ? `${d.name}'s birthday` : d.kind === 'anniversary' ? `${d.name}'s anniversary` : d.name
// "Happy birthday, Regine", "Happy anniversary, Kerry and Regine", "Happy Gotcha day".
export const familyDayGreeting = (d) =>
  d.kind === 'birthday' ? `Happy birthday, ${d.name}` : d.kind === 'anniversary' ? `Happy anniversary, ${d.name}` : `Happy ${d.name}`
// When it next comes (today included), as a date.
export function familyDayNext(d, date = today()) {
  const from = startOf(date)
  const at = (y) => new Date(y, d.month - 1, Math.min(d.day, new Date(y, d.month, 0).getDate()))
  const thisYear = at(from.getFullYear())
  return thisYear >= from ? thisYear : at(from.getFullYear() + 1)
}
export const familyDayToday = (d, date = today()) => daysTo({ day: familyDayNext(d, date) }, date) === 0
// The album for a family day each year, made the same way as a holiday's.
export const familyDayAlbumId = (id, year) => `day-${id}-${year}`
