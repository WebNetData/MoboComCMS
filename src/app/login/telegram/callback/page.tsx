'use client'

import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { parseTelegramWidgetRedirect } from '@/modules/identity/telegram-widget-redirect'

export default function TelegramLoginCallback() {
  const router = useRouter()
  const { locale } = useI18n()
  const started = useRef(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const result = parseTelegramWidgetRedirect(new URLSearchParams(window.location.search))
    // Keep the signed identity and profile fields out of browser history and referrers.
    window.history.replaceState(window.history.state, '', '/login/telegram/callback')
    if (!result) { setError(true); return }
    void signIn('telegram-web', { authData: result.authData, redirect: false })
      .then((response) => {
        if (!response || response.error) { setError(true); return }
        router.replace(result.destination)
        router.refresh()
      })
      .catch(() => setError(true))
  }, [router])

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
