'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { useI18n } from '@/i18n/LocaleProvider'
import { getCookie } from '@/platform/browser/preferences'
import AuthFrame from '../login/AuthFrame'
import Icon from '@/components/site/Icon'
import TurnstileWidget from '@/components/TurnstileWidget'

export default function RegisterPage() {
  const router = useRouter()
  const { t, locale } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [telegramLinkRequested, setTelegramLinkRequested] = useState(false)
  const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [turnstileToken, setTurnstileToken] = useState(turnstileRequired ? '' : 'not-configured')
  const [turnstileReset, setTurnstileReset] = useState(0)
  const loginHref = telegramToken
    ? `/login?next=${encodeURIComponent(`/telegram/connect?token=${telegramToken}`)}`
    : '/login'

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('telegramToken')
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) setReferralCode(ref.toUpperCase())
    if (raw !== null) setTelegramLinkRequested(true)
    if (raw && /^[A-Za-z0-9_-]{32}$/.test(raw)) setTelegramToken(raw)
    else if (raw !== null) setError(locale === 'fa' ? 'لینک اتصال تلگرام معتبر نیست؛ از ربات یک لینک تازه بگیر.' : 'The Telegram link is invalid. Get a fresh link from the bot.')
  }, [locale])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (telegramLinkRequested && !telegramToken) {
      setError(locale === 'fa' ? 'لینک اتصال تلگرام معتبر نیست؛ از ربات یک لینک تازه بگیر.' : 'The Telegram link is invalid. Get a fresh link from the bot.')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (turnstileRequired && !turnstileToken) {
        setError(locale === 'fa' ? 'لطفاً اعتبارسنجی امنیتی را کامل کنید.' : 'Please complete the security check.')
        return
      }
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, turnstileToken, ...(telegramToken ? { telegramToken } : {}), ...(referralCode ? { referralCode } : {}) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || t.errGeneric)
        setTurnstileReset((value) => value + 1)
        return
      }
      // Turnstile tokens are single-use. Send the new account through the
      // protected login form rather than attempting to reuse this token.
      router.push('/login?registered=1')
      router.refresh()
    } catch {
      setError(t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <SiteHeader theme={theme} />
      <AuthFrame>
        <form onSubmit={submit} className="auth-form" aria-busy={loading}>
          <span className="auth-form-icon"><Icon name="globe" size={25} /></span>
          <p className="auth-form-eyebrow">{locale === 'fa' ? 'شروع یک اتصال تازه' : 'A NEW CONNECTION'}</p>
          <h1>{t.registerTitle}</h1>
          <p className="auth-form-intro">{locale === 'fa' ? 'یک حساب برای مدیریت تمام اشتراک‌های شما.' : 'One account for all your subscriptions.'}</p>
          {telegramToken && <p className="success-text mb-4" role="status">{locale === 'fa' ? 'این ثبت‌نام به حساب تلگرام شما وصل می‌شود و اطلاعات قبلی همان حساب حفظ خواهد شد.' : 'This registration will claim your Telegram account and keep its existing purchases, wallet and subscriptions.'}</p>}
          <div className="mb-4">
            <label className="label" htmlFor="register-name">{t.nameLabel}</label>
            <input id="register-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="label" htmlFor="register-email">{t.emailLabel}</label>
            <input id="register-email" className="input" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="label" htmlFor="register-password">{t.passwordLabel}</label>
            <input id="register-password" className="input" type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} aria-describedby="register-password-hint" />
            <p id="register-password-hint" className="auth-field-hint">{locale === 'fa' ? 'حداقل ۸ کاراکتر' : 'At least 8 characters'}</p>
          </div>
          {referralCode && <p className="success-text mb-4">{locale === 'fa' ? 'کد معرف' : 'Referral code'}: <strong dir="ltr">{referralCode}</strong></p>}
          <TurnstileWidget action="register" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn btn-primary w-full mt-2" disabled={loading || (turnstileRequired && !turnstileToken)}>
            {loading ? <><span className="auth-spinner" aria-hidden="true" />{t.loading}</> : t.registerBtn}
          </button>
          <p className="auth-alternative muted">
            {t.haveAccount} <Link href={loginHref} className="text-primary-var">{t.login}</Link>
          </p>
        </form>
      </AuthFrame>
    </>
  )
}
