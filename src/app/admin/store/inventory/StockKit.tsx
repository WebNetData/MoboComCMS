'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import './stock.css'

/** Sub-navigation of the stock hub (/admin/store/inventory/*). */
export function StockNav() {
  const pathname = usePathname()
  const tabs = [
    { href: '/admin/store/inventory', label: 'موجودی کالاها', exact: true },
    { href: '/admin/store/inventory/locations', label: 'انبارها و انتقال' },
    { href: '/admin/store/inventory/receive', label: 'ورود کالا' },
    { href: '/admin/store/inventory/count', label: 'انبارگردانی' },
  ]
  return <nav className="st-nav" aria-label="بخش‌های انبار">{tabs.map((tab) => {
    const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
    return <Link key={tab.href} href={tab.href} className={on ? 'is-on' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
  })}</nav>
}

export type Location = { id: number; name: string; kind: string; sellsOnline: boolean; isDefault: boolean; active: boolean; sortOrder: number; address: string; units: number; items: number; openRegisters: number }
export type PickedItem = { productId: number; variantId: number | null; name: string; currency: string }
type Product = { id: number; name: string; kind: string; currency: string; variants: { id: number; name: string }[] }

/** Locations from the stock API, with whether the viewer may change location settings. */
export function useLocations(attempt = 0) {
  const [state, setState] = useState<{ locations: Location[]; manager: boolean } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/store/stock?locations=1', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw Error(body.error || 'انبارها دریافت نشدند'); if (!controller.signal.aborted) { setState(body); setError('') } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'ارتباط برقرار نشد') })
    return () => controller.abort()
  }, [attempt])
  return { locations: state?.locations || null, manager: !!state?.manager, error }
}

/** One item by barcode scan (Enter) or by name search; variants must be chosen explicitly. */
export function ItemPicker({ onPick, disabled, label = 'کالا' }: { onPick: (item: PickedItem) => void; disabled?: boolean; label?: string }) {
  const [scan, setScan] = useState(''), [query, setQuery] = useState(''), [products, setProducts] = useState<Product[]>([])
  const [pending, setPending] = useState<Product | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (query.trim().length < 2) { setProducts([]); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/admin/store/stock?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => { const body = await response.json(); if (!controller.signal.aborted) setProducts(response.ok ? body.products : []) })
        .catch(() => { /* typing continues */ })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])
  function choose(product: Product, variantId: number | null) {
    const variant = product.variants.find((row) => row.id === variantId)
    onPick({ productId: product.id, variantId, name: variant ? `${product.name} · ${variant.name}` : product.name, currency: product.currency })
    setPending(null); setQuery(''); setProducts([]); setMessage('')
  }
  async function byScan() {
    if (!scan.trim() || busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/admin/store/stock?scan=${encodeURIComponent(scan.trim())}`, { cache: 'no-store' }), body = await response.json()
      if (!response.ok) throw Error(body.error || 'بارکد پیدا نشد')
      if (body.requiresVariant) { setPending(body.product); setMessage('گونهٔ کالا را انتخاب کنید') } else choose(body.product, body.variantId ?? null)
      setScan('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد') } finally { setBusy(false) }
  }
  return <div className="st-picker">
    <div className="st-picker-row">
      <label className="cd-field"><span>بارکد {label}</span><input className="input" dir="ltr" autoComplete="off" placeholder="بارکدخوان را اینجا بزنید" value={scan} disabled={disabled} onChange={(event) => setScan(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void byScan() } }} /></label>
      <label className="cd-field"><span>یا جست‌وجوی نام</span><input className="input" type="search" autoComplete="off" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {products.length > 0 && <ul className="st-results" aria-label="نتیجهٔ جست‌وجو">{products.slice(0, 8).map((product) => <li key={product.id}>
      {product.variants.length ? <span className="st-result-name">{product.name}</span> : <button type="button" className="st-result" onClick={() => choose(product, null)}>{product.name}</button>}
      {product.variants.map((variant) => <button type="button" key={variant.id} className="st-result is-variant" onClick={() => choose(product, variant.id)}>{variant.name}</button>)}
    </li>)}</ul>}
    {pending && <div className="st-variants" role="group" aria-label={`گونه‌های ${pending.name}`}><span>{pending.name}:</span>{pending.variants.map((variant) => <button type="button" key={variant.id} className="btn btn-ghost btn-sm" onClick={() => choose(pending, variant.id)}>{variant.name}</button>)}</div>}
    {message && <p className="sa-hint" role="status">{message}</p>}
  </div>
}

export const REASON: Record<string, string> = { INIT: 'موجودی اولیه', HOLD: 'رزرو برای سفارش', RELEASE: 'آزادسازی رزرو', RESTOCK: 'بازگشت به انبار', TRANSFER: 'انتقال', RECEIPT: 'ورود کالا', COUNT: 'انبارگردانی', ADJUST: 'اصلاح دستی' }
export const uuid = () => crypto.randomUUID()
