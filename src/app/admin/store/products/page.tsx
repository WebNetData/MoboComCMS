'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Money, Notice, Pager, StoreShell, fa, send, useJson } from '../shared'

type Product = {
  id: number; slug: string; name: string; image: string; sku: string; kind: string; active: boolean; featured: boolean; category: string; brand: string; currency: string
  price: number; listPrice: number; stock: number; variantStock: number | null; variants: { id: number; sku: string; name: string; stock: number; price: number }[]; soldCount: number; views: number; access: string
}
type List = { page: number; pages: number; total: number; counts: { all: number; active: number; inactive: number; out: number }; categories: { id: number; name: string; parentId: number | null }[]; brands: { id: number; name: string }[]; products: Product[] }

const BULK: [string, string][] = [['activate', 'فعال‌سازی'], ['deactivate', 'غیرفعال‌سازی'], ['feature', 'ویژه کردن'], ['unfeature', 'حذف از ویژه'], ['category', 'تغییر دسته'], ['brand', 'تغییر برند'], ['price', 'تغییر قیمت (٪)'], ['discount', 'تخفیف گروهی (٪)'], ['clear-discount', 'حذف تخفیف'], ['stock', 'تنظیم موجودی'], ['delete', 'حذف']]

function stockLabel(product: Product) {
  const stock = product.variantStock ?? product.stock
  if (product.stock === 0 || stock === 0) return <span className="sa-stock is-out">ناموجود</span>
  if (stock < 0) return <span className="sa-stock">نامحدود</span>
  return <span className={`sa-stock${stock <= 3 ? ' is-low' : ''}`}>{fa(stock)}</span>
}

