'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { StoreShell } from '../shared'
import { formatMoney } from '@/shared/money'
import { fieldsFor } from '@/modules/store/domain/order-inputs'
import type { CounterProduct, CounterCustomer, CounterLine, CounterPaymentMethod } from '@/modules/store/domain/counter-sales'
import { useCounterSale } from './useCounterSale'
import Receipt from './Receipt'
import './counter.css'

type Item = CounterLine & { product: CounterProduct; variantName: string }
const priceOf = (item: Item) => formatMoney(BigInt(item.expectedUnitMinor) * BigInt(item.quantity), item.product.currency, 'fa-IR')

export default function CounterSales() {
  const sale = useCounterSale()
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CounterProduct[]>([])
  const [productId, setProductId] = useState(0)
  const [variantId, setVariantId] = useState(0)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customers, setCustomers] = useState<CounterCustomer[]>([])
  const [customer, setCustomer] = useState<CounterCustomer | null>(null)
  const [method, setMethod] = useState<CounterPaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const product = products.find((item) => item.id === productId)
  const variant = product?.variants.find((item) => item.id === variantId)
  const currency = items[0]?.product.currency || ''
  const total = items.reduce((sum, item) => sum + BigInt(item.expectedUnitMinor) * BigInt(item.quantity), 0n)
  const locked = sale.busy || sale.uncertain

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true); setLoadError('')
      fetch(`/api/admin/store/counter?q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'کالاها دریافت نشدند'); if (!controller.signal.aborted) setProducts(body.products) })
        .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'ارتباط با سرور برقرار نشد') })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, attempt])

  useEffect(() => {
    if (customerQuery.trim().length < 2) { setCustomers([]); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/admin/store/counter?customers=${encodeURIComponent(customerQuery)}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => { if (response.ok) { const body = await response.json(); if (!controller.signal.aborted) setCustomers(body.customers) } })
        .catch(() => { if (!controller.signal.aborted) setCustomers([]) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [customerQuery])

  function addItem() {
    if (!product || (product.variants.length && !variant)) return
    const same = items.find((item) => item.productId === product.id && item.variantId === (variant?.id || null))
    if (same) return
    setItems([...items, { productId: product.id, variantId: variant?.id || null, quantity: 1, expectedUnitMinor: variant?.unitMinor || product.unitMinor, inputs: {}, product, variantName: variant?.name || '' }])
    setConfirmed(false)
  }
  function changeItem(index: number, patch: Partial<Item>) { setItems(items.map((item, at) => at === index ? { ...item, ...patch } : item)); setConfirmed(false) }
  const payload = () => ({ customerId: customer?.id || null, customerName, customerPhone, method, reference, lines: items.map(({ product, variantName, ...line }) => line) })
  function nextSale() { if (sale.nextSale()) { setItems([]); setConfirmed(false); setCustomer(null); setCustomerName(''); setCustomerPhone(''); setCustomerQuery(''); setReference(''); setAttempt((value) => value + 1) } }

  return <StoreShell title="فروش حضوری" actions={<Link className="btn btn-ghost" href="/admin/store/orders">سفارش‌های ثبت‌شده</Link>}>
    {sale.message && <div className="sa-notice is-error" role="alert">{sale.message}</div>}
    {sale.orderId ? <>
      <section className="sa-card counter-result" role="status"><h2>فروش شمارهٔ {sale.orderId.toLocaleString('fa-IR')} ثبت شده است</h2><div className="sa-row-actions">
        <button type="button" className="btn btn-primary" disabled={!sale.receipt} onClick={() => window.print()}>چاپ رسید و کارت‌ها</button>
        <button type="button" className="btn btn-ghost" onClick={nextSale}>فروش بعدی</button>
        <Link className="btn btn-ghost" href={`/admin/store/orders/${sale.orderId}`}>جزئیات سفارش</Link>
        {!sale.receipt && <button type="button" className="btn btn-ghost" onClick={sale.retryReceipt}>دریافت دوبارهٔ رسید</button>}
      </div></section>
      {sale.receipt ? <Receipt receipt={sale.receipt} /> : <p role="status">در حال دریافت رسید…</p>}
    </> : <>
      {sale.uncertain && <section className="sa-card"><div className="sa-row-actions">
        {sale.canRetry && <button type="button" className="btn btn-primary" disabled={sale.busy} onClick={() => void sale.submit(payload())}>تلاش مجدد همان فروش</button>}
        <button type="button" className="btn btn-ghost" disabled={sale.busy} onClick={() => void sale.recover()}>بررسی وضعیت فروش قبلی</button>
        <button type="button" className="btn btn-ghost" disabled={sale.busy} onClick={nextSale}>شروع فروش جداگانه</button>
      </div></section>}
      <form className="counter-layout" onSubmit={(event) => { event.preventDefault(); if (confirmed) void sale.submit(payload()) }}>
        <fieldset className="sa-card counter-products" disabled={locked}><legend>کالاهای فروش</legend>
          <label htmlFor="counter-search">نام یا کد کالا</label><input id="counter-search" className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          {loading && <p role="status" aria-busy="true">در حال دریافت کالاها…</p>}
          {loadError && <p role="alert">{loadError} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button></p>}
          {!loading && !loadError && !products.length && <p className="sa-hint">کالای فعال فیزیکی یا محصول دارای انبار کد پیدا نشد.</p>}
          <label htmlFor="counter-product">کالا</label><select id="counter-product" className="input" value={productId} onChange={(event) => { setProductId(Number(event.target.value)); setVariantId(0) }}><option value={0}>انتخاب کالا</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.kind === 'PHYSICAL' ? ' · فیزیکی' : ' · انبار کد'}</option>)}</select>
          {product && product.variants.length > 0 && <><label htmlFor="counter-variant">گزینهٔ کالا</label><select id="counter-variant" className="input" value={variantId} onChange={(event) => setVariantId(Number(event.target.value))}><option value={0}>انتخاب گزینه</option>{product.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></>}
          {product && <p className="sa-hint">قیمت واحد {formatMoney(BigInt(variant?.unitMinor || product.unitMinor), product.currency, 'fa-IR')}{(variant?.stock ?? product.stock) >= 0 ? ` · موجودی ${(variant?.stock ?? product.stock).toLocaleString('fa-IR')}` : ''}</p>}
          <button type="button" className="btn btn-ghost" disabled={!product || !!(product.variants.length && !variant) || items.length >= 30 || items.some((item) => item.productId === product.id && item.variantId === (variant?.id || null)) || !!(currency && currency !== product.currency)} onClick={addItem}>افزودن به فروش</button>
          {items.map((item, index) => <section key={`${item.productId}:${item.variantId}`} className="counter-item" aria-label={item.product.name}>
            <header><h2>{item.product.name}{item.variantName && <small>{item.variantName}</small>}</h2><button type="button" className="btn btn-ghost btn-sm" aria-label={`حذف ${item.product.name}`} onClick={() => { setItems(items.filter((_, at) => at !== index)); setConfirmed(false) }}>حذف</button></header>
            <label htmlFor={`quantity-${index}`}>تعداد</label><input id={`quantity-${index}`} className="input" type="number" min={1} max={Math.min(99, item.product.maxPerOrder || 99)} required value={item.quantity} onChange={(event) => changeItem(index, { quantity: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} />
            <p>{priceOf(item)}</p>
            {fieldsFor(item.product.fields, item.variantName).map((field) => <label className="counter-field" key={field.key}>{field.label}{field.required ? ' *' : ''}<input className="input" type={field.kind === 'secret' ? 'password' : field.kind === 'email' ? 'email' : 'text'} autoComplete="off" required={field.required} value={item.inputs[field.key] || ''} onChange={(event) => changeItem(index, { inputs: { ...item.inputs, [field.key]: event.target.value } })} />{field.help && <small>{field.help}</small>}</label>)}
          </section>)}
          {!items.length && <p className="sa-hint">کالاهای تحویلی را به فروش اضافه کنید.</p>}
        </fieldset>
        <fieldset className="sa-card counter-payment" disabled={locked}><legend>مشتری و دریافت وجه</legend>
          <label htmlFor="counter-customer-search">حساب مشتری، در صورت وجود</label><input id="counter-customer-search" className="input" placeholder="نام، ایمیل یا موبایل" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} />
          {customers.length > 0 && <select className="input" aria-label="انتخاب حساب مشتری" value={customer?.id || 0} onChange={(event) => { const next = customers.find((item) => item.id === Number(event.target.value)) || null; setCustomer(next); if (next) { setCustomerName(next.name); setCustomerPhone(next.phone) } }}><option value={0}>بدون حساب سایت</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name || item.email} · {item.phone || item.email}</option>)}</select>}
          {customer && <p>{customer.name || customer.email} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCustomer(null)}>فروش بدون حساب</button></p>}
          <label htmlFor="counter-customer-name">نام مشتری، اختیاری</label><input id="counter-customer-name" className="input" maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          <label htmlFor="counter-customer-phone">موبایل، اختیاری</label><input id="counter-customer-phone" className="input" type="tel" maxLength={30} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
          <label htmlFor="counter-method">روش دریافت وجه</label><select id="counter-method" className="input" value={method} onChange={(event) => { setMethod(event.target.value as CounterPaymentMethod); setConfirmed(false) }}><option value="CASH">نقدی</option><option value="CARD">کارت‌خوان</option></select>
          <label htmlFor="counter-reference">شمارهٔ پیگیری، اختیاری</label><input id="counter-reference" className="input" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />
          <p className="counter-total">جمع فروش <strong>{currency ? formatMoney(total, currency, 'fa-IR') : '—'}</strong></p>
          <label className="counter-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />کل مبلغ را دریافت کرده‌ام و کالاها اکنون به مشتری تحویل می‌شوند</label>
          <button className="btn btn-primary" type="submit" disabled={!items.length || !confirmed || locked}>{sale.busy ? 'در حال ثبت…' : 'ثبت فروش و دریافت رسید'}</button>
        </fieldset>
      </form>
    </>}
  </StoreShell>
}
