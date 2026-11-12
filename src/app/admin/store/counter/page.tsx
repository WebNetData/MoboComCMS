'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { StoreShell } from '../shared'
import { formatMoney } from '@/shared/money'
import { fieldsFor } from '@/modules/store/domain/order-inputs'
import type { CounterProduct, CounterCustomer, CounterLine } from '@/modules/store/domain/counter-sales'
import { useCounterSale } from './useCounterSale'
import Receipt from './Receipt'
import CustomerDesk from './CustomerDesk'
import PaymentDesk, { EMPTY_PAYMENT, paymentRows, type DeskPayment } from './PaymentDesk'
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
  const [customer, setCustomer] = useState<CounterCustomer | null>(null)
  const [payment,setPayment]=useState<DeskPayment>(EMPTY_PAYMENT)
  const [sessions,setSessions]=useState<{id:number;register:string;currency:string;status:string;mine:boolean}[]>([])
  const [sessionId,setSessionId]=useState(0)
  const [scan,setScan]=useState(''),[scanBusy,setScanBusy]=useState(false),[localError,setLocalError]=useState('')
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

  useEffect(()=>{const controller=new AbortController();fetch('/api/admin/store/counter?registers=1',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'صندوق‌ها دریافت نشدند');if(!controller.signal.aborted)setSessions(data.sessions)}).catch(error=>{if(!controller.signal.aborted)setLocalError(error.message)});return()=>controller.abort()},[sale.orderId,attempt])

  async function scanItem(){
    if(!scan.trim()||scanBusy)return
    setScanBusy(true);setLocalError('')
    try{const response=await fetch('/api/admin/store/counter?scan='+encodeURIComponent(scan.trim()),{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error||'بارکد پیدا نشد')
      const scanned=body.product as CounterProduct, option=scanned.variants.find(item=>item.id===body.variantId)
      if(currency&&currency!==scanned.currency)throw Error('واحد پول کالاهای یک فروش باید یکسان باشد')
      if(body.requiresVariant){setProducts(previous=>[scanned,...previous.filter(item=>item.id!==scanned.id)]);setProductId(scanned.id);setVariantId(0);setLocalError('گزینهٔ کالا را انتخاب و به فروش اضافه کنید')}
      else setItems(previous=>{const index=previous.findIndex(item=>item.productId===scanned.id&&item.variantId===(option?.id||null));if(index>=0)return previous.map((item,at)=>at===index?{...item,quantity:Math.min(99,scanned.maxPerOrder||99,item.quantity+1)}:item);if(previous.length>=30)return previous;return [...previous,{productId:scanned.id,variantId:option?.id||null,quantity:1,expectedUnitMinor:option?.unitMinor||scanned.unitMinor,inputs:{},product:scanned,variantName:option?.name||''}]})
      setScan('');setConfirmed(false)
    }catch(error){setLocalError(error instanceof Error?error.message:'ارتباط برقرار نشد')}finally{setScanBusy(false)}
  }

  function addItem() {
    if (!product || (product.variants.length && !variant)) return
    const same = items.find((item) => item.productId === product.id && item.variantId === (variant?.id || null))
    if (same) return
    setItems([...items, { productId: product.id, variantId: variant?.id || null, quantity: 1, expectedUnitMinor: variant?.unitMinor || product.unitMinor, inputs: {}, product, variantName: variant?.name || '' }])
    setConfirmed(false)
  }
  function changeItem(index: number, patch: Partial<Item>) { setItems(items.map((item, at) => at === index ? { ...item, ...patch } : item)); setConfirmed(false) }
  const payload = () => ({ customerId: customer?.id || null, customerName, customerPhone, sessionId, method:payment.method, reference:payment.reference, payments:paymentRows(payment,total,currency),walletCode:payment.walletCode,redeemPoints:payment.points, lines: items.map(({ product, variantName, ...line }) => line) })
  function submitSale(){try{void sale.submit(payload())}catch(error){setLocalError(error instanceof Error?error.message:'مبالغ پرداخت معتبر نیست')}}
  function nextSale() { if (sale.nextSale()) { setItems([]); setConfirmed(false); setCustomer(null); setCustomerName(''); setCustomerPhone(''); setPayment(EMPTY_PAYMENT); setLocalError(''); setAttempt((value) => value + 1) } }

  return <StoreShell title="فروش حضوری" actions={<Link className="btn btn-ghost" href="/admin/store/orders">سفارش‌های ثبت‌شده</Link>}>
    {localError&&<div className="sa-notice is-error" role="alert">{localError}</div>}
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
        {sale.canRetry && <button type="button" className="btn btn-primary" disabled={sale.busy} onClick={submitSale}>تلاش مجدد همان فروش</button>}
        <button type="button" className="btn btn-ghost" disabled={sale.busy} onClick={() => void sale.recover()}>بررسی وضعیت فروش قبلی</button>
        <button type="button" className="btn btn-ghost" disabled={sale.busy} onClick={nextSale}>شروع فروش جداگانه</button>
      </div></section>}
      <form className="counter-layout" onSubmit={(event) => { event.preventDefault(); if (confirmed) submitSale() }}>
        <fieldset className="sa-card counter-products" disabled={locked}><legend>کالاهای فروش</legend>
          <label htmlFor="counter-scan">بارکدخوان / بارکد کالا</label><div className="sa-row"><input id="counter-scan" className="input" value={scan} autoComplete="off" dir="ltr" onChange={event=>setScan(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void scanItem()}}}/><button type="button" className="btn btn-ghost" disabled={scanBusy||!scan.trim()} onClick={()=>void scanItem()}>{scanBusy?'در حال بررسی…':'افزودن با بارکد'}</button></div>
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
          <label htmlFor="counter-session">نوبت صندوق</label><select id="counter-session" className="input" value={sessionId} required onChange={event=>{setSessionId(Number(event.target.value));setConfirmed(false)}}><option value={0}>صندوق باز خود را انتخاب کنید</option>{sessions.filter(row=>row.status==='OPEN'&&row.mine).map(row=><option key={row.id} value={row.id}>{row.register} · {row.currency}</option>)}</select><Link className="sa-link" href="/admin/store/registers">بازکردن / بستن صندوق</Link>
          <CustomerDesk customer={customer} name={customerName} phone={customerPhone} onCustomer={value=>{setCustomer(value);setConfirmed(false)}} onName={setCustomerName} onPhone={setCustomerPhone}/>
          <PaymentDesk value={payment} onChange={value=>{setPayment(value);setConfirmed(false)}} total={total} currency={currency} customerId={customer?.id||null}/>
          <p className="counter-total">جمع فروش <strong>{currency ? formatMoney(total, currency, 'fa-IR') : '—'}</strong></p>
          <label className="counter-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />کل مبلغ را دریافت کرده‌ام و کالاها اکنون به مشتری تحویل می‌شوند</label>
          <button className="btn btn-primary" type="submit" disabled={!items.length || !confirmed || !sessionId || scanBusy || locked}>{sale.busy ? 'در حال ثبت…' : 'ثبت فروش و دریافت رسید'}</button>
        </fieldset>
      </form>
    </>}
  </StoreShell>
}
