import { useId, useMemo, useRef, useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'

// Choosing people by name: type, and the names that match drop down (those
// starting with what was typed first, then any containing it). Enter or a tap
// adds one; they show as chips, each with a cross. Backspace in an empty box
// takes the last one off. `people` are { id, name, role }; `value` the chosen
// ids; `locked` ids are shown but can't be removed (yourself, say).
export default function PeoplePicker({ people, value, onChange, locked = [], placeholder = 'Type a name' }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef(null)
  const listId = useId()
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const q = query.trim().toLowerCase()
  const matches = q
    ? people
        .filter((p) => !value.includes(p.id) && p.name.toLowerCase().includes(q))
        .sort((a, b) => {
          const sa = a.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) ? 0 : 1
          const sb = b.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) ? 0 : 1
          return sa - sb || a.name.localeCompare(b.name)
        })
        .slice(0, 6)
    : []

  const add = (person) => {
    onChange([...value, person.id])
    setQuery('')
    setActive(0)
    input.current?.focus()
  }
  const remove = (id) => onChange(value.filter((x) => x !== id))

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if ((e.key === 'Enter' || e.key === 'Tab') && matches.length) {
      e.preventDefault()
      add(matches[Math.min(active, matches.length - 1)])
    } else if (e.key === 'Backspace' && !query) {
      const last = [...value].reverse().find((id) => !locked.includes(id))
      if (last) remove(last)
    }
  }

  // The rest of the name, faintly, after what has been typed: Enter takes it.
  const top = matches[Math.min(active, matches.length - 1)]
  const hint = top && top.name.toLowerCase().startsWith(q) ? top.name.slice(query.length) : ''

  return (
    <div className="people-pick">
      <div className="people-box" onClick={() => input.current?.focus()}>
        {value.map((id) => (
          <span key={id} className="people-chip">
            <Avatar person={byId.get(id)} size={22} />
            {byId.get(id)?.name ?? 'Someone'}
            {!locked.includes(id) && (
              <button type="button" aria-label={`Take ${byId.get(id)?.name ?? 'them'} off`} onClick={() => remove(id)}>
                <Icon name="close" size={12} />
              </button>
            )}
          </span>
        ))}
        <span className="people-type">
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={value.length ? '' : placeholder}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="both"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="done"
          />
          {hint && <span className="people-hint" aria-hidden="true"><i>{query}</i>{hint}</span>}
        </span>
      </div>
      {matches.length > 0 && (
        <ul className="people-matches" id={listId} role="listbox">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={i === active ? 'on' : ''}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(p)}
              >
                <Avatar person={p} size={30} />
                {p.name}
                {p.role === 'guest' && <small>guest</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && !matches.length && <p className="note">No one by that name in Hugpix.</p>}
    </div>
  )
}
