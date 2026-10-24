'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import Portrait from '@/components/admin/ProfilePortrait'
import { normalizePersonName, splitPeopleLine } from '@/modules/cinema/domain/people'

type Suggestion = { id: number; name: string; image: string; roles: string[] }
export type CastRow = { name: string; role?: string; image?: string }
const ROLE_FA: Record<string, string> = { DIRECTOR: 'کارگردان', PRODUCER: 'تهیه‌کننده', CAST: 'بازیگر' }

/**
 * Picks the people of a film or series from the people already on the site, so a name is written exactly like
 * its profile and the person's page and the browse filters find the title. A name that is not there yet can be
 * added; the title's save creates its profile. `line` keeps a director or producer line ("a، b"); `cast` keeps the
 * cast list with each actor's character and order.
 */
export default function PeoplePicker({ mode, value, onChange, label, fa }: { mode: 'line' | 'cast'; value: unknown; onChange: (value: unknown) => void; label: string; fa: boolean }) {
  const rows: CastRow[] = mode === 'line' ? splitPeopleLine(value).map((name) => ({ name })) : (Array.isArray(value) ? value : []).filter((row): row is CastRow => !!row && typeof row.name === 'string')
  const [images, setImages] = useState<Record<string, string>>({})
  const emit = (next: CastRow[]) => onChange(mode === 'line' ? next.map((row) => row.name).join('، ') : next)
  const keyOf = (name: string) => normalizePersonName(name)
  const add = (person: { name: string; image?: string }) => {
    const name = person.name.trim()
    if (keyOf(name).length < 2 || rows.some((row) => keyOf(row.name) === keyOf(name))) return
    if (person.image) setImages((current) => ({ ...current, [keyOf(name)]: person.image! }))
    emit([...rows, mode === 'cast' ? { name, role: '', image: person.image || '' } : { name }])
  }
  const update = (index: number, patch: Partial<CastRow>) => emit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const move = (index: number, delta: number) => { const next = [...rows], target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; emit(next) }
  const remove = (index: number) => emit(rows.filter((_, i) => i !== index))

  return <div className={`mx-people is-${mode}`}>
    {rows.length > 0 && (mode === 'line'
      ? <ul className="mx-people-chips" aria-label={label}>{rows.map((row, index) => <li key={keyOf(row.name)}>
          <span className="mx-people-avatar"><Portrait image={images[keyOf(row.name)] || ''} name={row.name} /></span>
          <span dir="auto">{row.name}</span>
          <button type="button" aria-label={fa ? `حذف ${row.name}` : `Remove ${row.name}`} onClick={() => remove(index)}>×</button>
        </li>)}</ul>
      : <ol className="mx-cast" aria-label={label}>{rows.map((row, index) => <li key={keyOf(row.name)}>
          <span className="mx-cast-no">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>
          <span className="mx-people-avatar"><Portrait image={row.image || images[keyOf(row.name)] || ''} name={row.name} /></span>
          <span className="mx-cast-name" dir="auto">{row.name}</span>
          <input className="input" aria-label={fa ? `نقش ${row.name}` : `${row.name}'s character`} placeholder={fa ? 'نام نقش (اختیاری)' : 'Character (optional)'} dir="auto" maxLength={120} value={row.role || ''} onChange={(event) => update(index, { role: event.target.value })} />
          <span className="mx-row-tools">
            <button type="button" className="badge badge-gray" aria-label={fa ? `${row.name} بالاتر` : `Move ${row.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="badge badge-gray" aria-label={fa ? `${row.name} پایین‌تر` : `Move ${row.name} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="badge badge-red" aria-label={fa ? `حذف ${row.name}` : `Remove ${row.name}`} onClick={() => remove(index)}>✕</button>
          </span>
        </li>)}</ol>)}
    <PersonSearch label={label} fa={fa} taken={new Set(rows.map((row) => keyOf(row.name)))} onPick={add} />
  </div>
}

type Pick = { name: string; image?: string }
/** Arrow keys move through the suggestions and the "add as new" row; the result wraps around. */
const step = (key: string, current: number, total: number) => key === 'ArrowDown' ? (current + 1) % total : current <= 0 ? total - 1 : current - 1

function PersonSearch({ label, fa, taken, onPick }: { label: string; fa: boolean; taken: Set<string>; onPick: (person: Pick) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(-1)
  const { options, status } = useSuggestions(open ? query.trim() : '')
  const typed = query.trim(), key = normalizePersonName(typed)
  const free = options.filter((person) => !taken.has(normalizePersonName(person.name)))
  // The last choice is "add as a new person" when nobody of that exact name is in the list.
  const canAdd = key.length >= 2 && !taken.has(key) && !options.some((person) => normalizePersonName(person.name) === key)
  const total = free.length + Number(canAdd)
  const pick = (person: Pick) => { onPick(person); setQuery(''); setActive(-1); input.current?.focus() }
  const say = (persian: string, english: string) => (fa ? persian : english)
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); setActive(-1) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); if (total) setActive((current) => step(event.key, current, total)) }
    else if (event.key === 'Enter') { event.preventDefault(); const chosen = free[active] || (canAdd ? { name: typed } : null); if (chosen) pick(chosen) }
  }
  const show = open && key.length >= 2
  return <div className="mx-people-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <input ref={input} id={id} className="input" type="text" role="combobox" aria-label={say(`افزودن ${label}`, `Add ${label}`)} aria-autocomplete="list" aria-expanded={show} aria-controls={id + '-list'}
      aria-activedescendant={show && active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" dir="auto" maxLength={120} value={query}
      placeholder={say(`جست‌وجو و افزودن ${label}…`, `Search and add ${label}…`)} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1) }} onKeyDown={keyboard} />
    {show && <SuggestionMenu id={id} label={label} say={say} people={free} typed={canAdd ? typed : ''} active={active} status={status} onActive={setActive} onPick={pick} />}
  </div>
}

