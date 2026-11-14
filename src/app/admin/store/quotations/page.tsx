'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { StoreShell, Notice, send, useJson, faDate } from '../shared'
import { formatMoney } from '@/shared/money'
import { latinDigits } from '@/shared/text/digits'
import type { CounterProduct, CounterCustomer } from '@/modules/store/domain/counter-sales'

type Row = { productId: number; variantId: number | null; quantity: number; name: string }
type Quote = { id: number; title: string; customer: { name: string; phone: string }; status: string; currency: string; subtotalMinor: string; discountMinor: string; expiresAt: string; updatedAt: string; href: string; counterHref: string; orderId: number | null; invoiceNumber: string }
const statuses: Record<string, string> = { OPEN: 'باز', CANCELLED: 'لغوشده', CONVERTED: 'متصل به سفارش' }
export default function QuotationsPage() {
  const list = useJson<{ quotations: Quote[] }>('/api/admin/store/quotations')
  const [customerQuery, setCustomerQuery] = useState(''), [productQuery, setProductQuery] = useState('')
  const customers = useJson<{ customers: CounterCustomer[] }>(customerQuery.trim().length >= 2 ? `/api/admin/store/quotations?options=1&q=${encodeURIComponent(customerQuery)}` : null)
  const products = useJson<{ products: CounterProduct[] }>(`/api/admin/store/quotations?options=1&q=${encodeURIComponent(productQuery)}`)
  const [customer, setCustomer] = useState<CounterCustomer | null>(null), [productId, setProductId] = useState(0), [variantId, setVariantId] = useState(0)
  const [quantity, setQuantity] = useState('1'), [rows, setRows] = useState<Row[]>([]), [expires, setExpires] = useState(''), [discount, setDiscount] = useState('0'), [title, setTitle] = useState('پیش‌فاکتور خرید')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [href, setHref] = useState('')
  const product = products.data?.products.find(row => row.id === productId)
  function add() {
    const count = Number(latinDigits(quantity))
    if (!product || (product.variants.length > 0 && !variantId) || !Number.isSafeInteger(count) || count < 1 || count > 999) { setError('کالا، گونه و تعداد معتبر را انتخاب کنید'); return }
    const variant = product.variants.find(row => row.id === variantId)
    if (rows.some(row => row.productId === product.id && row.variantId === (variant?.id || null))) { setError('این کالا در پیشنهاد وجود دارد؛ برای اصلاح، ردیف قبلی را حذف کنید'); return }
    setRows(current => [...current, { productId: product.id, variantId: variant?.id || null, quantity: count, name: product.name + (variant ? ` · ${variant.name}` : '') }]); setError('')
  }
  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    const expiry = new Date(expires)
    if (!customer || !rows.length || !Number.isFinite(expiry.getTime())) { setError('مشتری، کالاها و مهلت اعتبار را کامل کنید'); return }
    setBusy(true); setError(''); setHref('')
    try {
      const result = await send<{ href: string }>('/api/admin/store/quotations', 'POST', { userId: customer.id, title, expiresAt: expiry.toISOString(), discount, lines: rows.map(({ name, ...row }) => row) })
      if (!result.ok) { setError(result.error); return }
      setHref(result.data.href); setRows([]); await list.reload()
    } finally { setBusy(false) }
  }
  async function cancel(row: Quote) {
    if (busy) return
    setBusy(true); setError('')
    try { const result = await send('/api/admin/store/quotations', 'POST', { action: 'cancel', id: row.id, updatedAt: row.updatedAt }); if (!result.ok) setError(result.error); else await list.reload() } finally { setBusy(false) }
  }
  return <StoreShell title="پیش‌فاکتورهای فروش">
    <section className="sa-card"><header className="sa-card-head"><h2>پیشنهاد تازه</h2></header><p className="sa-hint">قیمت و موجودی هنگام پذیرش دوباره بررسی می‌شود. ایجاد پیشنهاد وجهی دریافت و موجودی رزرو نمی‌کند.</p>
      <form onSubmit={create}><fieldset disabled={busy} className="gateway-controls"><legend className="sr-only">مشخصات پیش‌فاکتور</legend>
        <label className="sa-field"><span>عنوان پیشنهاد</span><input className="input" value={title} maxLength={120} required onChange={event => setTitle(event.target.value)} /></label>
        <label className="sa-field"><span>جست‌وجوی مشتری با نام یا موبایل</span><input className="input" value={customerQuery} onChange={event => setCustomerQuery(event.target.value)} /></label>
        {customers.error && <Notice tone="error">{customers.error}</Notice>}
        <label className="sa-field"><span>مشتری پیشنهاد</span><select className="select" aria-label="مشتری پیشنهاد" value={customer?.id || ''} onChange={event => setCustomer(customers.data?.customers.find(row => row.id === Number(event.target.value)) || null)}><option value="">انتخاب مشتری</option>{customer && !customers.data?.customers.some(row => row.id === customer.id) && <option value={customer.id}>{customer.name} · {customer.phone}</option>}{customers.data?.customers.map(row => <option key={row.id} value={row.id}>{row.name} · {row.phone}</option>)}</select></label>
        <label className="sa-field"><span>جست‌وجوی کالا</span><input className="input" value={productQuery} onChange={event => { setProductQuery(event.target.value); setProductId(0); setVariantId(0) }} /></label>
        {products.error && <Notice tone="error">{products.error}</Notice>}
        <div className="sa-grid"><label className="sa-field"><span>کالا</span><select className="select" aria-label="کالا" value={productId || ''} onChange={event => { setProductId(Number(event.target.value)); setVariantId(0) }}><option value="">انتخاب کالا</option>{products.data?.products.map(row => <option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}</select></label>
          <label className="sa-field"><span>گونهٔ کالا</span><select className="select" aria-label="گونهٔ کالا" value={variantId || ''} onChange={event => setVariantId(Number(event.target.value))} disabled={!product?.variants.length}><option value="">{product?.variants.length ? 'انتخاب گونه' : 'بدون گونه'}</option>{product?.variants.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="sa-field"><span>تعداد</span><input className="input" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} /></label></div>
        <button type="button" className="btn" onClick={add} disabled={!product}>افزودن به پیشنهاد</button>
        <ul>{rows.map(row => <li key={`${row.productId}:${row.variantId || 0}`}>{row.name} · {row.quantity.toLocaleString('fa-IR')} عدد <button className="btn btn-ghost" type="button" onClick={() => setRows(current => current.filter(item => item !== row))} aria-label={`حذف ${row.name}`}>حذف</button></li>)}</ul>
        <div className="sa-grid"><label className="sa-field"><span>تخفیف فروشنده، به واحد پول کالاها</span><input className="input" inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label><label className="sa-field"><span>اعتبار تا تاریخ و ساعت</span><input className="input" type="datetime-local" value={expires} required onChange={event => setExpires(event.target.value)} /></label></div>
        <button className="btn btn-primary" disabled={!customer || !rows.length || !expires}>{busy ? 'در حال ثبت…' : 'ثبت و ساخت لینک پیش‌فاکتور'}</button>
      </fieldset></form>
      {error && <Notice tone="error">{error}</Notice>}{href && <p role="status">پیشنهاد ثبت شد. <Link href={href}>مشاهده و اشتراک‌گذاری لینک پیش‌فاکتور</Link></p>}
    </section>
    <section className="sa-card"><header className="sa-card-head"><h2>پیشنهادهای اخیر</h2><button className="btn btn-ghost" type="button" onClick={() => void list.reload()}>به‌روزرسانی</button></header>{list.error && <Notice tone="error">{list.error}</Notice>}{!list.data ? <p role="status">در حال دریافت…</p> : !list.data.quotations.length ? <p>هنوز پیشنهادی ثبت نشده است.</p> : <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>پیشنهاد و مشتری</th><th>مبلغ کالاها پس از تخفیف</th><th>اعتبار و وضعیت</th><th>اقدام</th></tr></thead><tbody>{list.data.quotations.map(row => <tr key={row.id}><td><Link href={row.href}>{row.title} #{row.id.toLocaleString('fa-IR')}</Link><p>{row.customer.name} · {row.customer.phone}</p></td><td>{formatMoney(BigInt(row.subtotalMinor) - BigInt(row.discountMinor), row.currency, 'fa-IR')}</td><td>{faDate(row.expiresAt, true)} · {statuses[row.status] || row.status}</td><td>{row.orderId ? <Link href={`/admin/store/orders/${row.orderId}`}>سفارش متصل</Link> : row.status === 'OPEN' && <><Link href={row.counterHref}>فروش حضوری از پیشنهاد</Link><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void cancel(row)}>لغو پیشنهاد</button></>}</td></tr>)}</tbody></table></div>}</section>
  </StoreShell>
}
