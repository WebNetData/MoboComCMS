'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'
import Link from '@/components/AppLink'
import TurnstileWidget from '@/components/TurnstileWidget'
import type { ReactNode } from 'react'

export default function LoginForm({ telegramLogin, otp = false }: { telegramLogin?: ReactNode; otp?: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const { t, locale } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [turnstileToken, setTurnstileToken] = useState(turnstileRequired ? '' : 'not-configured')
  const [turnstileReset, setTurnstileReset] = useState(0)
  const [mode, setMode] = useState<'phone' | 'email'>(otp ? 'phone' : 'email')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [resendIn, setResendIn] = useState(0)
  // 2-step sign-in: set once the first factor passed and the account asks for its code.
  const [twoStep, setTwoStep] = useState<'' | 'credentials' | 'sms-otp'>('')
  const [totp, setTotp] = useState('')
  const fa = locale === 'fa'
  const twoStepError = (error: string | undefined | null, provider: 'credentials' | 'sms-otp') => {
    // The security-check token is single use, so the second step gets a fresh one.
    if (error === 'TOTP_REQUIRED') { setTwoStep(provider); setTotp(''); setError(''); setTurnstileReset((value) => value + 1); return true }
    if (error === 'TOTP_INVALID') { setTwoStep(provider); setError(fa ? 'کد ورود دو مرحله‌ای درست نیست.' : 'The 2-step code is wrong.'); setTurnstileReset((value) => value + 1); return true }
    return false
  }

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const goNext = async () => {
    const wanted = params.get('next') || '/dashboard'
    const next = /^\/(?!\/)/.test(wanted) && !/[\\\u0000-\u001f]/.test(wanted) ? wanted : '/dashboard'
    // New members (SMS sign-ups especially) first complete the required details.
    const status = await fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    router.push(status?.needsCompletion ? `/welcome?next=${encodeURIComponent(next)}` : next)
    router.refresh()
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true); setError('')
    try {
      if (turnstileRequired && !turnstileToken) { setError(fa ? 'لطفاً اعتبارسنجی امنیتی را کامل کنید.' : 'Please complete the security check.'); return }
      const res = await fetch('/api/sms/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, turnstileToken }) })
      const data = await res.json().catch(() => null)
      setTurnstileReset((value) => value + 1)
      if (!res.ok) { setError(data?.error || t.errGeneric); return }
      setSentTo(data.display || phone); setResendIn(Number(data.resendIn) || 60); setCode('')
    } catch { setError(t.errGeneric) } finally { setLoading(false) }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await signIn('sms-otp', { phone, code, totp: twoStep ? totp : '', redirect: false })
      if (twoStepError(res?.error, 'sms-otp')) return
      if (!res || res.error) { setError(fa ? 'کد وارد شده صحیح نیست یا منقضی شده است.' : 'The code is wrong or expired.'); return }
      goNext()
    } catch { setError(t.errGeneric) } finally { setLoading(false) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (turnstileRequired && !turnstileToken) {
        setError(locale === 'fa' ? 'لطفاً اعتبارسنجی امنیتی را کامل کنید.' : 'Please complete the security check.')
        return
      }
      const res = await signIn('credentials', { email, password, turnstileToken, totp: twoStep ? totp : '', redirect: false })
      if (twoStepError(res?.error, 'credentials')) return
      if (!res || res.error) {
        setError(t.loginFailed)
        setTurnstileReset((value) => value + 1)
        return
      }
      goNext()
    } catch {
      setError(t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  const heading = <>
    <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
    <p className="auth-form-eyebrow">{fa ? 'خوش آمدید' : 'WELCOME BACK'}</p>
    <h1>{t.loginTitle}</h1>
  </>
  const switcher = otp && <div className="auth-mode" role="tablist" aria-label={fa ? 'روش ورود' : 'Sign-in method'}>
    <button type="button" role="tab" aria-selected={mode === 'phone'} className={mode === 'phone' ? 'is-active' : ''} onClick={() => { setMode('phone'); setError('') }}>{fa ? 'ورود با موبایل' : 'Mobile'}</button>
    <button type="button" role="tab" aria-selected={mode === 'email'} className={mode === 'email' ? 'is-active' : ''} onClick={() => { setMode('email'); setError('') }}>{fa ? 'ورود با ایمیل' : 'Email'}</button>
  </div>

  if (twoStep) return (
    <form onSubmit={twoStep === 'sms-otp' ? verifyCode : submit} className="auth-form" aria-busy={loading}>
      <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
      <p className="auth-form-eyebrow">{fa ? 'ورود دو مرحله‌ای' : '2-STEP SIGN-IN'}</p>
      <h1>{fa ? 'کد تأیید دوم' : 'Second code'}</h1>
      <p className="auth-form-intro">{fa ? 'کد ۶ رقمی برنامهٔ احراز هویت (Google Authenticator، Microsoft Authenticator و …) را وارد کنید. اگر گوشی در دسترس نیست، یکی از کدهای پشتیبان را بزنید.' : 'Enter the 6-digit code from your authenticator app, or one of your backup codes.'}</p>
      <div className="mb-4">
        <label className="label" htmlFor="login-totp">{fa ? 'کد ورود دو مرحله‌ای' : '2-step code'}</label>
        <input id="login-totp" className="input auth-otp" type="text" autoComplete="one-time-code" dir="ltr" maxLength={11} value={totp} onChange={(e) => setTotp(e.target.value)} required autoFocus />
      </div>
      {twoStep === 'credentials' && <TurnstileWidget action="login" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="btn btn-primary w-full mt-2" disabled={loading || totp.replace(/[\s-]/g, '').length < 6 || (twoStep === 'credentials' && turnstileRequired && !turnstileToken)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{fa ? 'لطفاً صبر کنید…' : 'Please wait…'}</> : (fa ? 'تأیید و ورود' : 'Verify and sign in')}
      </button>
      <p className="auth-back"><button type="button" className="link-button" onClick={() => { setTwoStep(''); setTotp(''); setError(''); setCode(''); setSentTo('') }}>{fa ? '← انصراف و ورود دوباره' : '← Start over'}</button></p>
    </form>
  )

  if (otp && mode === 'phone') return (
    <form onSubmit={sentTo ? verifyCode : requestCode} className="auth-form" aria-busy={loading}>
      {heading}
      <p className="auth-form-intro">{sentTo ? (fa ? `کد ۶ رقمی ارسال‌شده به ${sentTo} را وارد کنید.` : `Enter the 6-digit code sent to ${sentTo}.`) : (fa ? 'شمارهٔ موبایل خود را وارد کنید؛ اگر حساب ندارید، همین حالا ساخته می‌شود.' : 'Enter your mobile number; an account is created if you do not have one.')}</p>
      {switcher}
      {!sentTo ? <>
        <div className="mb-4">
          <label className="label" htmlFor="login-phone">{fa ? 'شمارهٔ موبایل' : 'Mobile number'}</label>
          <input id="login-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" dir="ltr" placeholder="09121234567" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={10} maxLength={16} />
        </div>
        <TurnstileWidget action="login" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
      </> : <div className="mb-4">
        <label className="label" htmlFor="login-code">{fa ? 'کد تأیید' : 'Verification code'}</label>
        <input id="login-code" className="input auth-otp" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9۰-۹]/g, ''))} required autoFocus />
        <div className="auth-otp-actions">
          <button type="button" className="link-button" onClick={() => { setSentTo(''); setCode(''); setError('') }}>{fa ? 'ویرایش شماره' : 'Change number'}</button>
          <button type="button" className="link-button" disabled={resendIn > 0 || loading} onClick={() => void requestCode()}>{resendIn > 0 ? (fa ? `ارسال دوباره تا ${resendIn.toLocaleString('fa-IR')} ثانیه` : `Resend in ${resendIn}s`) : (fa ? 'ارسال دوبارهٔ کد' : 'Resend code')}</button>
        </div>
      </div>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="btn btn-primary w-full mt-2" disabled={loading || (!sentTo && turnstileRequired && !turnstileToken) || (!!sentTo && code.length < 6)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{fa ? 'لطفاً صبر کنید…' : 'Please wait…'}</> : sentTo ? (fa ? 'ورود' : 'Sign in') : (fa ? 'دریافت کد' : 'Send code')}
      </button>
      {telegramLogin && <><div className="auth-divider auth-credential-divider"><span>{fa ? 'یا' : 'or'}</span></div>{telegramLogin}</>}
    </form>
  )

  return (
    <form onSubmit={submit} className="auth-form" aria-busy={loading}>
      {heading}
      <p className="auth-form-intro">{locale === 'fa' ? 'وارد شوید و اتصال‌های خود را مدیریت کنید.' : 'Sign in to manage your connected world.'}</p>
      {params.get('registered') === '1' && <p className="success-text mb-4" role="status">{locale === 'fa' ? 'حساب ساخته شد؛ حالا وارد شوید.' : 'Account created. You can now sign in.'}</p>}
      {switcher}
      {!otp && telegramLogin}
      {!otp && <div className="auth-divider auth-credential-divider"><span>{locale === 'fa' ? 'یا با ایمیل وارد شوید' : 'or sign in with email'}</span></div>}
      <div className="mb-4">
        <label className="label" htmlFor="login-email">{t.emailLabel}</label>
        <input id="login-email" className="input" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="login-password">{locale === 'fa' ? 'رمز عبور' : 'Password'}</label>
        <input id="login-password" className="input" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <p className="auth-forgot"><Link href="/forgot-password">{fa ? 'رمز عبور را فراموش کرده‌اید؟' : 'Forgot your password?'}</Link></p>
      <TurnstileWidget action="login" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="btn btn-primary w-full mt-2" disabled={loading || (turnstileRequired && !turnstileToken)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{t.loggingIn}</> : t.loginBtn}
      </button>
    </form>
  )
}
