import { useEffect, useState } from 'react'
import { navigate } from '../App'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import { ReactionFace } from '../components/ReactionFaces'
import Sheet from '../components/Sheet'
import { useCloud } from '../lib/cloud'
import { addFamilyDay, mayChange, refreshFamilyDays, removeFamilyDay, updateFamilyDay, useFamilyDays } from '../lib/familyDays'
import { HOLIDAYS, daysTo, familyDayNext, familyDayTitle, holidayIn, holidayOn, today } from '../lib/holidays'
import { personIn, usePeople } from '../lib/people'
import { setHolidayOn, useHolidaysOff } from '../lib/theme'

// The holidays page (Hugpix 2): which holidays Hugpix keeps for me (their
// look on Auto, their card on the front page; each person's own choice, kept
// on the phone), and the family's days: birthdays, anniversaries and others,
// shared by everyone (lib/familyDays.js).

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }))
const dateText = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const soonText = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`)
const KINDS = [
  ['birthday', 'Birthday'],
  ['anniversary', 'Anniversary'],
  ['day', 'Another day'],
]

export default function Holidays() {
  useHolidaysOff()
  const days = useFamilyDays()
  const people = usePeople()
  const { features } = useCloud()
  const [editing, setEditing] = useState(null) // {} for a new one, else the day
  const [error, setError] = useState(null)
  useEffect(() => {
    refreshFamilyDays().catch((e) => setError(e.message))
  }, [features.familyDays])

  const now = today()
  // Each holiday when it next comes, the soonest first.
  const holidays = HOLIDAYS.map((h) => {
    const y = holidayIn(h, now.getFullYear())
    return daysTo(y) < 0 ? holidayIn(h, now.getFullYear() + 1) : y
  }).sort((a, b) => a.day - b.day)
  const family = [...days].map((d) => ({ d, next: familyDayNext(d) })).sort((a, b) => a.next - b.next)

  return (
    <div className="screen holidays">
      <header className="topbar">
        <button className="icon-btn" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/'))} aria-label="Back"><Icon name="back" /></button>
        <div className="preview-title">Holidays</div>
        <span className="topbar-spacer" />
      </header>
      <main className="holidays-body">
        <p className="hint">
          The holidays Hugpix keeps for you: each one's look on Auto, and its card on the front page. Turning one off is just for you.
        </p>
        <ul className="day-list">
          {holidays.map((h) => {
            const on = holidayOn(h.id)
            return (
              <li key={h.id} className={on ? '' : 'off'}>
                <ReactionFace kind="wave" season={h.id} size={44} still={!on} />
                <span>
                  <b>{h.name}</b>
                  <small>{dateText(h.day)} · {soonText(daysTo(h))}</small>
                </span>
                <button className={`chip small ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`${h.name} ${on ? 'on' : 'off'}`} onClick={() => setHolidayOn(h.id, !on)}>
                  {on ? 'On' : 'Off'}
                </button>
              </li>
            )
          })}
        </ul>

        <h2 className="holidays-h">Family days</h2>
        <p className="hint">Birthdays, anniversaries and other days the family keeps. On the day, everyone's front page says so, and the day gets its own album.</p>
        {!features.familyDays ? (
          <p className="hint">Family days are on their way.</p>
        ) : (
          <>
            {family.length > 0 && (
              <ul className="day-list">
                {family.map(({ d, next }) => {
                  const person = d.person ? personIn(people, d.person) : null
                  return (
                    <li key={d.id}>
                      {person ? <Avatar person={person} size={44} zoom={false} /> : <ReactionFace kind="dance" season="everyday" size={44} still />}
                      <span>
                        <b>{familyDayTitle(d)}</b>
                        <small>{next.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · {soonText(daysTo({ day: next }))}</small>
                      </span>
                      {mayChange(d) && <button className="text-btn" onClick={() => setEditing(d)}>Change</button>}
                    </li>
                  )
                })}
              </ul>
            )}
            {error && <p className="note warn">{error}</p>}
            <button className="secondary block" onClick={() => setEditing({})}>Add a family day</button>
          </>
        )}
      </main>
      <FamilyDaySheet day={editing} people={people} onClose={() => setEditing(null)} />
    </div>
  )
}

// Adding a family day, or changing or removing one.
function FamilyDaySheet({ day, people, onClose }) {
  const { session } = useCloud()
  const [kind, setKind] = useState('birthday')
  const [name, setName] = useState('')
  const [person, setPerson] = useState(null)
  const [month, setMonth] = useState(1)
  const [date, setDate] = useState(1)
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false) // asked once before removing
  const [error, setError] = useState(null)

  // Filled in from the day being changed, else blank.
  useEffect(() => {
    if (!day) return
    const now = today()
    setKind(day.kind ?? 'birthday')
    setName(day.name ?? '')
    setPerson(day.person ?? null)
    setMonth(day.month ?? now.getMonth() + 1)
    setDate(day.day ?? now.getDate())
    setYear(day.year ? String(day.year) : '')
    setSure(false)
    setError(null)
  }, [day])

  const whose = kind !== 'day'
  const longest = new Date(2024, month, 0).getDate() // February 29 allowed
  const ready = name.trim() && !busy
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const d = { kind, name, person: whose ? person : null, month, day: Math.min(date, longest), year: kind === 'birthday' ? null : Number(year) || null }
      if (day.id) await updateFamilyDay(day.id, d)
      else await addFamilyDay(d)
      onClose()
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  const remove = async () => {
    if (!sure) return setSure(true)
    setBusy(true)
    try {
      await removeFamilyDay(day.id)
      onClose()
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  const pick = (p) => {
    setPerson(p.id)
    setName(p.name.split(' ')[0])
  }

  return (
    <Sheet open={!!day} onClose={onClose} title={day?.id ? 'Change the day' : 'A family day'} modal>
      <div className="chips wrap" role="radiogroup" aria-label="What kind of day">
        {KINDS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={kind === id} className={`chip small ${kind === id ? 'on' : ''}`} onClick={() => setKind(id)}>{label}</button>
        ))}
      </div>
      {whose && (
        <>
          <div className="label">Whose</div>
          <div className="chip-line flush">
            {people.map((p) => (
              <button key={p.id} className={`chip small who-chip ${person === p.id ? 'on' : ''}`} onClick={() => pick(p)}>
                <Avatar person={p} size={22} zoom={false} />
                {p.id === session?.user.id ? 'Me' : p.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="card-field">
        <span className="label">{whose ? (person ? 'Their name, as it shows' : 'Or a name') : "What's it called?"}</span>
        <input
          className="field"
          value={name}
          maxLength={60}
          placeholder={whose ? 'Grandma, or Kerry and Regine' : 'Gotcha day'}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="day-when">
        <label className="card-field">
          <span className="label">Month</span>
          <select className="field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="card-field">
          <span className="label">Day</span>
          <select className="field" value={Math.min(date, longest)} onChange={(e) => setDate(Number(e.target.value))}>
            {Array.from({ length: longest }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        {kind !== 'birthday' && (
          <label className="card-field">
            <span className="label">Since</span>
            <input className="field" inputMode="numeric" value={year} maxLength={4} placeholder="Year" onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}
      </div>
      {error && <p className="preview-error">{error}</p>}
      <button className="primary block" disabled={!ready} onClick={save}>{busy ? 'Saving…' : day?.id ? 'Save' : 'Add it'}</button>
      {day?.id && <button className="text-btn danger" disabled={busy} onClick={remove}>{sure ? `Remove ${familyDayTitle(day)} for everyone` : 'Remove this day'}</button>}
    </Sheet>
  )
}
