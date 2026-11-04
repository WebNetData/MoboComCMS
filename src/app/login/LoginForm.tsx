'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'
import Link from '@/components/AppLink'
import HumanCheck from '@/components/HumanCheck'
import { AuthInput, PasswordInput } from './AuthFields'
import type { ReactNode } from 'react'
import { latinDigits } from '@/shared/text/digits'
import { initialEntryMethod } from '@/modules/identity/domain/account-security'
import { authEntryHref, safeNext } from '@/modules/identity/domain/continuation'

type CodeProvider = 'credentials' | 'sms-otp' | 'email-otp'
export default function LoginForm({ telegramLogin, otp = false, emailOtp = false, intent = 'login' }: { telegramLogin?: ReactNode; otp?: boolean; emailOtp?: boolean; intent?: 'login' | 'register' }) {
  const router = useRouter()
  const params = useSearchParams()
  const { t, locale } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Every sign-in place may ask for the human check; the widget sends 'off' when this one does not.
  const turnstileRequired = true
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileReset, setTurnstileReset] = useState(0)
  // A newly created or reset password is followed by the password form and its confirmation.
  const [mode, setMode] = useState(() => initialEntryMethod({ sms: otp, email: emailOtp, registered: params.get('registered') === '1', passwordChanged: params.get('changed') === '1' || params.get('setup') === '1' }))
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [resendIn, setResendIn] = useState(0)
  // 2-step sign-in: set once the first factor passed and the account asks for its code.
  const [twoStep, setTwoStep] = useState<'' | CodeProvider>('')
  const [totp, setTotp] = useState('')
  const fa = locale === 'fa'
  const twoStepError = (error: string | undefined | null, provider: CodeProvider) => {
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
    const next = safeNext(params.get('next')) || '/dashboard'
    // New members (SMS sign-ups especially) first complete the required details.
    const status = await fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    router.push(!status || status.needsCompletion ? `/welcome?next=${encodeURIComponent(next)}` : next)
    router.refresh()
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true); setError('')
    try {
      if (turnstileRequired && !turnstileToken) { setError(fa ? 'لطفاً اعتبارسنجی امنیتی را کامل کنید.' : 'Please complete the security check.'); return }
      const res = await fetch(mode === 'email' ? '/api/login/email-code' : '/api/sms/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, email, turnstileToken }) })
      const data = await res.json().catch(() => null)
      setTurnstileReset((value) => value + 1)
      if (!res.ok) { setError(data?.error || t.errGeneric); return }
      setSentTo(data.display || (mode === 'email' ? email : phone)); setResendIn(Number(data.resendIn) || 60); setCode('')
    } catch { setError(t.errGeneric); setTurnstileReset(value => value + 1) } finally { setLoading(false) }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const provider = mode === 'email' ? 'email-otp' : 'sms-otp'
      const res = await signIn(provider, { phone, email, code, totp: twoStep ? totp : '', redirect: false })
      if (twoStepError(res?.error, provider)) return
      if (!res || res.error) { setError(fa ? 'کد وارد شده صحیح نیست یا منقضی شده است.' : 'The code is wrong or expired.'); return }
      await goNext()
    } catch { setError(t.errGeneric); setTurnstileReset(value => value + 1) } finally { setLoading(false) }
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
      await goNext()
    } catch {
      setTurnstileReset(value => value + 1)
      setError(t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  const heading = <>
    <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
    <p className="auth-form-eyebrow">{fa ? 'خوش آمدید' : 'WELCOME BACK'}</p>
    <h1>{intent === 'register' ? (fa ? 'ثبت‌نام و ورود' : 'Create an account or sign in') : t.loginTitle}</h1>
  </>
  const choose = (value: typeof mode) => { setMode(value); setSentTo(''); setCode(''); setTwoStep(''); setTotp(''); setError(''); setTurnstileReset(v => v + 1) }
  const switcher = intent !== 'register' && (otp || emailOtp) && <div className="auth-mode" role="group" aria-label={fa ? 'روش ورود' : 'Sign-in method'}>
    {otp && <button type="button" aria-pressed={mode === 'phone'} disabled={loading} className={mode === 'phone' ? 'is-active' : ''} onClick={() => choose('phone')}>{fa ? 'موبایل' : 'Mobile'}</button>}
    {emailOtp && <button type="button" aria-pressed={mode === 'email'} disabled={loading} className={mode === 'email' ? 'is-active' : ''} onClick={() => choose('email')}>{fa ? 'ایمیل' : 'Email'}</button>}
    <button type="button" aria-pressed={mode === 'password'} disabled={loading} className={mode === 'password' ? 'is-active' : ''} onClick={() => choose('password')}>{fa ? 'رمز عبور' : 'Password'}</button>
  </div>

  if (twoStep) return (
    <form onSubmit={twoStep === 'credentials' ? submit : verifyCode} className="auth-form" aria-busy={loading}>
      <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
      <p className="auth-form-eyebrow">{fa ? 'ورود دو مرحله‌ای' : '2-STEP SIGN-IN'}</p>
      <h1>{fa ? 'کد تأیید دوم' : 'Second code'}</h1>
      <p className="auth-form-intro">{fa ? 'کد ۶ رقمی برنامهٔ احراز هویت (Google Authenticator، Microsoft Authenticator و …) را وارد کنید. اگر گوشی در دسترس نیست، یکی از کدهای پشتیبان را بزنید.' : 'Enter the 6-digit code from your authenticator app, or one of your backup codes.'}</p>
      <div className="mb-4">
        <label className="label" htmlFor="login-totp">{fa ? 'کد ورود دو مرحله‌ای' : '2-step code'}</label>
        <input id="login-totp" className="input auth-otp" type="text" autoComplete="one-time-code" dir="ltr" maxLength={11} value={totp} onChange={(e) => setTotp(e.target.value)} required autoFocus />
      </div>
      {twoStep === 'credentials' && <HumanCheck surface="login" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading || totp.replace(/[\s-]/g, '').length < 6 || (twoStep === 'credentials' && turnstileRequired && !turnstileToken)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{fa ? 'لطفاً صبر کنید…' : 'Please wait…'}</> : (fa ? 'تأیید و ورود' : 'Verify and sign in')}
      </button>
      <p className="auth-back"><button type="button" className="link-button" onClick={() => { setTwoStep(''); setTotp(''); setError(''); setCode(''); setSentTo('') }}>{fa ? '← انصراف و ورود دوباره' : '← Start over'}</button></p>
    </form>
  )

  if ((otp && mode === 'phone') || (emailOtp && mode === 'email')) return (
    <form onSubmit={sentTo ? verifyCode : requestCode} className="auth-form" aria-busy={loading}>
      {heading}
      <p className="auth-form-intro" id="login-code-help" role={sentTo ? 'status' : undefined}>{sentTo ? <>{fa ? 'کد ۶ رقمی ارسال‌شده به ' : 'Enter the 6-digit code sent to '}<bdi dir="ltr" className="auth-code-recipient">{sentTo}</bdi>{fa ? ' را وارد کنید. کد دو دقیقه اعتبار دارد.' : '. It expires in two minutes.'}</> : (fa ? 'بدون رمز عبور وارد شوید؛ اگر حساب ندارید، پس از تأیید کد ساخته می‌شود.' : 'Sign in without a password. A new account is created only after you verify the code.')}</p>
      {switcher}
      {!sentTo ? <>
        <div className="mb-4">
          {mode === 'phone' ? <><label className="label" htmlFor="login-phone">{fa ? 'شمارهٔ موبایل' : 'Mobile number'}</label>
          <AuthInput icon="phone"><input id="login-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09121234567" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={10} maxLength={20} aria-describedby={error ? 'login-code-error' : undefined} aria-invalid={!!error} /></AuthInput></> : <>
          <label className="label" htmlFor="login-code-email">{t.emailLabel}</label>
          <AuthInput icon="mail"><input id="login-code-email" className="input" type="email" autoComplete="email" dir="ltr" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} aria-describedby={error ? 'login-code-error' : undefined} aria-invalid={!!error} /></AuthInput></>}
        </div>
        <HumanCheck surface="entry" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
      </> : <div className="mb-4">
        <label className="label" htmlFor="login-code">{fa ? 'کد تأیید' : 'Verification code'}</label>
        <input id="login-code" className="input auth-otp" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(latinDigits(e.target.value).replace(/\D/g, ''))} required autoFocus aria-describedby={`login-code-help${error ? ' login-code-error' : ''}`} aria-invalid={!!error} />
        <div className="auth-otp-actions">
          <button type="button" className="link-button" disabled={loading} onClick={() => { setSentTo(''); setCode(''); setError(''); setTurnstileReset(v => v + 1) }}>{fa ? (mode === 'email' ? 'ویرایش ایمیل' : 'ویرایش شماره') : 'Change recipient'}</button>
          <button type="button" className="link-button" disabled={resendIn > 0 || loading || (turnstileRequired && !turnstileToken)} onClick={() => void requestCode()}>{resendIn > 0 ? (fa ? `ارسال دوباره تا ${resendIn.toLocaleString('fa-IR')} ثانیه` : `Resend in ${resendIn}s`) : (fa ? 'ارسال دوبارهٔ کد' : 'Resend code')}</button>
        </div>
        <HumanCheck surface="entry" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
      </div>}
      {error && <p id="login-code-error" className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading || (!sentTo && turnstileRequired && !turnstileToken) || (!!sentTo && code.length < 6)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{fa ? 'لطفاً صبر کنید…' : 'Please wait…'}</> : sentTo ? (fa ? 'تأیید و ورود' : 'Verify and sign in') : (fa ? 'دریافت کد' : 'Send code')}
      </button>
      {telegramLogin && <><div className="auth-divider auth-credential-divider"><span>{fa ? 'یا' : 'or'}</span></div>{telegramLogin}</>}
    </form>
  )

  return (
    <form onSubmit={submit} className="auth-form" aria-busy={loading}>
      {heading}
      <p className="auth-form-intro">{locale === 'fa' ? 'با شمارهٔ موبایل تأییدشده یا ایمیل و رمز عبور وارد شوید.' : 'Sign in with your verified mobile number or email and password.'}</p>
      {params.get('setup') === '1' && <p className="success-text mb-4" role="status">{fa ? 'حساب و رمز شما آماده شد؛ اکنون با موبایل یا ایمیل و رمز تازه وارد شوید.' : 'Your account and password are ready. Sign in with your mobile or email and new password.'}</p>}
      {params.get('registered') === '1' && <p className="success-text mb-4" role="status">{locale === 'fa' ? 'حساب ساخته شد؛ حالا وارد شوید.' : 'Account created. You can now sign in.'}</p>}
      {params.get('changed') === '1' && <p className="success-text mb-4" role="status">{locale === 'fa' ? 'رمز عبور تغییر کرد و همهٔ دستگاه‌ها از حساب خارج شدند. با رمز تازه وارد شوید.' : 'Your password was changed and every device was signed out. Sign in with the new password.'}</p>}
      {switcher}
      {telegramLogin}
      <div className="mb-4">
        <label className="label" htmlFor="login-email">{fa ? 'موبایل یا ایمیل' : 'Mobile or email'}</label>
        <AuthInput icon="user"><input id="login-email" className="input auth-identifier" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" placeholder="09121234567 / name@mail.com" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required /></AuthInput>
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="login-password">{locale === 'fa' ? 'رمز عبور' : 'Password'}</label>
        <PasswordInput fa={fa} id="login-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <p className="auth-forgot"><Link href="/forgot-password">{fa ? 'رمز عبور را فراموش کرده‌اید؟' : 'Forgot your password?'}</Link></p>
      <HumanCheck surface="login" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading || (turnstileRequired && !turnstileToken)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{t.loggingIn}</> : t.loginBtn}
      </button>
      {intent === 'register' && <p className="auth-alternative"><Link href={authEntryHref('/register', params.get('next'), { method: 'password' })}>{fa ? 'ثبت‌نام با ایمیل و رمز عبور' : 'Register with email and password'}</Link></p>}
    </form>
  )
}
