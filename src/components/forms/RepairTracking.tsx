'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useHumanCheck } from '@/components/HumanCheck'

type TrackingView = { number: number; title: string; stage: string; stageLabel: string; createdAt: string; receivedAt: string | null; reply: string; steps: { key: string; label: string; current: boolean }[] }
type Response = { request?: TrackingView; message?: string; expiresIn?: number; resendIn?: number; error?: string; code?: string }
type Method = 'manual' | 'phone'

const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' })
const date = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : formatter.format(parsed)
}

export default function RepairTracking() {
  const [method, setMethod] = useState<Method>('manual')
  const [trackingCode, setTrackingCode] = useState('')
  const [number, setNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<TrackingView | null>(null)
  const busyRef = useRef(false)
  const resultRef = useRef<HTMLElement>(null)
  const human = useHumanCheck('entry')

  useEffect(() => {
    if (!verifying) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [verifying])
  useEffect(() => { if (result) resultRef.current?.focus() }, [result])

  const reset = () => { setCode(''); setVerifying(false); setResult(null); setError(''); setMessage(''); setResendAt(0); setExpiresAt(0); human.reset() }
  const changeMethod = (next: Method) => { if (busyRef.current || next === method) return; reset(); setMethod(next) }
  const send = async (action: 'lookup' | 'request-code' | 'verify-code') => {
    if (busyRef.current || !human.ready) return
    busyRef.current = true; setBusy(true); setError(''); setMessage(''); setResult(null)
    try {
      const payload = action === 'lookup' ? { action, trackingCode, humanCheck: human.token } : action === 'request-code' ? { action, number, phone, humanCheck: human.token } : { action, number, phone, code, humanCheck: human.token }
      const response = await fetch('/api/repair-tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' })
      const data: Response = await response.json()
      if (!response.ok) { setError(data.error || 'امکان پیگیری در حال حاضر وجود ندارد. دوباره تلاش کنید.'); return }
      if (action === 'request-code') {
        const current = Date.now(); setNow(current); setResendAt(current + (data.resendIn ?? 60) * 1000); setExpiresAt(current + (data.expiresIn ?? 120) * 1000)
        setVerifying(true); setCode(''); setMessage(data.message || 'اگر اطلاعات با رسید مطابقت داشته باشد، کد به شماره همراه ارسال می‌شود.')
      } else if (data.request) { setResult(data.request); setCode('') }
      else setError('امکان نمایش وضعیت وجود ندارد. دوباره تلاش کنید.')
    } catch { setError('ارتباط برقرار نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید.') }
    finally { human.reset(); busyRef.current = false; setBusy(false) }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void send(method === 'manual' ? 'lookup' : verifying ? 'verify-code' : 'request-code') }
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const expiry = Math.max(0, Math.ceil((expiresAt - now) / 1000))

  return <div className="repair-tracking__card">
    <div className="repair-tracking__methods" role="group" aria-label="روش پیگیری">
      <button type="button" aria-pressed={method === 'manual'} disabled={busy} onClick={() => changeMethod('manual')}>کد پیگیری رسید</button>
      <button type="button" aria-pressed={method === 'phone'} disabled={busy} onClick={() => changeMethod('phone')}>شماره همراه</button>
    </div>
    <form onSubmit={submit} aria-busy={busy}>
      {method === 'manual' ? <div className="repair-tracking__field"><label htmlFor="tracking-code">کد پیگیری روی رسید</label><p id="tracking-help">کد پیگیری بلند درج‌شده روی نسخهٔ مشتری را وارد کنید.</p><input id="tracking-code" dir="ltr" maxLength={80} disabled={busy} value={trackingCode} onChange={event => { setTrackingCode(event.target.value); setResult(null) }} autoComplete="off" required aria-describedby="tracking-help" /></div> : <>
        <div className="repair-tracking__field"><label htmlFor="receipt-number">شمارهٔ پذیرش</label><input id="receipt-number" dir="ltr" maxLength={10} disabled={busy} inputMode="numeric" value={number} onChange={event => setNumber(event.target.value)} readOnly={verifying} required /></div>
        <div className="repair-tracking__field"><label htmlFor="receipt-phone">شماره همراه روی رسید</label><p id="phone-help">شماره‌ای را وارد کنید که هنگام پذیرش ثبت شده است.</p><input id="receipt-phone" dir="ltr" maxLength={20} disabled={busy} type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} readOnly={verifying} required aria-describedby="phone-help" /></div>
        {verifying && <><button type="button" className="repair-tracking__link" disabled={busy} onClick={reset}>ویرایش شماره پذیرش یا همراه</button><div className="repair-tracking__field"><label htmlFor="verification-code">کد پیامکی</label><input id="verification-code" dir="ltr" maxLength={6} disabled={busy} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} required /> <p>اعتبار کد: {expiry.toLocaleString('fa-IR')} ثانیه</p></div></>}
      </>}
      {human.widget}
      {error && <p className="repair-tracking__error" role="alert">{error}</p>}
      {message && <p className="repair-tracking__message" role="status">{message}</p>}
      <button className="repair-tracking__submit" type="submit" disabled={busy || !human.ready}>{busy ? 'در حال بررسی…' : method === 'manual' ? 'مشاهده وضعیت' : verifying ? 'تأیید و مشاهده وضعیت' : 'دریافت کد پیامکی'}</button>
      {verifying && <button type="button" className="repair-tracking__link" disabled={busy || seconds > 0 || !human.ready} onClick={() => void send('request-code')}>{seconds > 0 ? `ارسال دوباره تا ${seconds.toLocaleString('fa-IR')} ثانیه دیگر` : 'ارسال دوباره کد'}</button>}
    </form>
    {result && <section className="repair-tracking__result" tabIndex={-1} ref={resultRef} aria-labelledby="repair-result-title">
      <p>شمارهٔ پذیرش {result.number.toLocaleString('fa-IR')}</p><h2 id="repair-result-title">{result.title}</h2><p>وضعیت فعلی: <strong>{result.stageLabel}</strong></p>
      {(result.receivedAt || result.createdAt) && <p>تاریخ پذیرش: {date(result.receivedAt || result.createdAt)}</p>}
      {result.steps.length > 0 && <ol className="repair-tracking__steps">{result.steps.map(step => <li key={step.key} className={step.current ? 'is-current' : ''} aria-current={step.current ? 'step' : undefined}>{step.label}{step.current && <span> — وضعیت فعلی</span>}</li>)}</ol>}
      {result.reply && <div className="repair-tracking__reply"><h3>پیام مجموعه</h3><p dir="auto">{result.reply}</p></div>}
    </section>}
  </div>
}
