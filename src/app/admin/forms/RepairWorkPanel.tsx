'use client'

import { useEffect, useState } from 'react'
import type { RepairWorkView } from '@/modules/forms/domain/repair-work'
import { latinDigits } from '@/shared/text/digits'
import { dateTimeLocal } from './shared'
import './repair-work.css'

const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const when = (value: string) => formatter.format(new Date(value))
const status = { PENDING: 'در انتظار پاسخ', APPROVED: 'تأیید شده', REJECTED: 'رد شده' }

export default function RepairWorkPanel({ id }: { id: number }) {
  return <RepairWorkPanelForSubmission key={id} id={id} />
}

function RepairWorkPanelForSubmission({ id }: { id: number }) {
  const [view, setView] = useState<RepairWorkView | null>(null)
  const [due, setDue] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')

  async function load(preserveDraft = false, signal?: AbortSignal) {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/forms/repair?id=${id}`, { cache: 'no-store', signal })
      const data = await response.json()
      if (signal?.aborted) return
      if (!response.ok) { setError(data.error || 'دریافت اطلاعات تعمیر انجام نشد'); return }
      setView(data); if (!preserveDraft) setDue(dateTimeLocal(data.dueAt || ''))
      setConflict(false)
    } catch { if (!signal?.aborted) setError('ارتباط با سرور برقرار نشد') } finally { if (!signal?.aborted) setBusy(false) }
  }
  useEffect(() => { const controller = new AbortController(); void load(false, controller.signal); return () => controller.abort() }, [id])

  async function save(patch: { dueAt?: string | null; estimate?: { amount: string; description: string } }) {
    if (!view || busy || conflict) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/forms/repair', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, revision: view.revision, ...patch }), cache: 'no-store' })
      const data = await response.json()
      if (response.status === 409) { setConflict(true); setError('اطلاعات تغییر کرده است. برای ادامه آخرین وضعیت را دریافت کنید؛ متن‌های واردشده حفظ می‌شوند.'); return }
      if (!response.ok) { setError(data.error || 'ذخیره انجام نشد'); return }
      setView(data); if (patch.estimate) { setAmount(''); setDescription('') }; setNotice('ذخیره شد')
    } catch { setError('ارتباط با سرور برقرار نشد') } finally { setBusy(false) }
  }
  return <section className="repair-work" aria-busy={busy}>
    <h3>برنامه و برآورد تعمیر</h3>
    {view && !conflict && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load(true)}>به‌روزرسانی وضعیت تعمیر</button>}
    {!view && !error && <p>در حال دریافت اطلاعات…</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {(!view || conflict) && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load(conflict)}>دریافت آخرین وضعیت</button>}
    {view && <>
      <p>موعد فعلی: {view.dueAt ? when(view.dueAt) : 'ثبت نشده'} {view.overdue && '— گذشته از موعد'}</p>
      {view.estimate && <div><b>برآورد فعلی: {BigInt(view.estimate.amountMinor).toLocaleString('fa-IR')} تومان — {status[view.estimate.status]}</b><p dir="auto">{view.estimate.description}</p><p>اعتبار تا {when(view.estimate.expiresAt)}</p></div>}
      {view.canEdit ? <>
        <label className="sa-field"><span>موعد تعمیر (زمان محلی دستگاه شما)</span><input className="input" type="datetime-local" disabled={busy} value={due} onChange={e => setDue(e.target.value)} /></label>
        <button type="button" className="btn btn-ghost" disabled={busy || conflict} onClick={() => { const d = due ? new Date(due) : null; if (d && Number.isNaN(d.getTime())) { setError('موعد معتبر نیست'); return }; void save({ dueAt: d?.toISOString() ?? null }) }}>ذخیره موعد</button>
        <label className="sa-field"><span>مبلغ برآورد (تومان، عدد صحیح)</span><input className="input" dir="ltr" inputMode="numeric" maxLength={12} disabled={busy} value={amount} onChange={e => setAmount(latinDigits(e.target.value))} /></label>
        <div className="sa-field"><label htmlFor={`repair-estimate-description-${id}`}>شرح برآورد</label><textarea id={`repair-estimate-description-${id}`} className="input" rows={3} maxLength={1500} disabled={busy} value={description} onChange={e => setDescription(e.target.value)} /></div>
        <p className="sa-hint">برآورد هفت روز اعتبار دارد. انتشار برآورد جدید رضایت قبلی را بی‌اعتبار می‌کند؛ این برآورد فاکتور نیست.</p>
        <button type="button" className="btn btn-primary" disabled={busy || conflict || !/^[0-9]+$/.test(amount) || !/[1-9]/.test(amount) || !description.trim()} onClick={() => void save({ estimate: { amount, description: description.trim() } })}>انتشار برآورد</button>
      </> : <p className="sa-hint">ویرایش برای مسئول کار یا مدیر ممکن است.</p>}
      <h4>رویدادهای تعمیر</h4>{view.history.length ? <ol>{view.history.map(event => <li key={event.id}><b>{event.label}</b> — {when(event.createdAt)}{event.detail && <p dir="auto">{event.detail}</p>}</li>)}</ol> : <p>رویدادی ثبت نشده است.</p>}{view.historyTruncated && <p>فقط آخرین رویدادها نمایش داده می‌شوند.</p>}
    </>}
  </section>
}
