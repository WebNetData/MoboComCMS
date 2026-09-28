'use client'

import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

type Suggestion = { type: string; title: string; subtitle: string; url: string; image: string }
const TYPE_LABEL: Record<string, string> = { software: 'نرم‌افزار', game: 'بازی', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ', artist: 'هنرمند', product: 'محصول', post: 'مقاله', thread: 'تالار' }

/**
 * Header search: a button (and the "/" or Ctrl+K shortcut) opens a dialog with
 * live suggestions from /api/search; Enter opens the full results page.
 */
export default function SiteSearch({ className = '' }: { className?: string }) {
  const enabled = useModuleEnabled('search')
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)

  const open = useCallback(() => {
    dialog.current?.showModal()
    requestAnimationFrame(() => input.current?.focus())
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) { event.preventDefault(); open() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/search?suggest=1&q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => { setResults(data?.results || []); setActive(-1) })
        .catch(() => undefined)
        .finally(() => setLoading(false))
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  if (!enabled) return null

  const go = (href: string) => { dialog.current?.close(); router.push(href) }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActive((i) => (i + 1) % results.length) }
    else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActive((i) => (i <= 0 ? results.length - 1 : i - 1)) }
    else if (event.key === 'Enter') {
      event.preventDefault()
      if (active >= 0 && results[active]) go(results[active].url)
      else if (query.trim()) go(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <>
      <button type="button" className={`ss-trigger ${className}`} onClick={open} aria-label="جست‌وجو در سایت" title="جست‌وجو (/)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <span className="ss-trigger-label">جست‌وجو</span>
        <kbd aria-hidden="true">/</kbd>
      </button>
      <dialog ref={dialog} className="ss-dialog" aria-label="جست‌وجو در سایت" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close() }}>
        <div className="ss-box">
          <div className="ss-field">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input
              ref={input} type="search" dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
              placeholder="نرم‌افزار، بازی، فیلم، آهنگ، محصول…" aria-label="عبارت جست‌وجو" role="combobox" aria-expanded={results.length > 0}
              aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off" enterKeyHint="search"
            />
            <button type="button" className="ss-close" onClick={() => dialog.current?.close()} aria-label="بستن">Esc</button>
          </div>
          <ul id={listId} role="listbox" className="ss-results" aria-label="پیشنهادها">
            {results.map((item, index) => (
              <li key={item.url} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                <Link href={item.url} onClick={() => dialog.current?.close()} className={index === active ? 'is-active' : ''} onMouseEnter={() => setActive(index)}>
                  {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ss-thumb" aria-hidden="true">{item.title.slice(0, 1)}</span>}
                  <span className="ss-text"><b>{item.title}</b>{item.subtitle && <small>{item.subtitle}</small>}</span>
                  <span className="ss-type">{TYPE_LABEL[item.type] || item.type}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="ss-foot" aria-live="polite">
            {query.trim().length >= 2 && !loading && !results.length && <span>نتیجه‌ای پیدا نشد؛ املای دیگری امتحان کنید.</span>}
            {loading && <span>در حال جست‌وجو…</span>}
            {query.trim() && <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}>همهٔ نتایج «{query.trim()}» ←</button>}
          </div>
        </div>
      </dialog>
    </>
  )
}
