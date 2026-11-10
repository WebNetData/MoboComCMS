'use client'

import Link from '@/components/AppLink'
import { signIn } from 'next-auth/react'
import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { safeNext } from '@/modules/identity/domain/continuation'
import { GoogleMark } from '@/components/GoogleMark'

/** Members with required details still missing (a verified mobile, for example) finish them first, as after any sign-in. */
async function afterSignIn(destination: string) {
  const status = await fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return status?.needsCompletion ? `/welcome?next=${encodeURIComponent(destination)}` : destination
}

/**
 * Back from Google: the server left a one-time ticket in the address fragment (never sent to a server). It becomes the
 * session here; an account with 2-step sign-in confirms with its code first.
 */
export default function GoogleLoginReturn() {
  const router = useRouter()
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const started = useRef(false)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState<{ ticket: string; destination: string } | null>(null)
  const [totp, setTotp] = useState('')
  const [totpError, setTotpError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const ticket = fragment.get('ticket') || ''
    const destination = safeNext(fragment.get('next')) || '/dashboard'
    // The ticket leaves the address bar and the history at once.
    window.history.replaceState(window.history.state, '', '/login/google')
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) { setError(true); return }
    void signIn('google', { ticket, redirect: false })
      .then((response) => {
        if (response?.error === 'TOTP_REQUIRED') { setPending({ ticket, destination }); return }
        if (!response || response.error) { setError(true); return }
        return afterSignIn(destination).then((target) => { router.replace(target); router.refresh() })
      })
      .catch(() => setError(true))
  }, [router])

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (!pending) return
    setBusy(true); setTotpError('')
    const response = await signIn('google', { ticket: pending.ticket, totp, redirect: false }).catch(() => null)
    setBusy(false)
    if (response && !response.error) { router.replace(await afterSignIn(pending.destination)); router.refresh(); return }
    if (response?.error === 'TOTP_INVALID') { setTotpError(fa ? 'کد ورود دو مرحله‌ای درست نیست.' : 'The 2-step code is wrong.'); return }
    setPending(null); setError(true)
  }

  if (pending) return (
    <main className="auth-telegram-callback">
      <form className="auth-telegram-callback-card" onSubmit={confirm} aria-busy={busy}>
        <span className="auth-google-mark" aria-hidden="true"><GoogleMark size={28} /></span>
        <h1>{fa ? 'ورود دو مرحله‌ای' : '2-step sign-in'}</h1>
        <p>{fa ? 'کد ۶ رقمی برنامهٔ احراز هویت یا یکی از کدهای پشتیبان را وارد کنید.' : 'Enter the code from your authenticator app or a backup code.'}</p>
        <input className="input auth-otp" aria-label={fa ? 'کد ورود دو مرحله‌ای' : '2-step code'} autoComplete="one-time-code" dir="ltr" maxLength={11} value={totp} onChange={(e) => setTotp(e.target.value)} required autoFocus />
        {totpError && <p className="error-text" role="alert">{totpError}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || totp.replace(/[\s-]/g, '').length < 6}>{fa ? 'تأیید و ورود' : 'Verify and sign in'}</button>
      </form>
    </main>
  )

  return (
    <main className="auth-telegram-callback" role="status" aria-live="polite">
      <div className="auth-telegram-callback-card">
        <span className="auth-google-mark" aria-hidden="true"><GoogleMark size={28} /></span>
        <h1>{error ? (fa ? 'ورود با گوگل انجام نشد' : 'Google sign-in failed') : (fa ? 'در حال تکمیل ورود با گوگل…' : 'Completing Google sign-in…')}</h1>
        <p>{error ? (fa ? 'این پیوند ورود فقط یک بار و چند دقیقه کار می‌کند؛ از صفحهٔ ورود دوباره تلاش کنید.' : 'This sign-in link works once, for a few minutes. Try again from the login page.') : (fa ? 'چند لحظه صبر کنید.' : 'Please wait a moment.')}</p>
        {error && <Link href="/login" className="btn btn-primary">{fa ? 'بازگشت به ورود' : 'Back to login'}</Link>}
      </div>
    </main>
  )
}
