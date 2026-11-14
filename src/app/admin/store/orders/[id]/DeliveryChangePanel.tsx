'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatMoney } from '@/shared/money'

type Address = { recipient: string; phone: string; province: string; city: string; address: string; plaque: string; unit: string; postalCode: string }
type Change = { id: number; status: string; oldAddress: Address; newAddress: Address; fromFeeMinor: string; newFeeMinor: string; currency: string; reason: string; reviewNote: string | null; updatedAt: string }
type State = { changes: Change[]; manager: boolean }
const money = (value: string | bigint, currency: string) => formatMoney(BigInt(value), currency, 'fa-IR')
const statusLabel: Record<string, string> = { REQUESTED: 'در انتظار بررسی', APPROVED: 'تأیید شد', REJECTED: 'رد شد', WITHDRAWN: 'پس گرفته شد' }
const addressText = (address: Address) => [address.recipient, address.phone, address.province, address.city, address.address, address.plaque && `پلاک ${address.plaque}`, address.unit && `واحد ${address.unit}`, address.postalCode].filter(Boolean).join('، ')

/** Manager review surface. Money records stay fixed; any quote difference is absorbed by the Store. */
export default function DeliveryChangePanel({ orderId }: { orderId: number }) {
  const [state, setState] = useState<State | null>(null)
  const [ack, setAck] = useState<Record<number, boolean>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadEpoch = useRef(0)
  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current
    setError('')
    try {
      const response = await fetch(`/api/admin/store/orders/${orderId}/delivery-changes`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(data?.error || 'درخواست‌های تغییر نشانی دریافت نشد'))
      if (epoch !== loadEpoch.current) return
      setState(data as State)
    } catch (cause) { if (epoch === loadEpoch.current) setError(cause instanceof Error ? cause.message : 'ارتباط برقرار نشد') }
  }, [orderId])
  useEffect(() => { void load(); return () => { loadEpoch.current++ } }, [load])

  async function decide(change: Change, action: 'approve' | 'reject') {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/store/orders/${orderId}/delivery-changes`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changeId: change.id, expectedChangeUpdatedAt: change.updatedAt, action, acknowledgeFeeDifference: ack[change.id] === true, note: notes[change.id] || '' }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(data?.error || 'تصمیم ثبت نشد؛ اطلاعات را تازه کنید'))
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ارتباط برقرار نشد') }
    finally { setBusy(false) }
  }

  return <section className="sa-card sa-noprint" aria-labelledby={`delivery-change-admin-${orderId}`} dir="rtl">
    <header className="sa-card-head"><h2 id={`delivery-change-admin-${orderId}`}>درخواست‌های تغییر نشانی</h2><button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={busy}>به‌روزرسانی</button></header>
    {error && <p role="alert">{error}</p>}
    {!state && !error && <p role="status">در حال بارگذاری…</p>}
    {state?.changes.map(change => {
      const delta = BigInt(change.newFeeMinor) - BigInt(change.fromFeeMinor)
      return <article key={change.id} className="sa-form">
        <strong>{statusLabel[change.status] || change.status}</strong>
        <dl className="sa-kv"><div><dt>نشانی فعلی</dt><dd>{addressText(change.oldAddress)}</dd></div><div><dt>نشانی درخواستی</dt><dd>{addressText(change.newAddress)}</dd></div>
          <div><dt>هزینهٔ ثبت‌شدهٔ ارسال</dt><dd>{money(change.fromFeeMinor, change.currency)}</dd></div><div><dt>برآورد ارسال به نشانی جدید</dt><dd>{money(change.newFeeMinor, change.currency)}</dd></div>
          <div><dt>اختلاف بر عهدهٔ فروشگاه</dt><dd>{delta > 0n ? '+' : ''}{money(delta, change.currency)}</dd></div></dl>
        {change.reason && <p>توضیح مشتری: {change.reason}</p>}
        {change.reviewNote && <p>یادداشت بررسی: {change.reviewNote}</p>}
        {change.status === 'REQUESTED' && state.manager && <>
          {delta !== 0n && <label className="sa-check"><input type="checkbox" checked={ack[change.id] === true} onChange={event => setAck(current => ({ ...current, [change.id]: event.target.checked }))} /> اختلاف هزینه را فروشگاه می‌پذیرد؛ مبلغ فاکتور مشتری ثابت می‌ماند.</label>}
          <label className="sa-field"><span>یادداشت (اختیاری)</span><textarea className="input" rows={2} maxLength={500} value={notes[change.id] || ''} onChange={event => setNotes(current => ({ ...current, [change.id]: event.target.value }))} /></label>
          <div className="sa-row"><button className="btn btn-primary" type="button" disabled={busy || (delta !== 0n && ack[change.id] !== true)} onClick={() => void decide(change, 'approve')}>تأیید و اعمال نشانی</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void decide(change, 'reject')}>رد درخواست</button></div>
        </>}
      </article>
    })}
    {state && !state.changes.length && <p>درخواست تغییری ثبت نشده است.</p>}
  </section>
}
