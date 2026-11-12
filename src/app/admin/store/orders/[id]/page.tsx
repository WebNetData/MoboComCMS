'use client'

import Link from '@/components/AppLink'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { FULFILMENT_LABEL, TRACKING_STEPS, isFulfilmentStatus, nextStatuses, trackingIndex, type FulfilmentStatus } from '@/modules/store/domain/store'
import { Money, Notice, StoreShell, STATE_TONE, fa, faDate, faDay, send, useJson } from '../../shared'
import ShipmentPanel from './ShipmentPanel'
import OrderAssignment, { type Assignment } from './OrderAssignment'
import LineInputs, { type InputLine } from './LineInputs'
import DeliveryDetailsEditor, { EMPTY_DELIVERY, draftFromTemplate, type DeliveryDraft } from '@/components/admin/store/DeliveryDetailsEditor'
import type { ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import { composeDeliveryDetails } from '@/modules/store/domain/delivery-details'

type Detail = Assignment & {
  id: number; createdAt: string; state: { key: string; label: string; tone: string }; fulfilment: string; trackingCode: string; deliveryNote: string
  address: { title: string; recipient: string; phone: string; postalCode: string; address: string; lat: number | null; lng: number | null } | null
  schedule: { date: string; slot: string } | null
  lines: (InputLine & { productId: number | null; slug: string; name: string; variantName: string; image: string; kind: string; quantity: number; unitPrice: number; listPrice: number; total: number })[]
  currency: string; itemsTotal: number; listTotal: number; discount: number; discountCode: string; shipping: number; total: number; walletApplied: number
  shippingMethod: { carrierId: string; carrierName: string; eta: string; weightGrams: number; collect?: boolean } | null
  invoiceNumber: string; invoiceStatus: string; orderStatus: string; gateway: string; hasDigitalDelivery: boolean; deliveryTemplate: ProductDeliveryTemplate | null
  saleSource: string
  customer: { id: number | null; name: string; email: string; phone: string; createdAt: string; paidOrders: number; spent: number }
  payments: { id: number; provider: string; status: string; amount: number; createdAt: string }[]
  events: { id: number; status: string; note: string; createdAt: string; visible: boolean; actor: string }[]
}

const EVENT_LABEL: Record<string, string> = { PAID: 'پرداخت تأیید شد', NOTE: 'یادداشت', RESTOCK: 'بازگشت به انبار', INPUTS_ERASED: 'پاک‌شدن اطلاعات خریدار', ...FULFILMENT_LABEL, PENDING: 'ثبت سفارش' }
const ACTION_LABEL: Record<FulfilmentStatus, string> = {
  PENDING: 'بازگشت به انتظار', PROCESSING: 'شروع پردازش', PACKED: 'بسته‌بندی شد', SHIPPED: 'ارسال شد', DELIVERED: 'تحویل داده شد', CANCELLED: 'لغو سفارش', RETURNED: 'ثبت مرجوعی',
}

export default function StoreOrderPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, setData, reload } = useJson<Detail>(`/api/admin/store/orders/${id}`)
  const [to, setTo] = useState<FulfilmentStatus | ''>('')
  const [tracking, setTracking] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [details, setDetails] = useState<DeliveryDraft>(EMPTY_DELIVERY)
  const [notify, setNotify] = useState(true)
  const [restock, setRestock] = useState(true)
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (error) return <StoreShell title="سفارش"><Notice tone="error">{error}</Notice></StoreShell>
  if (!data) return <StoreShell title="سفارش"><div className="sa-skeleton" aria-busy="true" /></StoreShell>

  const options = data.orderStatus === 'PAID' && data.canWork ? nextStatuses(data.fulfilment || 'PENDING').filter(status => data.manager || !['CANCELLED', 'RETURNED'].includes(status)) : []
  const virtual = data.lines.every((line) => line.kind !== 'PHYSICAL')
  const step = data.fulfilment === 'DELIVERED' ? TRACKING_STEPS.length : trackingIndex(data.fulfilment || 'PENDING')
  const closed = data.fulfilment === 'CANCELLED' || data.fulfilment === 'RETURNED'

  async function move() {
    if (!to) return
    if ((to === 'CANCELLED' || to === 'RETURNED') && !window.confirm(`سفارش «${ACTION_LABEL[to]}» شود؟ این تغییر برگشت‌پذیر نیست.`)) return
    // The specialist's delivery, checked here first so a missing value is said before anything is sent.
    let digitalDelivery: string | undefined
    if (virtual && to === 'DELIVERED' && (details.items.length || details.note.trim())) {
      try { digitalDelivery = composeDeliveryDetails(details) } catch (error) { setResult({ tone: 'error', text: error instanceof Error ? error.message : 'اطلاعات تحویل معتبر نیست' }); return }
    }
    setBusy(true); setResult(null)
    const response = await send<Detail>(`/api/admin/store/orders/${id}`, 'POST', { action: 'status', to, trackingCode: tracking ?? undefined, note, digitalDelivery, notify, restock: data?.manager === true && restock })
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setData(response.data); setTo(''); setNote(''); setDetails(EMPTY_DELIVERY); setTracking(null)
    setResult({ tone: 'ok', text: 'وضعیت سفارش به‌روز شد' + (notify ? ' و به مشتری اطلاع داده شد' : '') })
  }

  async function addNote() {
    if (message.trim().length < 2) return
    setBusy(true)
    const response = await send<Detail>(`/api/admin/store/orders/${id}`, 'POST', { action: 'note', note: message, visible })
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setData(response.data); setMessage('')
  }

  return <StoreShell title={`سفارش #${fa(data.id)}`} actions={<>
    <Link className="btn btn-ghost" href="/admin/store/pickup">صف تحویل از فروشگاه</Link>
    {data.manager && data.saleSource === 'COUNTER' && data.fulfilment === 'DELIVERED' && data.orderStatus === 'PAID' && <Link className="btn btn-ghost" href={`/admin/store/counter?order=${data.id}`}>رسید و کارت‌های فروش حضوری</Link>}
    {virtual && data.fulfilment === 'DELIVERED' && data.hasDigitalDelivery && <Link className="btn btn-ghost" href={`/admin/store/print?order=${data.id}`}>چاپ کارت</Link>}
    <span className={`sa-state ${STATE_TONE[data.state.tone] || ''}`}>{data.state.label}</span>
    <button type="button" className="btn btn-ghost" onClick={() => window.print()}>چاپ برگهٔ ارسال</button>
    {data.invoiceNumber && <Link href={`/invoice/${data.invoiceNumber}`} className="btn btn-ghost" target="_blank">فاکتور</Link>}
  </>}>
    <Link href="/admin/store/orders" className="sa-link sa-back">بازگشت به سفارش‌ها</Link>
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    {data.orderStatus === 'PAID' && !closed && <ol className="sa-steps" aria-label="مراحل سفارش">{TRACKING_STEPS.map((item, index) => <li key={item.status} className={index < step ? 'is-done' : index === step ? 'is-current' : ''}><span>{fa(index + 1)}</span>{item.label}</li>)}</ol>}

    <div className="sa-cols">
      <div className="sa-stack">
        {data.orderStatus === 'PAID' && <OrderAssignment id={data.id} work={data} onChanged={() => void reload()} />}
        <section className="sa-card">
          <header className="sa-card-head"><h2>کالاها</h2><small className="num">{fa(data.lines.reduce((sum, line) => sum + line.quantity, 0))} عدد</small></header>
          <ul className="sa-lines">{data.lines.map((line, index) => <li key={index}>
            {line.image ? <img src={line.image} alt="" /> : <span className="sa-ph" />}
            <span className="sa-grow">{line.productId ? <Link href={`/admin/store/products/${line.productId}`}><b>{line.name}</b></Link> : <b>{line.name}</b>}{line.variantName && <small>{line.variantName}</small>}<small className="num">{fa(line.quantity)} × <Money value={line.unitPrice} currency={data.currency} /></small></span>
            <Money value={line.total} currency={data.currency} />
            {data.canWork && <LineInputs orderId={data.id} line={line} canErase={data.manager} onErased={(detail) => setData(detail as Detail)} />}
          </li>)}</ul>
          <dl className="sa-totals">
            <div><dt>جمع کالاها</dt><dd><Money value={data.itemsTotal} currency={data.currency} /></dd></div>
            {data.discount > 0 && <div><dt>کد تخفیف {data.discountCode && <span dir="ltr">({data.discountCode})</span>}</dt><dd>−<Money value={data.discount} currency={data.currency} /></dd></div>}
            <div><dt>هزینهٔ ارسال{data.shippingMethod && <small className="sa-sub">{data.shippingMethod.carrierName}{data.shippingMethod.eta && ` · ${data.shippingMethod.eta}`}</small>}</dt><dd>{data.shippingMethod?.collect ? <>پس‌کرایه{data.shipping > 0 && <> + <Money value={data.shipping} currency={data.currency} /></>}</> : data.shipping > 0 ? <Money value={data.shipping} currency={data.currency} /> : 'رایگان'}</dd></div>
            {data.walletApplied > 0 && <div><dt>پرداخت از کیف پول</dt><dd><Money value={data.walletApplied} currency={data.currency} /></dd></div>}
            <div className="is-total"><dt>مبلغ سفارش</dt><dd><Money value={data.total} currency={data.currency} /></dd></div>
          </dl>
        </section>

        {options.length > 0 && <section className="sa-card sa-noprint">
          <header className="sa-card-head"><h2>تغییر وضعیت</h2><small>وضعیت فعلی: {isFulfilmentStatus(data.fulfilment) ? FULFILMENT_LABEL[data.fulfilment] : 'در انتظار ایجاد تحویل'}</small></header>
          <div className="sa-actions" role="radiogroup" aria-label="وضعیت بعدی">{options.map((status) => <button key={status} type="button" role="radio" aria-checked={to === status} className={`sa-action${to === status ? ' is-selected' : ''}${status === 'CANCELLED' || status === 'RETURNED' ? ' is-danger' : ''}`} onClick={() => { setTo(status); if (status === 'DELIVERED' && data.deliveryTemplate && !details.items.length && !details.note) setDetails(draftFromTemplate(data.deliveryTemplate, data.lines.find((line) => line.kind !== 'PHYSICAL')?.variantName || '')) }}>{ACTION_LABEL[status]}</button>)}</div>
          {to && <div className="sa-form">
            {(to === 'SHIPPED' || to === 'DELIVERED') && !virtual && <label className="sa-field"><span>کد رهگیری مرسوله</span><input className="input" dir="ltr" value={tracking ?? data.trackingCode} onChange={(event) => setTracking(event.target.value)} maxLength={120} /></label>}
            {virtual && to === 'DELIVERED' && <DeliveryDetailsEditor orderId={data.id} value={details} onChange={setDetails} hasPrevious={data.hasDigitalDelivery} />}
            <label className="sa-field"><span>توضیح برای مشتری (اختیاری)</span><textarea className="input" rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label>
            <label className="sa-check"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />اطلاع‌رسانی به مشتری (اعلان، پیامک و پوش)</label>
            {(to === 'CANCELLED' || to === 'RETURNED') && <label className="sa-check"><input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} />بازگرداندن موجودی کالاها به انبار</label>}
            {(to === 'CANCELLED' || to === 'RETURNED') && <Notice>بازگشت وجه جداگانه از صفحهٔ فاکتور (عملیات «بازپرداخت») انجام می‌شود.</Notice>}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void move()}>{busy ? 'در حال ثبت…' : `ثبت «${ACTION_LABEL[to]}»`}</button>
          </div>}
        </section>}
        {data.manager && !virtual && data.orderStatus === 'PAID' && <ShipmentPanel orderId={data.id} method={data.shippingMethod} canIssue={!closed && data.fulfilment !== 'DELIVERED'} onChanged={() => void reload()} />}
        {data.orderStatus === 'PENDING' && <Notice>این سفارش هنوز پرداخت نشده است؛ پس از تأیید پرداخت (از صفحهٔ فاکتور یا رسید کارت‌به‌کارت) وارد صف پردازش می‌شود.</Notice>}

        <section className="sa-card">
          <header className="sa-card-head"><h2>تاریخچه و یادداشت‌ها</h2></header>
          <ol className="sa-timeline">{[...data.events].reverse().map((event) => <li key={event.id} className={event.visible ? '' : 'is-internal'}>
            <b>{EVENT_LABEL[event.status] || event.status}</b>{!event.visible && <span className="sa-tag">داخلی</span>}
            <small>{faDate(event.createdAt, true)}{event.actor && ` · ${event.actor}`}</small>
            {event.note && <p>{event.note}</p>}
          </li>)}</ol>
          <div className="sa-form sa-noprint" hidden={!data.canWork}>
            <label className="sa-field"><span>یادداشت جدید</span><textarea className="input" rows={2} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} /></label>
            <div className="sa-row"><label className="sa-check"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />برای مشتری هم نمایش داده شود</label><button type="button" className="btn btn-ghost" disabled={busy || message.trim().length < 2} onClick={() => void addNote()}>افزودن یادداشت</button></div>
          </div>
        </section>
      </div>

      <aside className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>مشتری{data.customer.id === null ? ' حضوری بدون حساب' : ''}</h2>{data.customer.id !== null && <span className="sa-row"><Link href={`/admin/tickets?new=1&user=${encodeURIComponent(data.customer.email)}&subject=${encodeURIComponent('دربارهٔ سفارش شما')}`} className="sa-link">ارسال تیکت به مشتری</Link><Link href={`/admin/users?q=${encodeURIComponent(data.customer.email)}`} className="sa-link">پروفایل</Link></span>}</header>
          <dl className="sa-kv"><div><dt>نام</dt><dd>{data.customer.name || '—'}</dd></div><div><dt>ایمیل</dt><dd dir="ltr">{data.customer.email}</dd></div>{data.customer.phone && <div><dt>موبایل</dt><dd dir="ltr">{data.customer.phone}</dd></div>}<div><dt>سفارش‌های موفق</dt><dd className="num">{fa(data.customer.paidOrders)}</dd></div><div><dt>مجموع خرید</dt><dd><Money value={data.customer.spent} currency={data.currency} /></dd></div></dl>
        </section>
        {data.address && <section className="sa-card sa-label">
          <header className="sa-card-head"><h2>آدرس ارسال</h2></header>
          <p>{data.address.address}</p>
          <dl className="sa-kv"><div><dt>گیرنده</dt><dd>{data.address.recipient}</dd></div><div><dt>موبایل</dt><dd dir="ltr">{data.address.phone}</dd></div>{data.address.postalCode && <div><dt>کد پستی</dt><dd className="num">{data.address.postalCode}</dd></div>}</dl>
          {data.address.lat !== null && data.address.lng !== null && <p className="sa-hint"><a className="sa-link" href={`https://www.openstreetmap.org/?mlat=${data.address.lat}&mlon=${data.address.lng}#map=17/${data.address.lat}/${data.address.lng}`} target="_blank" rel="noreferrer">موقعیت روی نقشه ↗</a> · <a className="sa-link" href={`https://www.google.com/maps?q=${data.address.lat},${data.address.lng}`} target="_blank" rel="noreferrer">گوگل‌مپ</a> · <a className="sa-link" href={`https://neshan.org/maps/@${data.address.lat},${data.address.lng},17z`} target="_blank" rel="noreferrer">نشان</a></p>}
        </section>}
        {data.schedule && <section className="sa-card"><header className="sa-card-head"><h2>زمان ارسال</h2></header><p>{faDay(data.schedule.date)}{data.schedule.slot && ` · ساعت ${data.schedule.slot}`}</p></section>}
        {data.trackingCode && <section className="sa-card"><header className="sa-card-head"><h2>کد رهگیری</h2></header><p dir="ltr" className="num">{data.trackingCode}</p></section>}
        <section className="sa-card">
          <header className="sa-card-head"><h2>پرداخت</h2></header>
          <dl className="sa-kv"><div><dt>تاریخ ثبت</dt><dd>{faDate(data.createdAt, true)}</dd></div><div><dt>روش</dt><dd>{data.gateway}</dd></div>{data.invoiceNumber && <div><dt>فاکتور</dt><dd className="num">{data.invoiceNumber} · {data.invoiceStatus}</dd></div>}</dl>
          {data.payments.length > 0 && <ul className="sa-payments">{data.payments.map((payment) => <li key={payment.id}><span>{payment.provider} · {payment.status}</span><Money value={payment.amount} currency={data.currency} /></li>)}</ul>}
        </section>
      </aside>
    </div>
  </StoreShell>
}
