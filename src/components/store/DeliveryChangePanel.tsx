'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { formatMoney } from '@/shared/money'
import './order-operations.css'

type SavedAddress = { id: number; title: string; recipient: string; province: string; city: string; address: string; postalCode: string; isDefault: boolean }
type Change = { id: number; status: string; reason: string; fromFeeMinor: string; newFeeMinor: string; currency: string; requestedAt: string; updatedAt: string; reviewNote: string | null }
type State = { eligible: boolean; changes: Change[] }

const statusLabel: Record<string, string> = { REQUESTED: 'در انتظار بررسی', APPROVED: 'تأیید شد', REJECTED: 'رد شد', WITHDRAWN: 'پس گرفته شد' }

/** Customer request and history for one of their own, not-yet-dispatched orders. */
export default function DeliveryChangePanel({ orderId }: { orderId: number }) {
  const [state, setState] = useState<State | null>(null)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [addressId, setAddressId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadEpoch = useRef(0)
  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current
    setError('')
    try {
      const [changeResponse, addressResponse] = await Promise.all([
        fetch(`/api/store/orders/${orderId}/delivery-changes`, { cache: 'no-store' }),
        fetch('/api/addresses', { cache: 'no-store' }),
      ])
      const [changeData, addressData] = await Promise.all([changeResponse.json(), addressResponse.json()])
      if (!changeResponse.ok) throw new Error(String(changeData?.error || 'اطلاعات درخواست دریافت نشد'))
      if (!addressResponse.ok) throw new Error(String(addressData?.error || 'فهرست نشانی‌ها دریافت نشد'))
      const saved = Array.isArray(addressData?.addresses) ? addressData.addresses as SavedAddress[] : []
      if (epoch !== loadEpoch.current) return
      setState(changeData as State); setAddresses(saved)
      setAddressId(current => current || String(saved.find(item => item.isDefault)?.id || saved[0]?.id || ''))
    } catch (cause) { if (epoch === loadEpoch.current) setError(cause instanceof Error ? cause.message : 'ارتباط برقرار نشد') }
  }, [orderId])

  useEffect(() => { void load(); return () => { loadEpoch.current++ } }, [load])

  async function submit(method: 'POST' | 'DELETE', body: object) {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/store/orders/${orderId}/delivery-changes`, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(data?.error || 'ثبت تغییر نشانی انجام نشد'))
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ارتباط برقرار نشد') }
    finally { setBusy(false) }
  }

  if (!state && !error) return <section className="sx-panel" aria-busy="true">در حال بارگذاری درخواست تغییر نشانی…</section>
  return <section className="sx-my-card sx-delivery-change" aria-labelledby={`delivery-change-${orderId}`} dir="rtl">
    <h2 id={`delivery-change-${orderId}`}>تغییر نشانی ارسال</h2>
    <p>تا پیش از آماده‌سازی مرسوله می‌توانید نشانی ذخیره‌شده‌ای را درخواست کنید. هزینه سفارش و فاکتور تغییر نمی‌کند؛ فروشگاه اختلاف هزینه ارسال را می‌پذیرد.</p>
    {error && <p role="alert">{error}</p>}
    {state?.eligible && <form onSubmit={event => { event.preventDefault(); if (addressId) void submit('POST', { addressId: Number(addressId), reason }) }}>
      <label htmlFor={`delivery-address-${orderId}`}>نشانی ذخیره‌شده</label>
      <select id={`delivery-address-${orderId}`} className="input" value={addressId} onChange={event => setAddressId(event.target.value)} disabled={busy || addresses.length === 0}>
        <option value="">انتخاب نشانی</option>
        {addresses.map(item => <option key={item.id} value={item.id}>{item.title || item.recipient} — {item.province}، {item.city}، {item.address}</option>)}
      </select>
      {!addresses.length && <p>ابتدا نشانی خود را در <Link href="/dashboard/addresses">دفتر نشانی‌ها</Link> ذخیره کنید.</p>}
      <label htmlFor={`delivery-reason-${orderId}`}>توضیح (اختیاری)</label>
      <textarea id={`delivery-reason-${orderId}`} className="input" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
      <button className="sx-btn is-primary" type="submit" disabled={busy || !addressId}>{busy ? 'در حال ثبت…' : 'ثبت درخواست تغییر نشانی'}</button>
    </form>}
    {state && !state.eligible && !state.changes.some(change => change.status === 'REQUESTED') && <p>برای این سفارش امکان درخواست تغییر نشانی وجود ندارد.</p>}
    {!!state?.changes.length && <ol aria-label="تاریخچه تغییر نشانی">{state.changes.map(change => <li key={change.id}>
      <strong>{statusLabel[change.status] || change.status}</strong>
      {change.reason && <p>{change.reason}</p>}
      <p>هزینهٔ ثبت‌شدهٔ ارسال: {formatMoney(BigInt(change.fromFeeMinor), change.currency, 'fa-IR')} · برآورد نشانی جدید: {formatMoney(BigInt(change.newFeeMinor), change.currency, 'fa-IR')}. مبلغ فاکتور شما ثابت می‌ماند.</p>
      {change.status === 'REQUESTED' && <button className="sx-btn" type="button" disabled={busy} onClick={() => void submit('DELETE', { changeId: change.id })}>پس‌گرفتن درخواست</button>}
      {change.reviewNote && <p>{change.reviewNote}</p>}
    </li>)}</ol>}
  </section>
}