function Products() {
  const router = useRouter()
  const params = useSearchParams()
  const filters = Object.fromEntries(['q', 'category', 'brand', 'status', 'stock', 'kind', 'sort', 'page'].map((key) => [key, params.get(key) || '']))
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  const { data, error, loading, reload } = useJson<List>(`/api/admin/store/products?${query}`)
  const [search, setSearch] = useState(filters.q)
  const [selected, setSelected] = useState<number[]>([])
  const [action, setAction] = useState('')
  const [value, setValue] = useState('')
  const [round, setRound] = useState('1000')
  const [endsAt, setEndsAt] = useState('')
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => setSelected([]), [data])
  useEffect(() => setSearch(filters.q), [filters.q])

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(Object.entries({ ...filters, page: '', ...patch }).filter(([, v]) => v))
    router.push(`/admin/store/products?${next}`)
  }
  const all = !!data?.products.length && selected.length === data.products.length

  async function apply() {
    if (!action || !selected.length) return
    if (action === 'delete' && !window.confirm(`${fa(selected.length)} محصول حذف شود؟ محصولاتی که سفارش دارند به‌جای حذف غیرفعال می‌شوند.`)) return
    const response = await send<{ changed: number; deleted?: number; deactivated?: number }>('/api/admin/store/products', 'POST', { ids: selected, action, value, round, endsAt: endsAt || undefined })
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setResult({ tone: 'ok', text: action === 'delete' ? `${fa(response.data.deleted || 0)} حذف و ${fa(response.data.deactivated || 0)} غیرفعال شد` : `${fa(response.data.changed)} محصول به‌روز شد` })
    setAction(''); setValue('')
    void reload()
  }

  const select = (key: string, label: string, options: [string, string][]) => <label className="sa-inline"><span>{label}</span><select className="select" value={filters[key]} onChange={(event) => go({ [key]: event.target.value })}><option value="">همه</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>

  return <StoreShell title="محصولات" actions={<Link href="/admin/store/products/new" className="btn btn-primary">+ افزودن محصول</Link>}>
    <nav className="sa-subtabs" aria-label="وضعیت محصول">{[['', 'همه', data?.counts.all], ['active', 'فعال', data?.counts.active], ['inactive', 'غیرفعال', data?.counts.inactive], ['featured', 'ویژه', undefined], ['discounted', 'تخفیف‌دار', undefined]].map(([key, label, count]) => <button key={String(key)} type="button" className={filters.status === key ? 'is-active' : ''} onClick={() => go({ status: String(key) })}>{label}{count ? <span className="num">{fa(Number(count))}</span> : null}</button>)}</nav>
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); go({ q: search.trim() }) }}>
      <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام، نامک یا SKU" aria-label="جست‌وجوی محصول" />
      {select('category', 'دسته', [['none', 'بدون دسته'], ...(data?.categories || []).map((c) => [String(c.id), c.parentId ? `— ${c.name}` : c.name] as [string, string])])}
      {select('brand', 'برند', (data?.brands || []).map((b) => [String(b.id), b.name]))}
      {select('stock', 'موجودی', [['out', 'ناموجود'], ['low', 'رو به اتمام'], ['unlimited', 'نامحدود']])}
      {select('kind', 'نوع', [['PHYSICAL', 'فیزیکی'], ['VIRTUAL', 'دیجیتال']])}
      <label className="sa-inline"><span>ترتیب</span><select className="select" value={filters.sort} onChange={(event) => go({ sort: event.target.value })}><option value="">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="name">نام</option><option value="sales">پرفروش‌ترین</option><option value="views">پربازدیدترین</option><option value="stock">کمترین موجودی</option><option value="price">ارزان‌ترین</option><option value="manual">ترتیب دستی</option></select></label>
      <button className="btn btn-ghost" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    {selected.length > 0 && <div className="sa-bulk" role="region" aria-label="عملیات گروهی">
      <b className="num">{fa(selected.length)} انتخاب‌شده</b>
      <select className="select" value={action} onChange={(event) => { setAction(event.target.value); setValue('') }} aria-label="عملیات"><option value="">عملیات گروهی…</option>{BULK.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      {action === 'category' && <select className="select" value={value} onChange={(event) => setValue(event.target.value)} aria-label="دسته"><option value="">بدون دسته</option>{data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      {action === 'brand' && <select className="select" value={value} onChange={(event) => setValue(event.target.value)} aria-label="برند"><option value="">بدون برند</option>{data?.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      {(action === 'price' || action === 'discount') && <><input className="input sa-narrow" type="number" value={value} onChange={(event) => setValue(event.target.value)} placeholder={action === 'price' ? 'مثلاً ۱۰ یا -۵' : 'مثلاً ۱۵'} aria-label="درصد" /><select className="select" value={round} onChange={(event) => setRound(event.target.value)} aria-label="گرد کردن"><option value="1">بدون گرد کردن</option><option value="100">گرد به ۱۰۰</option><option value="1000">گرد به ۱٬۰۰۰</option><option value="10000">گرد به ۱۰٬۰۰۰</option></select></>}
      {action === 'discount' && <label className="sa-inline"><span>پایان</span><input className="input" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>}
      {action === 'stock' && <input className="input sa-narrow" type="number" min={-1} value={value} onChange={(event) => setValue(event.target.value)} placeholder="-۱ = نامحدود" aria-label="موجودی" />}
      <button type="button" className="btn btn-primary" disabled={!action} onClick={() => void apply()}>اعمال</button>
      <button type="button" className="btn btn-ghost" onClick={() => setSelected([])}>لغو انتخاب</button>
    </div>}
    <div className="sa-card sa-table-wrap" aria-busy={loading}>
      <table className="data sa-table">
        <thead><tr><th><input type="checkbox" aria-label="انتخاب همه" checked={all} onChange={() => setSelected(all ? [] : data?.products.map((p) => p.id) || [])} /></th><th>محصول</th><th>قیمت</th><th>موجودی</th><th>دسته / برند</th><th>فروش</th><th>وضعیت</th></tr></thead>
        <tbody>
          {data?.products.map((product) => <tr key={product.id} className={selected.includes(product.id) ? 'is-selected' : ''}>
            <td><input type="checkbox" aria-label={`انتخاب ${product.name}`} checked={selected.includes(product.id)} onChange={() => setSelected((list) => list.includes(product.id) ? list.filter((id) => id !== product.id) : [...list, product.id])} /></td>
            <td><div className="sa-product-cell">{product.image ? <img src={product.image} alt="" /> : <span className="sa-ph" />}<span><Link href={`/admin/store/products/${product.id}`} className="sa-link"><b>{product.name}</b></Link><small className="sa-sub">{product.sku && <span dir="ltr">{product.sku} · </span>}{product.kind === 'PHYSICAL' ? 'فیزیکی' : 'دیجیتال'}{product.variants.length > 0 && ` · ${fa(product.variants.length)} تنوع`}{product.access === 'MEMBERS' && ' · VIP'}</small></span></div></td>
            <td>{product.listPrice > 0 && <s className="sa-sub num">{Math.round(product.listPrice).toLocaleString('fa-IR')}</s>}<Money value={product.price} currency={product.currency} /></td>
            <td>{stockLabel(product)}</td>
            <td><small>{product.category || '—'}</small><small className="sa-sub">{product.brand}</small></td>
            <td className="num"><small>{fa(product.soldCount)} فروش</small><small className="sa-sub">{fa(product.views)} بازدید</small></td>
            <td><span className={`sa-state ${product.active ? 'is-ok' : ''}`}>{product.active ? 'فعال' : 'غیرفعال'}</span>{product.featured && <span className="sa-tag">ویژه</span>}<div className="sa-row-actions"><Link href={`/admin/store/products/${product.id}`} className="sa-link">ویرایش</Link><a href={`/products/${product.slug}`} target="_blank" rel="noreferrer" className="sa-link">مشاهده</a></div></td>
          </tr>)}
          {data && !data.products.length && <tr><td colSpan={7} className="sa-empty">محصولی پیدا نشد.</td></tr>}
        </tbody>
      </table>
    </div>
    {data && <Pager page={data.page} pages={data.pages} onPage={(page) => go({ page: String(page) })} />}
  </StoreShell>
}

export default function StoreProductsPage() {
  return <Suspense fallback={null}><Products /></Suspense>
}
