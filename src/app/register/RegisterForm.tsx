'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'
import HumanCheck from '@/components/HumanCheck'
import { AuthInput, PasswordInput, PasswordStrength } from '../login/AuthFields'
import { authEntryHref } from '@/modules/identity/domain/continuation'

/** The sign-up form. The page around it (header, frame) is rendered on the server, see page.tsx. */
export default function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { t, locale } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [telegramLinkRequested, setTelegramLinkRequested] = useState(false)
  // Every sign-in place may ask for the human check; the widget sends 'off' when this one does not.
  const turnstileRequired = true
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileReset, setTurnstileReset] = useState(0)
  const loginHref = telegramToken
    ? `/login?next=${encodeURIComponent(`/telegram/connect?token=${telegramToken}`)}`
    : authEntryHref('/login', params.get('next'))

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
      // A Telegram claim is complete on the server; its consumed link is not a return destination.
      router.push(authEntryHref('/login', telegramToken ? '' : params.get('next'), { registered: '1' }))
      router.refresh()
    } catch {
      setTurnstileReset(value => value + 1)
      setError(t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  return (
        <form onSubmit={submit} className="auth-form" aria-busy={loading}>
          <span className="auth-form-icon"><Icon name="globe" size={25} /></span>
          <p className="auth-form-eyebrow">{locale === 'fa' ? 'عضویت رایگان' : 'JOIN FREE'}</p>
          <h1>{t.registerTitle}</h1>
          <p className="auth-form-intro">{locale === 'fa' ? 'یک حساب برای خرید، کتابخانه، نظرها و تالار گفتمان.' : 'One account for shopping, your library, reviews and the forum.'}</p>
          {telegramToken && <p className="success-text mb-4" role="status">{locale === 'fa' ? 'این ثبت‌نام به حساب تلگرام شما وصل می‌شود و اطلاعات قبلی همان حساب حفظ خواهد شد.' : 'This registration will claim your Telegram account and keep its existing purchases, wallet and subscriptions.'}</p>}
          <div className="mb-4">
            <label className="label" htmlFor="register-name">{t.nameLabel}</label>
            <AuthInput icon="user"><input id="register-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></AuthInput>
          </div>
          <div className="mb-4">
            <label className="label" htmlFor="register-email">{t.emailLabel}</label>
            <AuthInput icon="mail"><input id="register-email" className="input" type="email" autoComplete="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></AuthInput>
          </div>
          <div className="mb-4">
            <label className="label" htmlFor="register-password">{t.passwordLabel}</label>
            <PasswordInput fa={locale === 'fa'} id="register-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} aria-describedby="register-password-hint" />
            <div id="register-password-hint"><PasswordStrength password={password} fa={locale === 'fa'} /></div>
          </div>
          {referralCode && <p className="success-text mb-4">{locale === 'fa' ? 'کد معرف' : 'Referral code'}: <strong dir="ltr">{referralCode}</strong></p>}
          <HumanCheck surface="register" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading || (turnstileRequired && !turnstileToken)}>
            {loading ? <><span className="auth-spinner" aria-hidden="true" />{t.loading}</> : t.registerBtn}
          </button>
          <p className="auth-alternative muted">
            {t.haveAccount} <Link href={loginHref} className="text-primary-var">{t.login}</Link>
          </p>
        </form>
  )
}
