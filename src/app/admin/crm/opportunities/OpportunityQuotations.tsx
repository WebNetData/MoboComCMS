'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import type { CounterProduct } from '@/modules/store/domain/counter-sales'
import { latinDigits } from '@/shared/text/digits'
import { formatMoney } from '@/shared/money'
import { faDate } from '../../store/shared'
import styles from './opportunities.module.css'

type Line = { productId: number; variantId: number | null; quantity: number; name: string }
type Quotation = {
  id: number; title: string; status: 'OPEN' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED'
  orderId: number | null; orderStatus: string | null; orderHref: string | null
  expiresAt: string; sharedAt: string | null; amountMinor: string; currency: string; canShare: boolean
}
type Listing = { canCreate: boolean; rows: Quotation[] }

const statusLabel: Record<Quotation['status'], string> = {
  OPEN: 'فعال', EXPIRED: 'منقضی‌شده', CANCELLED: 'لغوشده', CONVERTED: 'متصل به سفارش',
}
const orderLabel: Record<string, string> = {
  PENDING: 'در انتظار پرداخت', PAID: 'پرداخت‌شده', FAILED: 'ناموفق', CANCELLED: 'لغوشده', REFUNDED: 'بازپرداخت‌شده',
}
const money = (amount: string, currency: string) => {
  try { return formatMoney(BigInt(amount), currency, 'fa-IR') } catch { return '—' }
}

