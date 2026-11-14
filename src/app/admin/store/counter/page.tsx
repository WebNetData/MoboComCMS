'use client'
import FulfilmentDesk, { EMPTY_SHIPMENT, shipmentInput, type DeskShipment } from './FulfilmentDesk'
import { useCounterQuote } from './useCounterQuote'

import { useEffect, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { useControlNavigation } from '@/components/admin/navigation/ControlNavigation'
import { StoreShell } from '../shared'
import { formatMoney } from '@/shared/money'
import { fieldsFor } from '@/modules/store/domain/order-inputs'
import type { CounterProduct, CounterCustomer, CounterLine } from '@/modules/store/domain/counter-sales'
import { useCounterSale } from './useCounterSale'
import Receipt from './Receipt'
import type { SaleDocumentFormat } from '@/components/store/SaleReceiptDocument'
import CustomerDesk, { EMPTY_BUYER, buyerState, type Buyer } from './CustomerDesk'
import PaymentDesk, { EMPTY_PAYMENT, paymentRows, type DeskPayment } from './PaymentDesk'
import DoneMark from '../DoneMark'
import RepairDesk, { newWorkRow, workIncomplete, workLines, workTotal, type RepairInfo, type WorkRow } from './RepairDesk'
import '../desk.css'

type Item = CounterLine & { product: CounterProduct; variantName: string }
const PAPER_KEY = 'store.counter.paper.v1'
const BUYER_NOTE = { linked: 'حساب موجود', new: 'حساب تازه', guest: 'مهمان', invalid: 'موبایل ناقص' } as const
const PAPERS: { value: SaleDocumentFormat; label: string }[] = [{ value: 'sheet', label: 'فاکتور A4' }, { value: 'roll', label: 'رول ۸۰ میلی‌متری' }]
const lineKey = (productId: number, variantId: number | null) => `${productId}:${variantId}`
const priceOf = (item: Item) => formatMoney(BigInt(item.expectedUnitMinor) * BigInt(item.quantity), item.product.currency, 'fa-IR')
const maxOf = (item: Item) => Math.min(99, item.product.maxPerOrder || 99)

function Step({ n, title, done, note, children }: { n: number; title: string; done: boolean; note?: string; children: ReactNode }) {
  return <section className={`cd-step${done ? ' is-done' : ''}`} aria-labelledby={`cd-step-${n}`}>
    <header><span className="cd-step-mark" aria-hidden="true">{done ? <DoneMark /> : n.toLocaleString('fa-IR')}</span><h2 id={`cd-step-${n}`}>{title}</h2>{note && <span className="cd-step-note">{note}</span>}</header>
    <div className="cd-step-body">{children}</div>
  </section>
}

export default function CounterSales() {
  const sale = useCounterSale()
  const ordersReachable = useControlNavigation().groups.some(group => group.items.some(item => item.href === '/admin/store/orders'))
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CounterProduct[]>([])
  const [productId, setProductId] = useState(0)
  const [variantId, setVariantId] = useState(0)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [buyer, setBuyer] = useState<Buyer>(EMPTY_BUYER)
  const [customer, setCustomer] = useState<CounterCustomer | null>(null)
  const [discountCode, setDiscountCode] = useState('')
  const [shipment, setShipment] = useState<DeskShipment>(EMPTY_SHIPMENT)
  const [quoteAttempt, setQuoteAttempt] = useState(0)
  const [payment, setPayment] = useState<DeskPayment>(EMPTY_PAYMENT)
  const [sessions, setSessions] = useState<{ id: number; register: string; currency: string; status: string; mine: boolean; location?: string }[] | null>(null)
  const [sessionId, setSessionId] = useState(0)
  const [scan, setScan] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [scanNote, setScanNote] = useState('')
  // The line last added or counted up; `n` remounts its highlight so a second scan of the same item flashes again.
  const [fresh, setFresh] = useState({ key: '', n: 0 })
  const [confirmed, setConfirmed] = useState(false)
  // The counter's printer decides the paper; it is a per-browser convenience, so storage failures only mean the default.
  const [paper, setPaper] = useState<SaleDocumentFormat>('sheet')
  useEffect(() => { try { if (localStorage.getItem(PAPER_KEY) === 'roll') setPaper('roll') } catch { /* default paper */ } }, [])
  function choosePaper(value: SaleDocumentFormat) { setPaper(value); try { localStorage.setItem(PAPER_KEY, value) } catch { /* not remembered */ } }
  // A repair invoiced here (`?repair=<id>` from the forms desk): the work and bought-in parts typed by staff, beside parts from stock.
  const [repairId, setRepairId] = useState(0)
  const [repair, setRepair] = useState<RepairInfo | null>(null)
  const [work, setWork] = useState<WorkRow[]>([])
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get('repair')); if (Number.isSafeInteger(id) && id > 0) setRepairId(id) }, [])
  useEffect(() => {
    if (!repairId) return
    const controller = new AbortController()
    fetch(`/api/admin/store/counter?repair=${repairId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'درخواست تعمیر خوانده نشد')
        if (controller.signal.aborted) return
        const info = body.repair as RepairInfo, [firstName = '', ...rest] = info.customerName.split(/\s+/).filter(Boolean)
        setRepair(info); setWork((rows) => rows.length ? rows : [newWorkRow(false)])
        setBuyer((current) => current.phone || current.firstName ? current : { phone: info.phone, firstName, lastName: rest.join(' ') })
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLocalError(error instanceof Error ? error.message : 'درخواست تعمیر خوانده نشد') })
    return () => controller.abort()
  }, [repairId])
  const product = products.find((item) => item.id === productId)
  const variant = product?.variants.find((item) => item.id === variantId)
  const currency = items[0]?.product.currency || (repair ? (sessions || []).find((row) => row.id === sessionId)?.currency || '' : '')
  const repairLines = repair ? workLines(work, currency) : []
  const repairInput = repair ? { repair: { submissionId: repair.id, currency, work: repairLines } } : {}
  const hasLines = items.length > 0 || repairLines.length > 0
  const subtotal = items.reduce((sum, item) => sum + BigInt(item.expectedUnitMinor) * BigInt(item.quantity), 0n) + (repair ? workTotal(work, currency) : 0n)
  const needsQuote = hasLines
  const quote = useCounterQuote(needsQuote && hasLines ? { lines: items.map(({ product, variantName, ...line }) => line), ...repairInput, customerId: customer?.id || null, customerPhone: buyer.phone.trim(), discountCode, shipment: shipmentInput(shipment), attempt: quoteAttempt } : null)
  const total = quote.quote ? BigInt(quote.quote.totalMinor) : subtotal
  const quoteReady = !needsQuote || !!quote.quote
  useEffect(() => { setConfirmed(false) }, [quote.quote?.warningFingerprint, quote.quote?.totalMinor])
  const sourceQuery = shipment.enabled && shipment.locationId ? `&shipLocation=${shipment.locationId}` : ''
  const units = items.reduce((sum, item) => sum + item.quantity, 0)
  const locked = sale.busy || sale.uncertain
  const buyerStatus = buyerState(buyer, customer)
  const openSessions = (sessions || []).filter((row) => row.status === 'OPEN' && row.mine)
  let paymentReady = false
  try {
    const rows = paymentRows(payment, total, currency), needsCode = rows.some((row) => row.method === 'WALLET') || payment.points > 0
    paymentReady = hasLines && rows.length > 0 && (!rows.some((row) => row.method === 'CARD') || !!payment.reference.trim()) && (!needsCode || payment.walletCode.length === 6)
  } catch { paymentReady = false }

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true); setLoadError('')
      fetch(`/api/admin/store/counter?q=${encodeURIComponent(query)}&session=${sessionId}${sourceQuery}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'کالاها دریافت نشدند'); if (!controller.signal.aborted) setProducts(body.products) })
        .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'ارتباط با سرور برقرار نشد') })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, attempt, sessionId, sourceQuery])

  useEffect(() => { const controller = new AbortController(); fetch('/api/admin/store/counter?registers=1', { cache: 'no-store', signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok) throw Error(data.error || 'صندوق‌ها دریافت نشدند'); if (!controller.signal.aborted) setSessions(data.sessions) }).catch((error) => { if (!controller.signal.aborted) setLocalError(error.message) }); return () => controller.abort() }, [sale.orderId, attempt])

  function touched(key: string, name: string, quantity: number) {
    setFresh((previous) => ({ key, n: previous.n + 1 }))
    setScanNote(quantity > 1 ? `${name} — تعداد ${quantity.toLocaleString('fa-IR')}` : `${name} به فروش اضافه شد`)
  }

  async function scanItem() {
    if (!scan.trim() || scanBusy) return
    setScanBusy(true); setLocalError(''); setScanNote('')
    try {
      const response = await fetch('/api/admin/store/counter?scan=' + encodeURIComponent(scan.trim()) + '&session=' + sessionId + sourceQuery, { cache: 'no-store' }), body = await response.json(); if (!response.ok) throw Error(body.error || 'بارکد پیدا نشد')
      const scanned = body.product as CounterProduct, option = scanned.variants.find((item) => item.id === body.variantId)
      if (currency && currency !== scanned.currency) throw Error('واحد پول کالاهای یک فروش باید یکسان باشد')
      if (body.requiresVariant) { setProducts((previous) => [scanned, ...previous.filter((item) => item.id !== scanned.id)]); setProductId(scanned.id); setVariantId(0); setLocalError('گزینهٔ کالا را انتخاب و به فروش اضافه کنید') }
      else {
        const key = lineKey(scanned.id, option?.id || null), existing = items.find((item) => lineKey(item.productId, item.variantId) === key)
        if (!existing && items.length >= 30) throw Error('یک فروش حداکثر ۳۰ ردیف کالا دارد')
        setItems((previous) => { const index = previous.findIndex((item) => item.productId === scanned.id && item.variantId === (option?.id || null)); if (index >= 0) return previous.map((item, at) => at === index ? { ...item, quantity: Math.min(99, scanned.maxPerOrder || 99, item.quantity + 1), deviceIdentifiers: item.deviceIdentifiers?.length ? [...item.deviceIdentifiers, { serial: '', imei: '' }] : undefined } : item); if (previous.length >= 30) return previous; return [...previous, { productId: scanned.id, variantId: option?.id || null, quantity: 1, expectedUnitMinor: option?.unitMinor || scanned.unitMinor, inputs: {}, product: scanned, variantName: option?.name || '' }] })
        touched(key, option ? `${scanned.name} · ${option.name}` : scanned.name, existing ? Math.min(99, scanned.maxPerOrder || 99, existing.quantity + 1) : 1)
      }
      setScan(''); setConfirmed(false)
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'ارتباط برقرار نشد') } finally { setScanBusy(false) }
  }

  function addItem() {
    if (!product || (product.variants.length && !variant)) return
    const same = items.find((item) => item.productId === product.id && item.variantId === (variant?.id || null))
    if (same) return
    setItems([...items, { productId: product.id, variantId: variant?.id || null, quantity: 1, expectedUnitMinor: variant?.unitMinor || product.unitMinor, inputs: {}, product, variantName: variant?.name || '' }])
    touched(lineKey(product.id, variant?.id || null), variant ? `${product.name} · ${variant.name}` : product.name, 1)
    setConfirmed(false)
  }
  function changeItem(index: number, patch: Partial<Item>) { if (patch.deviceIdentifiers?.every(id => !id.serial.trim() && !id.imei.trim())) patch.deviceIdentifiers = undefined; setItems(items.map((item, at) => at === index ? { ...item, ...patch } : item)); setConfirmed(false) }
  // A card reference typed before switching to cash must not reach a cash receipt.
  const payload = () => { const payments = paymentRows(payment, total, currency); return { ...(discountCode.trim() ? { discountCode } : {}), ...(shipment.enabled ? { shipment: shipmentInput(shipment) } : {}), ...(needsQuote && quote.quote ? { expectedTotalMinor: quote.quote.totalMinor, warningFingerprint: confirmed ? quote.quote.warningFingerprint || undefined : undefined } : {}), customerId: customer?.id || null, customerName: [buyer.firstName.trim(), buyer.lastName.trim()].filter(Boolean).join(' '), customerFirstName: buyer.firstName.trim(), customerLastName: buyer.lastName.trim(), customerPhone: buyer.phone.trim(), sessionId, method: payment.method, reference: payments.some((row) => row.method === 'CARD') ? payment.reference : '', payments, walletCode: payment.walletCode, redeemPoints: payment.points, lines: items.map(({ product, variantName, ...line }) => line), ...repairInput } }
  function submitSale() { try { void sale.submit(payload()) } catch (error) { setLocalError(error instanceof Error ? error.message : 'مبالغ پرداخت معتبر نیست') } }
  function nextSale() { if (sale.nextSale()) { setItems([]); setDiscountCode(''); setShipment(EMPTY_SHIPMENT); setConfirmed(false); setCustomer(null); setBuyer(EMPTY_BUYER); setPayment(EMPTY_PAYMENT); setLocalError(''); setScanNote(''); setRepair(null); setRepairId(0); setWork([]); setAttempt((value) => value + 1) } }
  const addDisabled = !product || !!(product.variants.length && !variant) || items.length + work.length >= 30 || items.some((item) => item.productId === product.id && item.variantId === (variant?.id || null)) || !!(currency && currency !== product.currency)
  const stock = product ? (variant?.stock ?? product.stock) : -1

