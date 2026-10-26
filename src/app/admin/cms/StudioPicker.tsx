'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import Portrait from '@/components/admin/ProfilePortrait'

type Studio = { id: number; name: string; logo: string; games: number; software: number }
const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The developer or publisher of a game or software title, picked from the studios already on the site, so a name is
 * written exactly like its profile and the studio's page lists the title. A studio that is not there yet can be
 * added; the title's save creates its profile. The value stays the studio's name.
 */
export default function StudioPicker({ value, onChange, label, fa = true }: { value: string; onChange: (value: string) => void; label: string; fa?: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(-1)
  const [logos, setLogos] = useState<Record<string, string>>({})
  const typed = query.trim()
  const { studios, status } = useStudioSuggestions(open ? typed : '')
  const canAdd = typed.length >= 2 && !studios.some((studio) => same(studio.name, typed))
  const total = studios.length + Number(canAdd)
  const say = (persian: string, english: string) => (fa ? persian : english)
  const pick = (studio: { name: string; logo?: string }) => {
    if (studio.logo) setLogos((current) => ({ ...current, [studio.name]: studio.logo! }))
    onChange(studio.name); setQuery(''); setOpen(false); setActive(-1)
  }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); setActive(-1) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      if (total) setActive((current) => (event.key === 'ArrowDown' ? (current + 1) % total : current <= 0 ? total - 1 : current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = studios[active] || (canAdd ? { name: typed } : null)
      if (chosen) pick(chosen)
    }
  }
  const show = open && typed.length >= 2
  const keep = (event: { preventDefault: () => void }) => event.preventDefault()
  const note = status === 'loading' ? say('در حال جست‌وجو…', 'Searching…') : status === 'error' ? say('فهرست سازندگان در دسترس نیست؛ می‌توانید نام را بنویسید و Enter بزنید.', 'Studios are unavailable; type the name and press Enter.') : studios.length ? '' : say('سازنده‌ای با این نام نیست.', 'No studio by that name.')

  return <div className="mx-people mx-studio">
    {value && <ul className="mx-people-chips" aria-label={label}><li>
      <span className="mx-people-avatar"><Portrait image={logos[value] || ''} name={value} /></span>
      <span dir="auto">{value}</span>
      <button type="button" aria-label={say(`برداشتن ${value}`, `Remove ${value}`)} onClick={() => { onChange(''); input.current?.focus() }}>×</button>
    </li></ul>}
    <div className="mx-people-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <input ref={input} id={id} className="input" type="text" role="combobox" aria-label={value ? say(`تغییر ${label}`, `Change ${label}`) : say(`انتخاب ${label}`, `Choose ${label}`)} aria-autocomplete="list" aria-expanded={show} aria-controls={id + '-list'}
        aria-activedescendant={show && active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" dir="auto" maxLength={160} value={query}
        placeholder={value ? say(`جست‌وجو برای تغییر ${label}…`, `Search to change ${label}…`) : say(`جست‌وجو و انتخاب ${label}…`, `Search and choose ${label}…`)}
        onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1) }} onKeyDown={keyboard} />
      {show && <div className="mx-people-menu">
        <ul id={id + '-list'} role="listbox" aria-label={say(`پیشنهادهای ${label}`, `${label} suggestions`)} aria-busy={status === 'loading'}>
          {studios.map((studio, index) => <li key={studio.id} id={`${id}-${index}`} role="option" aria-selected={active === index} className={active === index ? 'is-active' : undefined} onMouseDown={keep} onMouseEnter={() => setActive(index)} onClick={() => pick(studio)}>
            <span className="mx-people-avatar"><Portrait image={studio.logo} name={studio.name} /></span>
            <span className="mx-people-option"><b dir="auto">{studio.name}</b><small>{[studio.games ? say(`${studio.games.toLocaleString('fa-IR')} بازی`, `${studio.games} games`) : '', studio.software ? say(`${studio.software.toLocaleString('fa-IR')} نرم‌افزار`, `${studio.software} apps`) : ''].filter(Boolean).join(' · ') || say('بدون اثر', 'No titles yet')}</small></span>
          </li>)}
          {canAdd && <li id={`${id}-${studios.length}`} role="option" aria-selected={active === studios.length} className={`mx-people-new${active === studios.length ? ' is-active' : ''}`} onMouseDown={keep} onMouseEnter={() => setActive(studios.length)} onClick={() => pick({ name: typed })}>
            <span className="mx-people-avatar is-new" aria-hidden="true">＋</span>
            <span className="mx-people-option"><b>{say('افزودن «', 'Add “')}<bdi>{typed}</bdi>{say('» به‌عنوان سازندهٔ جدید', '” as a new studio')}</b><small>{say('پروفایلش هنگام ذخیرهٔ این اثر ساخته می‌شود', 'Its profile is created when this title is saved')}</small></span>
          </li>}
        </ul>
        {note && <p className="mx-people-note" role="status">{note}</p>}
      </div>}
    </div>
  </div>
}

function useStudioSuggestions(query: string) {
  const [result, setResult] = useState<{ query: string; status: 'ready' | 'error'; studios: Studio[] }>({ query: '', status: 'ready', studios: [] })
  const key = query.length >= 2 ? query : ''
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/studios/suggest?' + new URLSearchParams({ q: key }), { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('unavailable')
        const data = await response.json() as { studios?: Studio[] }
        if (!controller.signal.aborted) setResult({ query: key, status: 'ready', studios: Array.isArray(data.studios) ? data.studios : [] })
      } catch { if (!controller.signal.aborted) setResult({ query: key, status: 'error', studios: [] }) }
    }, 220)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key])
  return key && result.query === key ? result : { studios: [] as Studio[], status: key ? 'loading' as const : 'ready' as const }
}
