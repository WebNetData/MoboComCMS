'use client'

import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { Suspense, useState } from 'react'
import { Notice, Pager, StoreShell, fa, send, useJson } from '../shared'

type Item = { id: number; name: string; image: string; sku: string; stock: number; lowStockAt: number; active: boolean; held: number; variants: { id: number; name: string; sku: string; stock: number }[] }
type List = { page: number; pages: number; total: number; lowStockDefault: number; items: Item[] }
type Edit = { productId: number; variantId?: number; stock: number }

function Inventory() {
  const router = useRouter()
  const params = useSearchParams()
  const filter = params.get('filter') || ''
  const q = params.get('q') || ''
  const page = Number(params.get('page')) || 1
  const { data, error, loading, reload } = useJson<List>(`/api/admin/store/inventory?${new URLSearchParams({ filter, q, page: String(page) })}`)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [search, setSearch] = useState(q)
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const go = (patch: Record<string, string>) => router.push(`/admin/store/inventory?${new URLSearchParams(Object.entries({ filter, q, ...patch }).filter(([, v]) => v))}`)
  const key = (productId: number, variantId?: number) => `${productId}:${variantId || 0}`
  const value = (productId: number, stock: number, variantId?: number) => edits[key(productId, variantId)]?.stock ?? stock
  const set = (productId: number, stock: number, variantId?: number) => setEdits((all) => ({ ...all, [key(productId, variantId)]: { productId, variantId, stock } }))
  const tone = (stock: number, threshold: number) => (stock === 0 ? 'is-out' : stock > 0 && stock <= threshold ? 'is-low' : '')

  async function save() {
    const items = Object.values(edits).filter((edit) => Number.isFinite(edit.stock))
    if (!items.length) return
    const response = await send<{ updated: number }>('/api/admin/store/inventory', 'POST', { items })
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setResult({ tone: 'ok', text: `موجودی ${fa(response.data.updated)} ردیف ذخیره شد` }); setEdits({}); void reload()
  }

  const row = (product: Item, stock: number, label: string, sku: string, variantId?: number) => {
    const threshold = product.lowStockAt || data!.lowStockDefault
    const current = value(product.id, stock, variantId)
    return <tr key={key(product.id, variantId)} className={variantId ? 'is-variant' : ''}>
      <td>{variantId ? <span className="sa-sub">↳ {label}</span> : <div className="sa-product-cell">{product.image ? <img src={product.image} alt="" /> : <span className="sa-ph" />}<Link href={`/admin/store/products/${product.id}`} className="sa-link"><b>{label}</b></Link></div>}</td>
      <td dir="ltr"><small>{sku || '—'}</small></td>
      <td><span className={`sa-stock ${tone(stock, threshold)}`}>{stock < 0 ? 'نامحدود' : fa(stock)}</span></td>
      <td className="num">{!variantId && product.held ? fa(product.held) : '—'}</td>
      <td><div className="sa-stepper">
        <button type="button" onClick={() => set(product.id, Math.max(-1, current - 1), variantId)} aria-label="کاهش">−</button>
        <input className="input" type="number" min={-1} value={current} onChange={(event) => set(product.id, Math.floor(Number(event.target.value)), variantId)} aria-label={`موجودی ${label}`} />
        <button type="button" onClick={() => set(product.id, current < 0 ? 1 : current + 1, variantId)} aria-label="افزایش">+</button>
        <button type="button" className="sa-link" onClick={() => set(product.id, -1, variantId)}>نامحدود</button>
      </div></td>
    </tr>
  }

  const pending = Object.keys(edits).length
  return <StoreShell title="انبار و موجودی" actions={pending > 0 ? <button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیرهٔ {fa(pending)} تغییر</button> : undefined}>
    <nav className="sa-subtabs">{[['', 'همه'], ['tracked', 'دارای موجودی محدود'], ['low', 'رو به اتمام'], ['out', 'ناموجود']].map(([k, l]) => <button key={k} type="button" className={filter === k ? 'is-active' : ''} onClick={() => go({ filter: k, page: '' })}>{l}</button>)}</nav>
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); go({ q: search.trim(), page: '' }) }}><input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام یا SKU" aria-label="جست‌وجو" /><button type="submit" className="btn btn-ghost">جست‌وجو</button></form>
    {error && <Notice tone="error">{error}</Notice>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    <p className="sa-hint">«رزرو» تعداد کالاهایی است که در سفارش‌های پرداخت‌نشده نگه داشته شده‌اند و پس از پرداخت یا انقضا به‌طور خودکار کسر یا آزاد می‌شوند. موجودی ۱- یعنی نامحدود.</p>
    <div className="sa-card sa-table-wrap" aria-busy={loading}>
      <table className="data sa-table"><thead><tr><th>کالا</th><th>SKU</th><th>موجودی</th><th>رزرو</th><th>تنظیم</th></tr></thead>
        <tbody>{data?.items.flatMap((product) => [row(product, product.stock, product.name, product.sku), ...product.variants.map((variant) => row(product, variant.stock, variant.name, variant.sku, variant.id))])}
          {data && !data.items.length && <tr><td colSpan={5} className="sa-empty">کالایی پیدا نشد.</td></tr>}</tbody>
      </table>
    </div>
    {data && <Pager page={data.page} pages={data.pages} onPage={(next) => go({ page: String(next) })} />}
  </StoreShell>
}

export default function InventoryPage() { return <Suspense fallback={null}><Inventory /></Suspense> }
