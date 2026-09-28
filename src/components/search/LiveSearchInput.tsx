'use client'

import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

type Suggestion = { type: string; title: string; subtitle: string; url: string; image: string }
const TYPE_LABEL: Record<string, string> = { software: 'نرم‌افزار', game: 'بازی', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ', artist: 'هنرمند', product: 'محصول', post: 'مقاله', thread: 'تالار' }

/** Item types a section's search box suggests, from the form's (internal) action path. */
export function searchTypesFor(action: string): string[] {
  const path = action.split('?')[0]
  if (path.startsWith('/cinema')) return ['title']
  if (path.startsWith('/music')) return ['track', 'album', 'artist']
  if (path.startsWith('/games')) return ['game']
  if (path.startsWith('/software')) return ['software']
  if (path.startsWith('/products') || path.startsWith('/shop')) return ['product']
  if (path.startsWith('/blog')) return ['post']
  if (path.startsWith('/forum')) return ['thread']
  return []
}

/**
 * Drop-in replacement for a section search `<input name="q">`: suggestions
 * appear while typing (AJAX, from /api/search), arrow keys move through them,
 * Enter opens the highlighted one — otherwise the surrounding form submits to
 * the section's full results page as before.
 */
export default function LiveSearchInput({ action, name = 'q', defaultValue = '', placeholder, types, className = '', inputClassName = '', maxLength = 120, autoFocus }: {
  action: string; name?: string; defaultValue?: string; placeholder: string; types?: string[]; className?: string; inputClassName?: string; maxLength?: number; autoFocus?: boolean
}) {
  const enabled = useModuleEnabled('search')
  const router = useRouter()
  const listId = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const [query, setQuery] = useState(defaultValue)
  const [results, setResults] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const only = (types ?? searchTypesFor(action)).join(',')

  useEffect(() => {
    const q = query.trim()
    if (!enabled || q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/search?suggest=1&q=${encodeURIComponent(q)}${only ? `&types=${only}` : ''}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => { setResults(data?.results || []); setActive(-1) })
        .catch(() => undefined)
        .finally(() => setLoading(false))
    }, 220)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, only, enabled])

  // Close when focus or a click leaves the box.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const showList = open && query.trim().length >= 2 && (results.length > 0 || !loading)
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return
    if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActive((i) => (i + 1) % results.length) }
    else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActive((i) => (i <= 0 ? results.length - 1 : i - 1)) }
    else if (event.key === 'Escape') { setOpen(false); setActive(-1) }
    else if (event.key === 'Enter' && active >= 0 && results[active]) { event.preventDefault(); setOpen(false); router.push(results[active].url) }
  }

  return <span ref={wrap} className={`ls-wrap ${className}`} dir="rtl">
    <input
      name={name} type="search" dir="rtl" value={query} maxLength={maxLength} placeholder={placeholder} aria-label={placeholder} className={inputClassName}
      autoComplete="off" enterKeyHint="search" autoFocus={autoFocus} role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
      onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
      onBlur={(event) => { if (!wrap.current?.contains(event.relatedTarget as Node)) setOpen(false) }}
    />
    {showList && <span className="ls-panel">
      {results.length > 0 ? <ul id={listId} role="listbox" className="ls-list" aria-label="پیشنهادها">
        {results.map((item, index) => <li key={item.url} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
          <Link href={item.url} className={index === active ? 'is-active' : ''} onMouseEnter={() => setActive(index)} onClick={() => setOpen(false)}>
            {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ls-thumb" aria-hidden="true">{item.title.slice(0, 1)}</span>}
            <span className="ls-text"><b>{item.title}</b>{item.subtitle && <small>{item.subtitle}</small>}</span>
            {!only.includes(',') && only ? null : <span className="ls-type">{TYPE_LABEL[item.type] || item.type}</span>}
          </Link>
        </li>)}
      </ul> : <span className="ls-empty" role="status">چیزی پیدا نشد؛ عبارت دیگری امتحان کنید.</span>}
      <span className="ls-foot">{loading ? <span role="status">در حال جست‌وجو…</span> : <span />}<button type="submit" className="ls-all">همهٔ نتایج «{query.trim()}» ←</button></span>
    </span>}
  </span>
}
