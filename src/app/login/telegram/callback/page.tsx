'use client'

import Link from '@/components/AppLink'
import { signIn } from 'next-auth/react'
import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { parseTelegramWidgetRedirect } from '@/modules/identity/telegram-widget-redirect'

/** Members with required details still missing (a verified mobile, for example) finish them first, as after any sign-in. */
async function afterSignIn(destination: string) {
  const status = await fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return status?.needsCompletion ? `/welcome?next=${encodeURIComponent(destination)}` : destination
}

export default function TelegramLoginCallback() {
  const router = useRouter()
  const { locale } = useI18n()
  const started = useRef(false)
  const [error, setError] = useState(false)
  // Accounts with 2-step sign-in confirm with their code before the Telegram login completes.
  const [pending, setPending] = useState<{ authData: string; destination: string } | null>(null)
  const [totp, setTotp] = useState('')
  const [totpError, setTotpError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const result = parseTelegramWidgetRedirect(new URLSearchParams(window.location.search))
    // Keep the signed identity and profile fields out of browser history and referrers.
    window.history.replaceState(window.history.state, '', '/login/telegram/callback')
    if (!result) { setError(true); return }
    void signIn('telegram-web', { authData: result.authData, redirect: false })
      .then((response) => {
        if (response?.error === 'TOTP_REQUIRED') { setPending({ authData: result.authData, destination: result.destination }); return }
        if (!response || response.error) { setError(true); return }
        return afterSignIn(result.destination).then((target) => { router.replace(target); router.refresh() })
      })
      .catch(() => setError(true))
  }, [router])

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (!pending) return
    setBusy(true); setTotpError('')
    const response = await signIn('telegram-web', { authData: pending.authData, totp, redirect: false }).catch(() => null)
    setBusy(false)
    if (response && !response.error) { router.replace(await afterSignIn(pending.destination)); router.refresh(); return }
    if (response?.error === 'TOTP_INVALID') { setTotpError(locale === 'fa' ? 'کد ورود دو مرحله‌ای درست نیست.' : 'The 2-step code is wrong.'); return }
    setPending(null); setError(true)
  }

  if (pending) return (
    <main className="auth-telegram-callback">
      <form className="auth-telegram-callback-card" onSubmit={confirm} aria-busy={busy}>
        <span className="auth-telegram-icon" aria-hidden="true">🔐</span>
        <h1>{locale === 'fa' ? 'ورود دو مرحله‌ای' : '2-step sign-in'}</h1>
        <p>{locale === 'fa' ? 'کد ۶ رقمی برنامهٔ احراز هویت یا یکی از کدهای پشتیبان را وارد کنید.' : 'Enter the code from your authenticator app or a backup code.'}</p>
        <input className="input auth-otp" aria-label={locale === 'fa' ? 'کد ورود دو مرحله‌ای' : '2-step code'} autoComplete="one-time-code" dir="ltr" maxLength={11} value={totp} onChange={(e) => setTotp(e.target.value)} required autoFocus />
        {totpError && <p className="error-text" role="alert">{totpError}</p>}
        <button className="btn btn-primary" disabled={busy || totp.replace(/[\s-]/g, '').length < 6}>{locale === 'fa' ? 'تأیید و ورود' : 'Verify and sign in'}</button>
      </form>
    </main>
  )

  return (
    <main className="auth-telegram-callback" role="status" aria-live="polite">
      <div className="auth-telegram-callback-card">
        <span className="auth-telegram-icon" aria-hidden="true">✈</span>
        <h1>{error ? (locale === 'fa' ? 'ورود با تلگرام انجام نشد' : 'Telegram sign-in failed') : (locale === 'fa' ? 'در حال تکمیل ورود با تلگرام…' : 'Completing Telegram sign-in…')}</h1>
        <p>{error ? (locale === 'fa' ? 'لطفاً دوباره از صفحهٔ ورود تلاش کنید.' : 'Please try again from the login page.') : (locale === 'fa' ? 'چند لحظه صبر کنید.' : 'Please wait a moment.')}</p>
        {error && <Link href="/login" className="btn btn-primary">{locale === 'fa' ? 'بازگشت به ورود' : 'Back to login'}</Link>}
      </div>
    </main>
  )
}