export default function OpportunityQuotations({ opportunityId, version, mayEdit, changed }: { opportunityId: number; version: number; mayEdit: boolean; changed: () => void }) {
  const [data, setData] = useState<Listing | null>(null)
  const [allowed, setAllowed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CounterProduct[]>([])
  const [productLoading, setProductLoading] = useState(false)
  const [productError, setProductError] = useState('')
  const [productId, setProductId] = useState(0)
  const [variantId, setVariantId] = useState(0)
  const [quantity, setQuantity] = useState('1')
  const [lines, setLines] = useState<Line[]>([])
  const [title, setTitle] = useState('پیش‌فاکتور خرید')
  const [discount, setDiscount] = useState('0')
  const [expires, setExpires] = useState('')
  const endpoint = '/api/admin/crm/opportunity-quotations'
  const product = products.find(item => item.id === productId)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      try {
        const response = await fetch(`${endpoint}?opportunityId=${opportunityId}`, { cache: 'no-store', signal: controller.signal })
        if (response.status === 403 || response.status === 404) {
          if (!controller.signal.aborted) { setAllowed(false); setData(null) }
          return
        }
        if (!response.ok) throw new Error('دریافت پیش‌فاکتورها ممکن نشد.')
        const listing: Listing = await response.json()
        if (!controller.signal.aborted) { setData(listing); setAllowed(true); setError('') }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'دریافت پیش‌فاکتورها ممکن نشد.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [opportunityId, reload])

  useEffect(() => {
    if (!creating) return
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      async function loadProducts() {
        setProductLoading(true); setProductError('')
        try {
          const response = await fetch(`${endpoint}?opportunityId=${opportunityId}&products=1&q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: controller.signal })
          if (!response.ok) throw new Error('دریافت کالاها ممکن نشد.')
          const result: { products: CounterProduct[] } = await response.json()
          if (!controller.signal.aborted) setProducts(result.products)
        } catch (cause) {
          if (!controller.signal.aborted) { setProducts([]); setProductError(cause instanceof Error ? cause.message : 'دریافت کالاها ممکن نشد.') }
        } finally {
          if (!controller.signal.aborted) setProductLoading(false)
        }
      }
      void loadProducts()
    }, 200)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [creating, opportunityId, query])

  function addLine() {
    const count = Number(latinDigits(quantity))
    if (!product || (product.variants.length > 0 && !variantId) || !Number.isSafeInteger(count) || count < 1 || count > 999) {
      setError('کالا، گونه و تعداد معتبر را انتخاب کنید.')
      return
    }
    const variant = product.variants.find(item => item.id === variantId)
    const selectedVariantId = variant?.id ?? null
    if (lines.some(item => item.productId === product.id && item.variantId === selectedVariantId)) {
      setError('این کالا در پیش‌فاکتور وجود دارد. برای تغییر تعداد، ردیف را حذف و دوباره اضافه کنید.')
      return
    }
    setLines(current => [...current, { productId: product.id, variantId: selectedVariantId, quantity: count, name: product.name + (variant ? ` · ${variant.name}` : '') }])
    setError('')
  }

  async function command(body: Record<string, unknown>) {
    if (busy) return false
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || 'درخواست انجام نشد.')
      }
      setReload(value => value + 1)
      changed()
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'درخواست انجام نشد.')
      return false
    } finally { setBusy(false) }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const expiry = new Date(expires)
    if (!lines.length || !Number.isFinite(expiry.getTime())) {
      setError('کالاها و مهلت اعتبار را کامل کنید.')
      return
    }
    const saved = await command({ op: 'create', opportunityId, version, title, discount, expiresAt: expiry.toISOString(), lines: lines.map(({ name: _name, ...line }) => line) })
    if (saved) { setCreating(false); setLines([]); setExpires(''); setNotice('پیش‌فاکتور ثبت شد.') }
  }

  async function share(id: number) {
    const saved = await command({ op: 'share', opportunityId, quotationId: id, confirmed: true })
    if (saved) { setConfirmId(null); setNotice('پیش‌فاکتور برای مشتری در صندوق پیام قرار گرفت.') }
  }

  if (!allowed) return null
  return <section className={styles.quoteSection} aria-labelledby="opportunity-quotations-heading" aria-busy={loading || busy}>
    <div className={styles.heading}>
      <h3 id="opportunity-quotations-heading">پیش‌فاکتورهای فرصت</h3>
      <button type="button" className="btn btn-ghost btn-sm" disabled={loading || busy} onClick={() => setReload(value => value + 1)}>تازه‌سازی</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {loading && !data && <p role="status">در حال دریافت پیش‌فاکتورها…</p>}
    {!loading && data && !data.rows.length && <p className={styles.muted}>برای این فرصت پیش‌فاکتوری ثبت نشده است.</p>}
    {data && data.rows.length > 0 && <ul className={styles.history}>{data.rows.map(row => <li key={row.id}>
      <div className={styles.heading}><strong>{row.title} · شمارهٔ {row.id.toLocaleString('fa-IR')}</strong><span>{statusLabel[row.status]}</span></div>
      <dl className={styles.details}>
        <div><dt>مبلغ پس از تخفیف</dt><dd>{money(row.amountMinor, row.currency)}</dd></div>
        <div><dt>اعتبار تا</dt><dd>{faDate(row.expiresAt, true)}</dd></div>
        <div><dt>ارسال به مشتری</dt><dd>{row.sharedAt ? faDate(row.sharedAt, true) : 'ارسال نشده'}</dd></div>
        {row.orderId && <div><dt>وضعیت سفارش</dt><dd>{orderLabel[row.orderStatus || ''] || row.orderStatus || 'در حال بررسی'}</dd></div>}
      </dl>
      {row.orderHref && <Link className="sa-link" href={row.orderHref}>مشاهدهٔ سفارش</Link>}
      {row.canShare && confirmId !== row.id && <div><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmId(row.id)}>ارسال به مشتری</button></div>}
      {row.canShare && confirmId === row.id && <div className={styles.quoteConfirm}>
        <p>پیش‌فاکتور در صندوق پیام این مشتری قرار بگیرد؟</p>
        <div className={styles.actions}><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void share(row.id)}>تأیید ارسال</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmId(null)}>انصراف</button></div>
      </div>}
    </li>)}</ul>}
    {data?.canCreate && mayEdit && !creating && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setCreating(true); setError(''); setNotice('') }}>پیش‌فاکتور تازه</button>}
    {data?.canCreate && mayEdit && creating && <form className={styles.quoteForm} onSubmit={event => void create(event)}>
      <h4>پیش‌فاکتور تازه</h4>
      <p className={styles.muted}>قیمت و موجودی هنگام پذیرش بررسی می‌شود.</p>
      <fieldset disabled={busy} className={styles.quoteFields}>
        <legend className="sr-only">مشخصات پیش‌فاکتور</legend>
        <label className={styles.field}>عنوان پیش‌فاکتور<input className="input" value={title} maxLength={120} required onChange={event => setTitle(event.target.value)} /></label>
        <label className={styles.field}>جست‌وجوی کالا<input className="input" value={query} maxLength={80} onChange={event => { setQuery(event.target.value); setProductId(0); setVariantId(0) }} /></label>
        {productLoading && <p role="status">در حال دریافت کالاها…</p>}
        {productError && <p role="alert">{productError}</p>}
        {!productLoading && !productError && !products.length && <p className={styles.muted}>کالایی پیدا نشد.</p>}
        <div className={styles.fields}>
          <label className={styles.field}>کالا<select className="input" value={productId || ''} onChange={event => { setProductId(Number(event.target.value)); setVariantId(0) }}><option value="">انتخاب کالا</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}</select></label>
          <label className={styles.field}>گونهٔ کالا<select className="input" value={variantId || ''} onChange={event => setVariantId(Number(event.target.value))} disabled={!product?.variants.length}><option value="">{product?.variants.length ? 'انتخاب گونه' : 'بدون گونه'}</option>{product?.variants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className={styles.field}>تعداد<input className="input" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
        </div>
        <div><button type="button" className="btn btn-ghost" disabled={!product} onClick={addLine}>افزودن کالا</button></div>
        {!!lines.length && <ul className={styles.history}>{lines.map(line => <li key={`${line.productId}:${line.variantId ?? 0}`}><span>{line.name} · {line.quantity.toLocaleString('fa-IR')} عدد</span><div><button className="btn btn-ghost btn-sm" type="button" onClick={() => setLines(current => current.filter(item => item !== line))} aria-label={`حذف ${line.name}`}>حذف</button></div></li>)}</ul>}
        <div className={styles.fields}>
          <label className={styles.field}>تخفیف به واحد پول کالاها<input className="input" inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label>
          <div className={styles.field}><span>اعتبار تا تاریخ و ساعت</span><JalaliDateInput withTime aria-label="اعتبار تا تاریخ و ساعت" value={expires} required onChange={setExpires} /></div>
        </div>
        <div className={styles.actions}><button type="submit" className="btn btn-primary" disabled={!lines.length || !expires}>{busy ? 'در حال ثبت…' : 'ثبت پیش‌فاکتور'}</button><button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>انصراف</button></div>
      </fieldset>
    </form>}
  </section>
}
