'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'
import TurnstileWidget from '@/components/TurnstileWidget'
import type { ReactNode } from 'react'

export default function LoginForm({ telegramLogin }: { telegramLogin?: ReactNode }) {
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (turnstileRequired && !turnstileToken) {
        setError(locale === 'fa' ? 'لطفاً اعتبارسنجی امنیتی را کامل کنید.' : 'Please complete the security check.')
        return
      }
      const res = await signIn('credentials', { email, password, turnstileToken, redirect: false })
      if (!res || res.error) {
        setError(t.loginFailed)
        setTurnstileReset((value) => value + 1)
        return
      }
      const next = params.get('next') || '/dashboard'
      router.push(/^\/(?!\/)/.test(next) && !/[\\\u0000-\u001f]/.test(next) ? next : '/dashboard')
      router.refresh()
    } catch {
      setError(t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="auth-form" aria-busy={loading}>
      <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
      <p className="auth-form-eyebrow">{locale === 'fa' ? 'خوش آمدید' : 'WELCOME BACK'}</p>
      <h1>{t.loginTitle}</h1>
      <p className="auth-form-intro">{locale === 'fa' ? 'وارد شوید و اتصال‌های خود را مدیریت کنید.' : 'Sign in to manage your connected world.'}</p>
      {params.get('registered') === '1' && <p className="success-text mb-4" role="status">{locale === 'fa' ? 'حساب ساخته شد؛ حالا وارد شوید.' : 'Account created. You can now sign in.'}</p>}
      {telegramLogin}
      <div className="auth-divider auth-credential-divider"><span>{locale === 'fa' ? 'یا با ایمیل وارد شوید' : 'or sign in with email'}</span></div>
      <div className="mb-4">
        <label className="label" htmlFor="login-email">{t.emailLabel}</label>
        <input id="login-email" className="input" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="login-password">{locale === 'fa' ? 'رمز عبور' : 'Password'}</label>
        <input id="login-password" className="input" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <TurnstileWidget action="login" locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="btn btn-primary w-full mt-2" disabled={loading || (turnstileRequired && !turnstileToken)}>
        {loading ? <><span className="auth-spinner" aria-hidden="true" />{t.loggingIn}</> : t.loginBtn}
      </button>
    </form>
  )
}