// Registers and returns are tabs of the desk; the store's order list only for someone who may open it (not a cashier).
return <StoreShell title={repair ? 'فاکتور تعمیر' : 'فروش حضوری'} actions={ordersReachable ? <Link className="btn btn-ghost" href="/admin/store/orders">سفارش‌های ثبت‌شده</Link> : undefined}>
    {localError && <div className="sa-notice is-error" role="alert">{localError}</div>}
    {sale.message && <div className="sa-notice is-error" role="alert">{sale.message}</div>}
    {sale.orderId ? <>
      <section className="sa-card cd-done" role="status">
        <span className="cd-done-mark" aria-hidden="true"><DoneMark size={28} /></span>
        <div className="cd-done-text"><h2>فروش شمارهٔ <bdi className="cd-num">{sale.orderId.toLocaleString('fa-IR', { useGrouping: false })}</bdi> ثبت شد</h2>
          <p>{sale.receipt ? <>مبلغ دریافت‌شده <b className="cd-num">{formatMoney(BigInt(sale.receipt.totalMinor), sale.receipt.currency, 'fa-IR')}</b> · رسید آمادهٔ چاپ است</> : 'در حال دریافت رسید…'}</p></div>
        <div className="cd-done-actions">
          <fieldset className="cd-seg cd-paper"><legend className="cd-sr">کاغذ چاپ</legend>{PAPERS.map((option) => <label key={option.value} className={paper === option.value ? 'is-on' : ''}><input type="radio" name="counter-paper" value={option.value} checked={paper === option.value} onChange={() => choosePaper(option.value)} />{option.label}</label>)}</fieldset>
          <button type="button" className="btn btn-primary" disabled={!sale.receipt} onClick={() => window.print()}>{sale.receipt?.cards.length ? 'چاپ رسید و کارت‌ها' : 'چاپ رسید'}</button>
          {sale.receipt && <Link className="btn btn-ghost" href={`/invoice/${encodeURIComponent(sale.receipt.invoiceNumber)}/official`} target="_blank">صورتحساب رسمی</Link>}
          <Link className="btn btn-ghost" href={`/admin/store/orders/${sale.orderId}`}>جزئیات سفارش</Link>
          {repair && <Link className="btn btn-ghost" href={`/admin/forms?form=${repair.formId}&tab=inbox`}>بازگشت به درخواست تعمیر</Link>}
          <button type="button" className="btn btn-ghost cd-next" onClick={nextSale}>فروش بعدی</button>
          {!sale.receipt && <button type="button" className="btn btn-ghost" onClick={sale.retryReceipt}>دریافت دوبارهٔ رسید</button>}
        </div>
      </section>
      {sale.receipt?.seller && !sale.receipt.seller.address && !sale.receipt.seller.phone && <p className="sa-notice cd-profile-hint">نشانی، تلفن و کدهای فروشگاه هنوز روی فاکتور نیستند. آن‌ها را یک بار در <Link className="sa-link" href="/admin/invoice-profile">پروفایل فاکتور</Link> ثبت کنید تا روی همهٔ فاکتورها چاپ شوند.</p>}
      {sale.receipt ? <Receipt receipt={sale.receipt} format={paper} /> : <p className="sa-hint" role="status">در حال دریافت رسید…</p>}
    </> : <>
      {sale.uncertain && <section className="sa-card cd-uncertain"><p>پاسخ ثبت فروش قبلی نرسید. پیش از فروش دیگر وضعیت آن را بررسی کنید.</p><div className="sa-row-actions">
        {sale.canRetry && <button type="button" className="btn btn-primary" disabled={sale.busy} onClick={submitSale}>تلاش مجدد همان فروش</button>}
        <button type="button" className="btn btn-ghost" disabled={sale.busy} onClick={() => void sale.recover()}>بررسی وضعیت فروش قبلی</button>
        <button type="button" className="btn btn-ghost" disabled={sale.busy} onClick={nextSale}>شروع فروش جداگانه</button>
      </div></section>}
      <form className="cd-layout" onSubmit={(event) => { event.preventDefault(); if (confirmed) submitSale() }}>
        <fieldset className="sa-card cd-basket" disabled={locked}><legend className="cd-sr">کالاهای فروش</legend>
          {repair && <RepairDesk repair={repair} rows={work} onRows={(rows) => { setWork(rows); setConfirmed(false) }} currency={currency} stockLines={items.length} />}
          <div className="cd-scan">
            <label htmlFor="counter-scan">بارکد کالا</label>
            <div className="cd-scan-field">
              <svg className="cd-scan-glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" /></svg>
              <input id="counter-scan" className="input" value={scan} autoComplete="off" dir="ltr" placeholder="بارکدخوان را اینجا بزنید" aria-describedby="counter-scan-note" onChange={(event) => setScan(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scanItem() } }} />
              <button type="button" className="btn btn-ghost" disabled={scanBusy || !scan.trim()} onClick={() => void scanItem()}>{scanBusy ? 'در حال بررسی…' : 'افزودن'}</button>
            </div>
            <p id="counter-scan-note" className={`cd-scan-note${scanNote ? ' is-ok' : ''}`} role="status">{scanBusy ? 'در حال خواندن بارکد…' : scanNote || 'Enter کالا یا گونهٔ دقیق را اضافه می‌کند'}</p>
          </div>

          <details className="cd-pick" open={!items.length || !!product}>
            <summary>انتخاب دستی کالا</summary>
            <div className="cd-pick-body">
              <label className="cd-field cd-field-wide"><span>نام یا کد کالا</span><input id="counter-search" className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <label className="cd-field"><span>کالا</span><select id="counter-product" className="input" value={productId} onChange={(event) => { setProductId(Number(event.target.value)); setVariantId(0) }}><option value={0}>{loading ? 'در حال دریافت کالاها…' : 'انتخاب کالا'}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.kind === 'PHYSICAL' ? ' · فیزیکی' : ' · انبار کد'}</option>)}</select></label>
              {product && product.variants.length > 0 && <label className="cd-field"><span>گزینهٔ کالا</span><select id="counter-variant" className="input" value={variantId} onChange={(event) => setVariantId(Number(event.target.value))}><option value={0}>انتخاب گزینه</option>{product.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
              {loadError && <p className="cd-field-wide" role="alert">{loadError} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button></p>}
              {!loading && !loadError && !products.length && <p className="sa-hint cd-field-wide">کالای فعال فیزیکی یا محصول دارای انبار کد پیدا نشد.</p>}
              <div className="cd-pick-foot cd-field-wide">
                {product ? <p className="cd-pick-price"><b className="cd-num">{formatMoney(BigInt(variant?.unitMinor || product.unitMinor), product.currency, 'fa-IR')}</b>{stock >= 0 && <span className={`sa-stock${stock === 0 ? ' is-out' : stock <= 3 ? ' is-low' : ''}`}>موجودی {stock.toLocaleString('fa-IR')}</span>}</p> : <span />}
                <button type="button" className="btn btn-ghost" disabled={addDisabled} onClick={addItem}>افزودن به فروش</button>
              </div>
            </div>
          </details>

          <div className="cd-lines-head"><h2>{repair ? 'قطعه‌های تعویض‌شده از انبار' : 'کالاهای این فروش'}</h2>{items.length > 0 && <span className="cd-meta">{items.length.toLocaleString('fa-IR')} ردیف · {units.toLocaleString('fa-IR')} عدد</span>}</div>
          {items.length ? <ol className="cd-lines">{items.map((item, index) => {
            const key = lineKey(item.productId, item.variantId), fields = fieldsFor(item.product.fields, item.variantName)
            return <li key={key} className="cd-line" aria-label={item.product.name}>
              {fresh.key === key && <span key={fresh.n} className="cd-flash" aria-hidden="true" />}
              <div className="cd-line-main">
                <div className="cd-line-name"><b>{item.product.name}</b><small>{item.variantName && <>{item.variantName} · </>}{item.product.kind === 'PHYSICAL' ? 'کالای فیزیکی' : 'کارت از انبار کد'} · واحد {formatMoney(BigInt(item.expectedUnitMinor), item.product.currency, 'fa-IR')}</small></div>
                <div className="cd-qty" role="group" aria-label={`تعداد ${item.product.name}`}>
                  <button type="button" aria-label="یکی بیشتر" disabled={item.quantity >= maxOf(item)} onClick={() => changeItem(index, { quantity: Math.min(maxOf(item), item.quantity + 1) })}>+</button>
                  <input id={`quantity-${index}`} aria-label="تعداد" className="cd-num" type="number" inputMode="numeric" min={1} max={maxOf(item)} required value={item.quantity} onChange={(event) => { const quantity = Math.max(1, Math.min(99, Math.floor(Number(event.target.value) || 1))); changeItem(index, { quantity, ...(item.deviceIdentifiers?.length ? { deviceIdentifiers: Array.from({ length: quantity }, (_, at) => item.deviceIdentifiers?.[at] || { serial: '', imei: '' }) } : {}) }) }} />
                  <button type="button" aria-label="یکی کمتر" disabled={item.quantity <= 1} onClick={() => changeItem(index, { quantity: Math.max(1, item.quantity - 1) })}>−</button>
                </div>
                <b className="cd-line-total cd-num">{priceOf(item)}</b>
                <button type="button" className="cd-remove" aria-label={`حذف ${item.product.name}`} onClick={() => { setItems(items.filter((_, at) => at !== index)); setConfirmed(false) }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
              </div>
              {fields.length > 0 && <div className="cd-line-fields">{fields.map((field) => <label className="cd-field" key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><input className="input" type={field.kind === 'secret' ? 'password' : field.kind === 'email' ? 'email' : 'text'} autoComplete="off" required={field.required} value={item.inputs[field.key] || ''} onChange={(event) => changeItem(index, { inputs: { ...item.inputs, [field.key]: event.target.value } })} />{field.help && <small>{field.help}</small>}</label>)}</div>}
              {item.product.kind === 'PHYSICAL' && <details className="cd-device-identifiers"><summary>شماره سریال یا IMEI (اختیاری)</summary><div className="cd-line-fields">{Array.from({ length: item.quantity }, (_, unit) => { const id = item.deviceIdentifiers?.[unit] || { serial: '', imei: '' }; return <div className="cd-device-unit" key={unit}><b>واحد {unit + 1}</b><label className="cd-field"><span>شماره سریال</span><input className="input" dir="ltr" autoComplete="off" value={id.serial} onChange={(event) => { const rows = Array.from({ length: item.quantity }, (_, at) => item.deviceIdentifiers?.[at] || { serial: '', imei: '' }); rows[unit] = { ...rows[unit], serial: event.target.value }; changeItem(index, { deviceIdentifiers: rows }) }} /></label><label className="cd-field"><span>IMEI</span><input className="input" dir="ltr" inputMode="numeric" autoComplete="off" value={id.imei} onChange={(event) => { const rows = Array.from({ length: item.quantity }, (_, at) => item.deviceIdentifiers?.[at] || { serial: '', imei: '' }); rows[unit] = { ...rows[unit], imei: event.target.value }; changeItem(index, { deviceIdentifiers: rows }) }} /></label></div> })}</div></details>}
            </li>
          })}</ol> : <div className="cd-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" /></svg><p>هنوز کالایی اضافه نشده است</p><small>بارکد را بخوانید یا کالا را دستی انتخاب کنید</small></div>}
        </fieldset>

        <fieldset className="sa-card cd-bill-panel" disabled={locked}><legend className="cd-sr">مشتری و دریافت وجه</legend>
          <Step n={1} title="صندوق" done={!!sessionId} note={sessionId ? openSessions.find((row) => row.id === sessionId)?.currency : undefined}>
            {sessions && !openSessions.length ? <div className="cd-inline-empty"><p>صندوق بازی به نام شما نیست</p><Link className="btn btn-primary btn-sm" href="/admin/store/registers">بازکردن صندوق</Link></div>
              : <><label htmlFor="counter-session" className="cd-sr">نوبت صندوق</label><select id="counter-session" className="input" value={sessionId} required onChange={(event) => { setSessionId(Number(event.target.value)); setConfirmed(false) }}><option value={0}>{sessions ? 'صندوق باز خود را انتخاب کنید' : 'در حال دریافت صندوق‌ها…'}</option>{openSessions.map((row) => <option key={row.id} value={row.id}>{row.register} · {row.currency}{row.location ? ` · ${row.location}` : ''}</option>)}</select></>}
          </Step>
          <Step n={2} title="مشتری" done={buyerStatus.kind === 'linked' || (buyerStatus.kind === 'new' && !buyerStatus.problem)} note={BUYER_NOTE[buyerStatus.kind]}>
            <CustomerDesk customer={customer} buyer={buyer} onCustomer={(value) => { setCustomer(value); setConfirmed(false) }} onBuyer={(value) => { setBuyer(value); setConfirmed(false) }} />
          </Step>
          <Step n={3} title="تخفیف و تحویل" done={quoteReady}><FulfilmentDesk value={shipment} onChange={value => { setShipment(value); setConfirmed(false) }} discountCode={discountCode} onDiscount={value => { setDiscountCode(value); setConfirmed(false) }} />{quote.loading && <p className="sa-hint" role="status">در حال بررسی مبلغ و ارسال…</p>}{quote.error && <p className="cd-error" role="alert">{quote.error} <button className="sa-link" type="button" onClick={() => setQuoteAttempt(value => value + 1)}>تلاش دوباره</button></p>}</Step>
          <Step n={4} title="دریافت وجه" done={paymentReady}>
            <PaymentDesk value={payment} onChange={(value) => { setPayment(value); setConfirmed(false) }} total={total} currency={currency} customerId={customer?.id || null} />
          </Step>

          <div className="cd-ticket">
            <dl className="cd-ticket-rows">
              <div><dt>ردیف کالا</dt><dd className="cd-num">{(items.length + repairLines.length).toLocaleString('fa-IR')}</dd></div>
              {quote.quote && <><div><dt>جمع کالاها</dt><dd>{formatMoney(BigInt(quote.quote.subtotalMinor), currency, 'fa-IR')}</dd></div><div><dt>تخفیف</dt><dd>{formatMoney(BigInt(quote.quote.discountMinor), currency, 'fa-IR')}</dd></div><div><dt>ارسال</dt><dd>{formatMoney(BigInt(quote.quote.shippingMinor), currency, 'fa-IR')}</dd></div></>}
              <div><dt>تعداد</dt><dd className="cd-num">{units.toLocaleString('fa-IR')}</dd></div>
            </dl>
            <p className="cd-ticket-total"><span>جمع فروش</span><strong key={total.toString()} className="cd-num">{currency ? formatMoney(total, currency, 'fa-IR') : '—'}</strong></p>
          </div>
          {!!quote.quote?.warnings?.length && <div className="cd-error" role="alert"><b>قیمت فروش نیاز به بررسی دارد</b><ul>{quote.quote.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><p>با تأیید دریافت وجه، این هشدارها را نیز می‌پذیرید.</p></div>}
          <label className="cd-confirm"><input type="checkbox" checked={confirmed && quoteReady} disabled={!quoteReady} onChange={(event) => setConfirmed(event.target.checked)} /><span>{repair ? 'کل مبلغ فاکتور تعمیر را از مشتری دریافت کرده‌ام' : shipment.enabled ? 'کل مبلغ را دریافت کرده‌ام؛ سفارش باید از انبار به نشانی مشتری ارسال شود' : 'کل مبلغ را دریافت کرده‌ام و کالاها اکنون به مشتری تحویل می‌شوند'}</span></label>
          {buyerStatus.problem && <p className="cd-error" role="status">{buyerStatus.problem}</p>}
          <button className="btn btn-primary cd-submit" type="submit" disabled={!hasLines || (!!repair && workIncomplete(work, currency)) || !confirmed || !quoteReady || !sessionId || scanBusy || locked || !!buyerStatus.problem}>{sale.busy ? 'در حال ثبت…' : repair ? 'ثبت و صدور فاکتور تعمیر' : shipment.enabled ? 'ثبت سفارش ارسالی و صدور فاکتور' : 'ثبت فروش و صدور فاکتور'}</button>
        </fieldset>
      </form>
    </>}
  </StoreShell>
}
