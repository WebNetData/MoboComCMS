'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { Notice, fa, faDate, send } from '../../shared'

type Shipment = {
  id: number; waybill: string; carrier: string; carrierName: string; trackingCode: string; trackingUrl: string; status: string; statusLabel: string; next: string[]
  weightGrams: number; parcels: number; fee: number; cost: number; currency: string; note: string; createdAt: string
  events: { id: number; status: string; label: string; note: string; location: string; createdAt: string }[]
}
type CarrierRow = { id: string; name: string; enabled: boolean }

const NEXT_LABEL: Record<string, string> = { PICKED_UP: 'تحویل مرسوله‌رسان شد', IN_TRANSIT: 'در مسیر', OUT_FOR_DELIVERY: 'در حال توزیع', DELIVERED: 'تحویل گیرنده شد', RETURNED: 'برگشت خورد', CANCELLED: 'ابطال بارنامه' }

/** Waybill on the order page: issue it, add the carrier's tracking code, follow the parcel, print the label. */
export default function ShipmentPanel({ orderId, method, canIssue, onChanged }: { orderId: number; method: { carrierId: string; carrierName: string; eta: string; weightGrams: number; collect?: boolean } | null; canIssue: boolean; onChanged: () => void }) {
  const [shipment, setShipment] = useState<Shipment | null | undefined>(undefined)
  const [carriers, setCarriers] = useState<CarrierRow[]>([])
  const [form, setForm] = useState({ carrier: method?.carrierId || '', trackingCode: '', weightGrams: method?.weightGrams ? String(method.weightGrams) : '', parcels: '1', costRial: '', note: '' })
  const [code, setCode] = useState('')
  const [stepNote, setStepNote] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch(`/api/admin/shipping/shipments/${orderId}?order=1`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => { setShipment(data); setCode(data?.trackingCode || '') }).catch(() => setShipment(null))
    fetch('/api/admin/shipping/carriers', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      const list: CarrierRow[] = data?.settings?.carriers || []
      setCarriers(list)
      setForm((current) => current.carrier ? current : { ...current, carrier: list.find((item) => item.enabled)?.id || list[0]?.id || '' })
    }).catch(() => null)
  }, [orderId])

  async function issue() {
    setBusy(true); setNotice(null)
    const result = await send<Shipment>('/api/admin/shipping/shipments', 'POST', { orderId, ...form })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setShipment(result.data); setCode(result.data.trackingCode)
    setNotice({ tone: 'ok', text: `بارنامه ${result.data.waybill} صادر شد.` }); onChanged()
  }

  async function update(patch: Record<string, unknown>, done: string) {
    if (!shipment) return
    setBusy(true); setNotice(null)
    const result = await send<Shipment>(`/api/admin/shipping/shipments/${shipment.id}`, 'PATCH', { ...patch, note: stepNote || undefined, location: location || undefined })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setShipment(result.data); setStepNote(''); setLocation('')
    setNotice({ tone: 'ok', text: done }); onChanged()
  }

  if (shipment === undefined) return <section className="sa-card sa-noprint"><div className="sa-skeleton" /></section>

  if (!shipment) {
    if (!canIssue) return null
    return <section className="sa-card sa-form sa-noprint">
      <header className="sa-card-head"><h2>صدور بارنامه</h2>{method && <small>انتخاب مشتری: {method.carrierName}{method.eta && ` · ${method.eta}`}{method.collect && ' · پس‌کرایه (کرایه با گیرنده)'}</small>}</header>
      <div className="sa-grid">
        <label className="sa-field"><span>شرکت حمل</span><select className="select" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })}>{carriers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.enabled ? '' : ' (غیرفعال در سایت)'}</option>)}</select></label>
        <label className="sa-field"><span>کد رهگیری شرکت حمل (اختیاری)</span><input className="input" dir="ltr" value={form.trackingCode} onChange={(e) => setForm({ ...form, trackingCode: e.target.value })} placeholder="بعداً هم می‌توانید وارد کنید" /></label>
        <label className="sa-field"><span>وزن (گرم)</span><input className="input num" inputMode="numeric" dir="ltr" value={form.weightGrams} onChange={(e) => setForm({ ...form, weightGrams: e.target.value.replace(/\D/g, '') })} placeholder="خودکار از وزن کالاها" /></label>
        <label className="sa-field"><span>تعداد بسته</span><input className="input num" inputMode="numeric" dir="ltr" value={form.parcels} onChange={(e) => setForm({ ...form, parcels: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="sa-field"><span>هزینهٔ واقعی ارسال (ریال، اختیاری)</span><input className="input num" inputMode="numeric" dir="ltr" value={form.costRial} onChange={(e) => setForm({ ...form, costRial: e.target.value.replace(/\D/g, '') })} /></label>
      </div>
      <label className="sa-field"><span>توضیح داخلی</span><input className="input" value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <p className="sa-hint">با صدور بارنامه، شمارهٔ بارنامه (قابل رهگیری در سایت) خودکار ساخته می‌شود، سفارش به «بسته‌بندی شد» می‌رود و برچسب پستی آمادهٔ چاپ است.</p>
      <button type="button" className="btn btn-primary" disabled={busy || !form.carrier} onClick={() => void issue()}>{busy ? 'در حال صدور…' : 'صدور بارنامه'}</button>
    </section>
  }

  return <section className="sa-card sa-form sh-shipment">
    <header className="sa-card-head"><h2>بارنامه <span className="num" dir="ltr">{shipment.waybill}</span></h2><span className="sa-state is-info">{shipment.statusLabel}</span></header>
    <dl className="sa-kv">
      <div><dt>شرکت حمل</dt><dd>{shipment.carrierName}</dd></div>
      <div><dt>وزن</dt><dd className="num">{fa(shipment.weightGrams)} گرم · {fa(shipment.parcels)} بسته</dd></div>
      <div><dt>کد رهگیری</dt><dd dir="ltr">{shipment.trackingCode ? (shipment.trackingUrl ? <a className="sa-link" href={shipment.trackingUrl} target="_blank" rel="noreferrer">{shipment.trackingCode} ↗</a> : shipment.trackingCode) : '—'}</dd></div>
      <div><dt>رهگیری در سایت</dt><dd><a className="sa-link" href={`/track/${shipment.waybill}`} target="_blank" rel="noreferrer">/track/{shipment.waybill}</a></dd></div>
    </dl>
    <div className="sa-row sa-noprint">
      <a href={`/admin/store/shipments/labels?ids=${shipment.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost">چاپ برچسب پستی</a>
      <Link href="/admin/store/shipments" className="btn btn-ghost">همهٔ مرسوله‌ها</Link>
    </div>
    {shipment.status !== 'CANCELLED' && <div className="sa-noprint sa-form">
      <div className="sa-row">
        <label className="sa-field sa-grow"><span>کد رهگیری {shipment.carrierName}</span><input className="input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button type="button" className="btn btn-ghost" disabled={busy || code.trim() === shipment.trackingCode} onClick={() => void update({ trackingCode: code }, 'کد رهگیری ثبت شد و برای مشتری ارسال شد.')}>ثبت کد</button>
      </div>
      {shipment.next.length > 0 && <>
        <div className="sa-grid">
          <label className="sa-field"><span>توضیح مرحله (اختیاری)</span><input className="input" value={stepNote} maxLength={500} onChange={(e) => setStepNote(e.target.value)} /></label>
          <label className="sa-field"><span>محل (اختیاری)</span><input className="input" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} placeholder="مثلاً مرکز مبادلهٔ تهران" /></label>
        </div>
        <div className="sa-actions">{shipment.next.map((status) => <button key={status} type="button" className={`sa-action${status === 'CANCELLED' || status === 'RETURNED' ? ' is-danger' : ''}`} disabled={busy} onClick={() => { if ((status === 'CANCELLED' || status === 'RETURNED') && !window.confirm(`«${NEXT_LABEL[status]}» ثبت شود؟`)) return; void update({ status }, `وضعیت مرسوله: ${NEXT_LABEL[status]}`) }}>{NEXT_LABEL[status] || status}</button>)}</div>
      </>}
    </div>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <ol className="sa-timeline">{[...shipment.events].reverse().map((event) => <li key={event.id}><b>{event.label}</b><small>{faDate(event.createdAt, true)}{event.location && ` · ${event.location}`}</small>{event.note && <p>{event.note}</p>}</li>)}</ol>
  </section>
}
