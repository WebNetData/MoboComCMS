'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import HumanCheck from '@/components/HumanCheck'
import PasswordField from '@/components/PasswordField'
import { latinDigits } from '@/shared/text/digits'

type Methods = { email: boolean; sms: boolean }

/** Forgot password: an emailed link, or an SMS code to the verified mobile and a new password right here. */
export default function ForgotForm({ methods }: { methods: Methods }) {
  const [mode, setMode] = useState<'sms' | 'email'>(methods.sms ? 'sms' : 'email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [sent, setSent] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  // Every sign-in place may ask for the human check; the widget sends 'off' when this one does not.
  const turnstileRequired = true
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileReset, setTurnstileReset] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function request(e?: React.FormEvent) {
    e?.preventDefault()
    if (turnstileRequired && !turnstileToken) { setError('لطفاً اعتبارسنجی امنیتی را کامل کنید.'); return }
    setBusy(true); setError('')
    const response = await fetch('/api/password/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: mode, email, phone, turnstileToken }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false); setTurnstileReset((value) => value + 1)
    if (!response?.ok) { setError(data?.error || 'ارتباط برقرار نشد؛ دوباره تلاش کنید.'); return }
    setSent(data.message); setResendIn(Number(data.resendIn) || 60)
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const response = await fetch('/api/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, password, totp: needsTotp ? totp : undefined }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.status === 428) { setNeedsTotp(true); setError(''); return }
    if (!response?.ok) { setError(data?.error || 'انجام نشد؛ دوباره تلاش کنید.'); return }
    setDone(true)
  }

  const heading = <>
    <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
    <p className="auth-form-eyebrow">بازیابی حساب</p>
    <h1>فراموشی رمز عبور</h1>
  </>

  if (!methods.email && !methods.sms) return <div className="auth-form">
    {heading}
    <p className="auth-form-intro">بازیابی رمز در حال حاضر فعال نیست. لطفاً با پشتیبانی تماس بگیرید.</p>
    <Link href="/login" className="btn btn-primary w-full">بازگشت به ورود</Link>
  </div>

  if (done) return <div className="auth-form" role="status">
    {heading}
    <p className="success-text">رمز عبور شما تغییر کرد و همهٔ نشست‌های قبلی خارج شدند. حالا با رمز تازه وارد شوید.</p>
    <Link href="/login" className="btn btn-primary w-full mt-2">ورود به حساب</Link>
  </div>

  const switcher = methods.email && methods.sms && <div className="auth-mode" role="group" aria-label="روش بازیابی">
    <button type="button" aria-pressed={mode === 'sms'} className={mode === 'sms' ? 'is-active' : ''} onClick={() => { setMode('sms'); setSent(''); setError('') }}>با پیامک</button>
    <button type="button" aria-pressed={mode === 'email'} className={mode === 'email' ? 'is-active' : ''} onClick={() => { setMode('email'); setSent(''); setError('') }}>با ایمیل</button>
  </div>

  if (mode === 'email') return <form className="auth-form" onSubmit={request} aria-busy={busy}>
    {heading}
    <p className="auth-form-intro">ایمیل حساب خود را وارد کنید تا پیوند انتخاب رمز تازه برایتان ارسال شود.</p>
    {switcher}
    {sent ? <p className="success-text" role="status">{sent} پوشهٔ هرزنامه (Spam) را هم نگاه کنید.</p> : <>
      <div className="mb-4">
        <label className="label" htmlFor="forgot-email">ایمیل</label>
        <input id="forgot-email" className="input" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <HumanCheck surface="recovery" locale="fa" resetKey={turnstileReset} onToken={setTurnstileToken} />
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {!sent && <button className="btn btn-primary w-full mt-2" disabled={busy || (turnstileRequired && !turnstileToken)}>{busy ? <><span className="auth-spinner" aria-hidden="true" />در حال ارسال…</> : 'ارسال پیوند بازیابی'}</button>}
    <p className="auth-back"><Link href="/login">← بازگشت به ورود</Link></p>
  </form>

  return <form className="auth-form" onSubmit={sent ? reset : request} aria-busy={busy}>
    {heading}
    <p className="auth-form-intro">{sent ? 'کد پیامک‌شده و رمز تازه را وارد کنید.' : 'شمارهٔ موبایلی را که در حساب تأیید کرده‌اید وارد کنید.'}</p>
    {switcher}
    {!sent ? <>
      <div className="mb-4">
        <label className="label" htmlFor="forgot-phone">شمارهٔ موبایل</label>
        <input id="forgot-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" dir="ltr" placeholder="09121234567" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={10} maxLength={16} />
      </div>
      <HumanCheck surface="recovery" locale="fa" resetKey={turnstileReset} onToken={setTurnstileToken} />
    </> : <>
      <p className="muted text-sm mb-4" role="status">{sent}</p>
      <div className="mb-4">
        <label className="label" htmlFor="forgot-code">کد پیامک</label>
        <input id="forgot-code" className="input auth-otp" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(latinDigits(e.target.value).replace(/\D/g, ''))} required autoFocus />
        <div className="auth-otp-actions">
          <button type="button" className="link-button" onClick={() => { setSent(''); setCode(''); setNeedsTotp(false); setError('') }}>ویرایش شماره</button>
          <button type="button" className="link-button" disabled={resendIn > 0 || busy} onClick={() => void request()}>{resendIn > 0 ? `ارسال دوباره تا ${resendIn.toLocaleString('fa-IR')} ثانیه` : 'ارسال دوبارهٔ کد'}</button>
        </div>
      </div>
      <PasswordField id="forgot-password" label="رمز عبور تازه" value={password} onChange={setPassword} />
      {needsTotp && <div className="mb-4">
        <label className="label" htmlFor="forgot-totp">کد ورود دو مرحله‌ای</label>
        <input id="forgot-totp" className="input auth-otp" type="text" inputMode="text" autoComplete="one-time-code" dir="ltr" maxLength={11} value={totp} onChange={(e) => setTotp(e.target.value)} required autoFocus />
        <small className="muted">کد ۶ رقمی برنامهٔ احراز هویت، یا یکی از کدهای پشتیبان.</small>
      </div>}
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <button className="btn btn-primary w-full mt-2" disabled={busy || (!sent && turnstileRequired && !turnstileToken) || (!!sent && (code.length < 6 || password.length < 8))}>
      {busy ? <><span className="auth-spinner" aria-hidden="true" />لطفاً صبر کنید…</> : sent ? 'ذخیرهٔ رمز تازه' : 'دریافت کد'}
    </button>
    <p className="auth-back"><Link href="/login">← بازگشت به ورود</Link></p>
  </form>
}
