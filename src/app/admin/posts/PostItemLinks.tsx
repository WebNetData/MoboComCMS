'use client'

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { ITEM_LABEL, LINKABLE } from '@/modules/content/domain/items'

type Link = { type: string; id: number }
type Card = { type: string; id: number; title: string; titleEn?: string; url: string; image: string }

/** English copy for the picker; Persian labels come from the shared content registry. */
const EN: Record<string, string> = {
  product: 'Product', game: 'Game', software: 'Software', title: 'Movie or series',
  studio: 'Studio', album: 'Album', track: 'Track', artist: 'Artist',
}
const linkKey = (link: Link) => `${link.type}:${link.id}`

export default function PostItemLinks({ form, setForm }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>> }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const links: Link[] = Array.isArray(form.itemLinks) ? form.itemLinks : []
  const selectedKey = links.map(linkKey).join(',')
  const [type, setType] = useState<string>('product')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Card[]>([])
  const [details, setDetails] = useState<Record<string, Card>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({ type, refs: selectedKey })
    if (search.length >= 2) params.set('q', search)
    fetch(`/api/admin/journal/link-items?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('picker'); return response.json() })
      .then((data: { matches: Card[]; selected: Card[] }) => {
        if (controller.signal.aborted) return
        setMatches(data.matches || [])
        setDetails(Object.fromEntries([...(data.selected || []), ...(data.matches || [])].map((card) => [linkKey(card), card])))
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [type, search, selectedKey])

  const chosen = useMemo(() => new Set(links.map(linkKey)), [selectedKey])
  function add(card: Card) {
    if (chosen.has(linkKey(card)) || links.length >= 12) return
    setForm((current) => ({ ...current, itemLinks: [...(Array.isArray(current.itemLinks) ? current.itemLinks : []), { type: card.type, id: card.id }] }))
  }
  function remove(link: Link) {
    setForm((current) => ({ ...current, itemLinks: (Array.isArray(current.itemLinks) ? current.itemLinks : []).filter((entry: Link) => linkKey(entry) !== linkKey(link)) }))
  }
  const cardTitle = (card: Card) => fa ? card.title : card.titleEn || card.title
  const label = (ref: Link) => { const card = details[linkKey(ref)]; return card ? cardTitle(card) : `#${ref.id}` }

  return <section className="grid-column-span-3 card" aria-label={fa ? 'محتوای مرتبط' : 'Related content'}>
    <h3>{fa ? 'محتوای مرتبط' : 'Related content'}</h3>
    <p className="muted">{fa ? 'موارد انتخاب‌شده در صفحهٔ این مقاله نمایش داده می‌شوند.' : 'Selected items appear on this article page.'}</p>
    <div className="flex flex-wrap gap-2 mb-3">
      {links.map((link) => <button type="button" className="btn btn-secondary" key={linkKey(link)} onClick={() => remove(link)} aria-label={fa ? `حذف ${label(link)}` : `Remove ${label(link)}`}>
        {label(link)} ×
      </button>)}
    </div>
    <label htmlFor="post-item-type">{fa ? 'نوع محتوا' : 'Content type'}</label>
    <select id="post-item-type" className="input" value={type} onChange={(event) => setType(event.target.value)}>
      {LINKABLE.filter((value) => value !== 'post' && value !== 'thread').map((value) => <option key={value} value={value}>{fa ? ITEM_LABEL[value]?.one : EN[value] || value}</option>)}
    </select>
    <label htmlFor="post-item-search">{fa ? 'جست‌وجوی مورد' : 'Search items'}</label>
    <input id="post-item-search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? 'نام یا شناسهٔ مورد' : 'Item name or slug'} autoComplete="off" />
    {loading && <p className="muted" role="status">{fa ? 'در حال جست‌وجو…' : 'Searching…'}</p>}
    {error && <p role="alert">{fa ? 'دریافت موارد ناموفق بود.' : 'Could not load items.'}</p>}
    {!loading && !error && search.length >= 2 && matches.length === 0 && <p className="muted">{fa ? 'موردی پیدا نشد.' : 'No items found.'}</p>}
    {!error && matches.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{matches.filter((card) => !chosen.has(linkKey(card))).map((card) => <button type="button" className="btn btn-secondary" key={linkKey(card)} onClick={() => add(card)} disabled={links.length >= 12}>{cardTitle(card)} +</button>)}</div>}
  </section>
}