function SuggestionMenu({ id, label, say, people, typed, active, status, onActive, onPick }: { id: string; label: string; say: (persian: string, english: string) => string; people: Suggestion[]; typed: string; active: number; status: string; onActive: (index: number) => void; onPick: (person: Pick) => void }) {
  const note = status === 'loading' ? say('در حال جست‌وجو…', 'Searching…') : status === 'error' ? say('فهرست افراد در دسترس نیست؛ می‌توانید نام را بنویسید و Enter بزنید.', 'People could not be loaded; type the name and press Enter.') : people.length ? say('با کلیدهای جهت و Enter انتخاب کنید.', 'Use the arrow keys and Enter.') : say('کسی با این نام ثبت نشده است.', 'Nobody with this name yet.')
  const keep = (event: { preventDefault: () => void }) => event.preventDefault()
  return <div className="mx-people-menu">
    <ul id={id + '-list'} role="listbox" aria-label={say(`پیشنهادهای ${label}`, `${label} suggestions`)} aria-busy={status === 'loading'}>
      {people.map((person, index) => <li key={person.id} id={`${id}-${index}`} role="option" aria-selected={active === index} className={active === index ? 'is-active' : undefined} onMouseDown={keep} onMouseEnter={() => onActive(index)} onClick={() => onPick(person)}>
        <span className="mx-people-avatar"><Portrait image={person.image} name={person.name} /></span>
        <span className="mx-people-option"><b dir="auto">{person.name}</b><small>{person.roles.map((role) => ROLE_FA[role] || role).join(' · ') || say('بدون اثر', 'No credits yet')}</small></span>
      </li>)}
      {typed && <li id={`${id}-${people.length}`} role="option" aria-selected={active === people.length} className={`mx-people-new${active === people.length ? ' is-active' : ''}`} onMouseDown={keep} onMouseEnter={() => onActive(people.length)} onClick={() => onPick({ name: typed })}>
        <span className="mx-people-avatar is-new" aria-hidden="true">＋</span>
        <span className="mx-people-option"><b>{say('افزودن «', 'Add “')}<bdi>{typed}</bdi>{say('» به‌عنوان فرد جدید', '” as a new person')}</b><small>{say('پروفایلش هنگام ذخیرهٔ این اثر ساخته می‌شود', 'Their profile is created when this title is saved')}</small></span>
      </li>}
    </ul>
    <p className="mx-people-note" role="status">{note}</p>
  </div>
}

function useSuggestions(query: string) {
  const [result, setResult] = useState<{ query: string; status: 'ready' | 'error'; options: Suggestion[] }>({ query: '', status: 'ready', options: [] })
  const key = normalizePersonName(query).length >= 2 ? query : ''
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/cinema/people/suggest?' + new URLSearchParams({ q: key }), { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('unavailable')
        const data = await response.json() as { people?: Suggestion[] }
        if (!controller.signal.aborted) setResult({ query: key, status: 'ready', options: Array.isArray(data.people) ? data.people : [] })
      } catch { if (!controller.signal.aborted) setResult({ query: key, status: 'error', options: [] }) }
    }, 220)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key])
  return key && result.query === key ? result : { options: [] as Suggestion[], status: key ? 'loading' as const : 'ready' as const }
}
