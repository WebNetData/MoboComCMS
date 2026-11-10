'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import OtpCodeInput from '@/components/OtpCodeInput'

type Props = {
  /** The member's current mobile in 09… form ('' when none). */
  phone: string
  verified: boolean
  required: boolean
  label: string
  help: string
  error?: string
  onVerified: () => void
}

type Stage = 'enter' | 'code' | 'done'

const fa = (value: number) => value.toLocaleString('fa-IR')
const clock = (seconds: number) => `${fa(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0').replace(/\d/g, (d) => fa(Number(d)))}`

/**
 * «تأیید شمارهٔ موبایل» on the completion page: number → SMS code → verified.
 * Codes go through the existing /api/me/phone endpoint, which owns rate limits, uniqueness and expiry.
 */
export default function PhoneStep({ phone: initialPhone, verified, required, label, help, error, onVerified }: Props) {
  const [stage, setStage] = useState<Stage>(verified ? 'done' : 'enter')
  const [phone, setPhone] = useState(initialPhone)
  const [display, setDisplay] = useState('')
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [shake, setShake] = useState(0)
  const verifying = useRef(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function call(method: 'POST' | 'PUT', body: Record<string, string>) {
    const response = await fetch('/api/me/phone', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    return { ok: !!response?.ok, data }
  }

  async function send() {
    if (busy) return
    setBusy(true); setProblem('')
    const { ok, data } = await call('POST', { phone })
    setBusy(false)
    if (!ok) { setProblem(data?.error || 'ارسال کد انجام نشد؛ دوباره تلاش کنید.'); return }
    setDisplay(data.display || phone); setCode(''); setResendIn(Number(data.resendIn) || 60); setStage('code')
  }

  const verify = useCallback(async (value: string) => {
    if (verifying.current || value.length < 6) return
    verifying.current = true
    setBusy(true); setProblem('')
    const { ok, data } = await call('PUT', { phone, code: value })
    setBusy(false); verifying.current = false
    if (!ok) { setProblem(data?.error || 'کد درست نیست.'); setCode(''); setShake((n) => n + 1); return }
    setDisplay(data.display || display); setStage('done'); onVerified()
  }, [phone, display, onVerified])

  // Android Chrome can read the code straight from the SMS when the message carries the site's domain.
  useEffect(() => {
    if (stage !== 'code' || typeof window === 'undefined' || !('OTPCredential' in window)) return
    const controller = new AbortController()
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: controller.signal } as CredentialRequestOptions)
      .then((credential) => { const received = (credential as unknown as { code?: string } | null)?.code; if (received) { setCode(received); void verify(received) } })
      .catch(() => undefined)
    return () => controller.abort()
  }, [stage, verify])

  const shown = display || initialPhone
  // This step lives inside the completion form: Enter acts here instead of submitting the whole page.
  const onEnter = (action: () => void) => (event: KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); action() } }
  return <section className={`wl-section wl-phone is-${stage}${problem || (error && stage === 'enter') ? ' has-error' : ''}`} aria-labelledby="wl-phone-title">
    <div className="wl-phone-card">
      <span className="wl-phone-icon" aria-hidden="true">
        {stage === 'done'
          ? <svg viewBox="0 0 24 24" width="26" height="26"><path className="wl-phone-check" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>}
      </span>
      <div className="wl-phone-body">
        <h2 id="wl-phone-title">{label} {stage !== 'done' && (required ? <b className="wl-req" aria-hidden="true">*</b> : <small className="wl-opt">(اختیاری)</small>)}</h2>

        {stage === 'enter' && <>
          <p className="wl-help">{help || 'یک کد ۶ رقمی به این شماره پیامک می‌شود.'}</p>
          <div className="wl-phone-row" onKeyDown={onEnter(() => { if (phone.trim().length >= 10) void send() })}>
            <label className="sr-only" htmlFor="wl-phone">شمارهٔ موبایل</label>
            <span className="wl-phone-input">
              <input id="wl-phone" className="input" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" maxLength={16} placeholder="0912 123 4567" value={phone}
                aria-invalid={!!(problem || error)} aria-describedby={problem || error ? 'wl-phone-error' : undefined}
                onChange={(event) => { setPhone(event.target.value); setProblem('') }} />
            </span>
            <button type="button" className="btn btn-primary" disabled={busy || phone.trim().length < 10} onClick={() => void send()}>{busy ? 'در حال ارسال…' : 'ارسال کد تأیید'}</button>
          </div>
        </>}

        {stage === 'code' && <div className="wl-phone-code" onKeyDown={onEnter(() => void verify(code))}>
          <p className="wl-help">کد ۶ رقمی ارسال‌شده به <bdi dir="ltr" className="wl-phone-number">{shown}</bdi> را وارد کنید. <button type="button" className="wl-link" onClick={() => { setStage('enter'); setProblem('') }}>تغییر شماره</button></p>
          <div key={shake} className={shake ? 'wl-shake' : undefined}>
            <OtpCodeInput value={code} onChange={(value) => { setCode(value); setProblem('') }} onComplete={(value) => void verify(value)} disabled={busy} invalid={!!problem} label={`کد ارسال‌شده به ${shown}`} autoFocus />
          </div>
          <div className="wl-phone-actions">
            <button type="button" className="btn btn-primary" disabled={busy || code.length < 6} onClick={() => void verify(code)}>{busy ? 'در حال بررسی…' : 'تأیید شماره'}</button>
            {resendIn > 0
              ? <span className="wl-resend" aria-live="off"><span className="wl-resend-ring" style={{ ['--left' as string]: `${Math.min(100, resendIn / 60 * 100)}%` }} aria-hidden="true" />ارسال دوباره تا <bdi dir="ltr">{clock(resendIn)}</bdi></span>
              : <button type="button" className="wl-link" disabled={busy} onClick={() => void send()}>کد را دریافت نکردید؟ ارسال دوباره</button>}
          </div>
        </div>}

        {stage === 'done' && <p className="wl-phone-done" role="status">شمارهٔ <bdi dir="ltr" className="wl-phone-number">{shown}</bdi> تأیید شد.</p>}

        {/* The page's own save error belongs to the first step only; once a code is on its way, this step reports for itself. */}
        {(problem || (error && stage === 'enter')) && <small id="wl-phone-error" className="wl-error" role="alert">{problem || error}</small>}
      </div>
    </div>
  </section>
}
