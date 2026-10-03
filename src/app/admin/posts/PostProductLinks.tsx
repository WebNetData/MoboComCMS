'use client'

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

type Link = { type: 'product'; id: number }
type Product = { id: number; name: string; nameEn: string; slug: string; active: boolean; approval: string }

export default function PostProductLinks({ form, setForm }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>> }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const links: Link[] = Array.isArray(form.itemLinks) ? form.itemLinks : []
  const ids = links.filter((link) => link.type === 'product').map((link) => link.id)
  const selectedKey = ids.join(',')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Product[]>([])
  const [details, setDetails] = useState<Record<number, Product>>({})
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
    const params = new URLSearchParams({ ids: selectedKey })
    if (search.length >= 2) params.set('q', search)
    fetch(`/api/admin/journal/link-products?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('picker'); return response.json() })
      .then((data: { matches: Product[]; selected: Product[] }) => {
        if (controller.signal.aborted) return
        setMatches(data.matches || [])
        setDetails((previous) => Object.fromEntries([...Object.values(previous), ...(data.selected || []), ...(data.matches || [])].map((product) => [product.id, product])))
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, selectedKey])

  const chosen = useMemo(() => new Set(ids), [selectedKey])
  function add(product: Product) {
    if (chosen.has(product.id) || links.length >= 12) return
    setForm((current) => ({ ...current, itemLinks: [...(Array.isArray(current.itemLinks) ? current.itemLinks : []), { type: 'product', id: product.id }] }))
  }
  function remove(id: number) {
    setForm((current) => ({ ...current, itemLinks: (Array.isArray(current.itemLinks) ? current.itemLinks : []).filter((link: Link) => !(link.type === 'product' && link.id === id)) }))
  }

  return <section className="grid-column-span-3 card" aria-label={fa ? 'محصولات مرتبط' : 'Related products'}>
    <h3>{fa ? 'محصولات مرتبط' : 'Related products'}</h3>
    <p className="muted">{fa ? 'این مقاله در بخش مطالب مرتبط محصولات انتخاب شده نمایش داده می‌شود.' : 'This article appears in the related stories of selected products.'}</p>
    <div className="flex flex-wrap gap-2 mb-3">
      {ids.map((id) => <button type="button" className="btn btn-secondary" key={id} onClick={() => remove(id)} aria-label={fa ? `حذف محصول ${details[id]?.name || id}` : `Remove product ${details[id]?.nameEn || details[id]?.name || id}`}>
        {fa ? details[id]?.name || `#${id}` : details[id]?.nameEn || details[id]?.name || `#${id}`} ×
      </button>)}
    </div>
    <label htmlFor="post-product-search">{fa ? 'جست‌وجوی محصول' : 'Search products'}</label>
    <input id="post-product-search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? 'نام یا شناسهٔ محصول' : 'Product name or slug'} autoComplete="off" />
    {loading && <p className="muted" role="status">{fa ? 'در حال جست‌وجو…' : 'Searching…'}</p>}
    {error && <p role="alert">{fa ? 'دریافت محصولات ناموفق بود.' : 'Could not load products.'}</p>}
    {!loading && !error && search.length >= 2 && matches.length === 0 && <p className="muted">{fa ? 'محصولی پیدا نشد.' : 'No products found.'}</p>}
    {!error && matches.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{matches.filter((product) => !chosen.has(product.id)).map((product) => <button type="button" className="btn btn-secondary" key={product.id} onClick={() => add(product)} disabled={links.length >= 12}>{fa ? product.name : product.nameEn || product.name} +</button>)}</div>}
  </section>
}
