'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useHumanCheck } from '@/components/HumanCheck'
import type { RepairDecision, CustomerRepairWorkView } from '@/modules/forms/domain/repair-work'
import type { TrackingView } from './RepairTracking'

const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const when = (value: string) => formatter.format(new Date(value))
const labels = { PENDING: 'در انتظار پاسخ', APPROVED: 'تأیید شده', REJECTED: 'رد شده' }

export default function RepairApproval({ number, repair, onUpdated }: { number: number; repair: CustomerRepairWorkView; onUpdated: (request: TrackingView) => void }) {
  const [phone, setPhone] = useState('')
  const [decision, setDecision] = useState<RepairDecision | ''>('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const busyRef = useRef(false)
  const human = useHumanCheck('entry')
  const estimate = repair.estimate
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const expiry = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const expired = !!estimate && new Date(estimate.expiresAt).getTime() <= (now || Date.now())
  const reset = () => { setSent(false); setCode(''); setError(''); setMessage(''); human.reset() }
  async function send(action: 'request-decision-code' | 'decide-estimate') {
    if (!estimate || !decision || !phone.trim() || busyRef.current || !human.ready) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/repair-tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ action, number, phone, estimateId: estimate.id, decision, humanCheck: human.token, ...(action === 'decide-estimate' ? { code } : {}) }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'انجام درخواست ممکن نشد. دوباره تلاش کنید.'); return }
      if (action === 'request-decision-code') { const current = Date.now(); setNow(current); setResendAt(current + (data.resendIn ?? 60) * 1000); setExpiresAt(current + (data.expiresIn ?? 120) * 1000); setSent(true); setCode(''); setMessage(data.message || 'اگر اطلاعات با رسید مطابقت داشته باشد، کد ارسال می‌شود.') }
      else if (data.request) { setCode(''); setSent(false); onUpdated(data.request); setMessage('پاسخ شما ثبت شد.') }
      else setError('نمایش نتیجه ممکن نشد؛ دوباره پیگیری کنید.')
    } catch { setError('ارتباط برقرار نشد. دوباره تلاش کنید.') }
    finally { human.reset(); busyRef.current = false; setBusy(false) }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void send(sent ? 'decide-estimate' : 'request-decision-code') }
  return <section className="repair-approval" aria-labelledby="repair-approval-title">
    <h3 id="repair-approval-title">برنامه و برآورد تعمیر</h3>
    <p>موعد تعمیر: {repair.dueAt ? when(repair.dueAt) : 'ثبت نشده'}{repair.overdue && ' — گذشته از موعد'}</p>
    {estimate && <div className="repair-approval__estimate"><p><strong>مبلغ: {BigInt(estimate.amountMinor).toLocaleString('fa-IR')} تومان</strong></p><p dir="auto">{estimate.description}</p><p>وضعیت: {labels[estimate.status]} · اعتبار تا {when(estimate.expiresAt)}</p><p>این برآورد فاکتور نیست.</p></div>}
    {estimate?.status === 'PENDING' && !expired && <form onSubmit={submit} aria-busy={busy}>
      <div className="repair-tracking__field"><label htmlFor="approval-phone">شماره همراه فعلی روی رسید</label><p id="approval-phone-help">برای ثبت پاسخ، شماره همراه ثبت‌شده هنگام پذیرش را وارد کنید.</p><input id="approval-phone" type="tel" dir="ltr" autoComplete="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} readOnly={sent} disabled={busy} required aria-describedby="approval-phone-help" /></div>
      <fieldset disabled={busy || sent}><legend>پاسخ به همین برآورد</legend><label><input type="radio" name="repair-decision" value="APPROVED" checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} required /> تأیید برآورد</label><label><input type="radio" name="repair-decision" value="REJECTED" checked={decision === 'REJECTED'} onChange={() => setDecision('REJECTED')} /> رد برآورد</label></fieldset>
      {decision && <p>پاسخ انتخابی: <strong>{decision === 'APPROVED' ? 'تأیید' : 'رد'}</strong> مبلغ {BigInt(estimate.amountMinor).toLocaleString('fa-IR')} تومان برای «{estimate.description}»</p>}
      {sent && <><button type="button" className="repair-tracking__link" disabled={busy} onClick={reset}>ویرایش شماره یا پاسخ</button><div className="repair-tracking__field"><label htmlFor="approval-code">کد پیامکی تأیید پاسخ</label><input id="approval-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} disabled={busy} required /><p>اعتبار کد: {expiry.toLocaleString('fa-IR')} ثانیه</p></div></>}
      {human.widget}{error && <p className="repair-tracking__error" role="alert">{error}</p>}{message && <p className="repair-tracking__message" role="status">{message}</p>}
      <button className="repair-tracking__submit" type="submit" disabled={busy || !human.ready || (sent && expiry === 0)}>{busy ? 'در حال بررسی…' : sent ? 'ثبت پاسخ' : 'دریافت کد پاسخ'}</button>
      {sent && <button type="button" className="repair-tracking__link" disabled={busy || seconds > 0 || !human.ready} onClick={() => void send('request-decision-code')}>{seconds ? `ارسال دوباره تا ${seconds.toLocaleString('fa-IR')} ثانیه دیگر` : 'ارسال دوباره کد'}</button>}
    </form>}
    {estimate?.status === 'PENDING' && expired && <p>مهلت پاسخ به این برآورد پایان یافته است.</p>}
    {message && estimate?.status !== 'PENDING' && <p role="status">{message}</p>}
    <h3>رویدادهای تعمیر</h3>{repair.history.length ? <ol className="repair-approval__history">{repair.history.map(event => <li key={event.id}><strong>{event.label}</strong> — {when(event.createdAt)}{event.detail && <p dir="auto">{event.detail}</p>}</li>)}</ol> : <p>رویدادی ثبت نشده است.</p>}{repair.historyTruncated && <p>فقط آخرین رویدادها نمایش داده می‌شوند.</p>}
  </section>
}
