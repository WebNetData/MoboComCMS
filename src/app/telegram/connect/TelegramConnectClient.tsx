'use client'

import Link from '@/components/AppLink'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'

type Phase = 'idle' | 'linking' | 'error'

export default function TelegramConnectClient({ token }: { token: string }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { locale } = useI18n()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const started = useRef(false)
  const validToken = /^[A-Za-z0-9_-]{32}$/.test(token)
  const provisional = Boolean(session?.user?.email?.endsWith('@telegram.local'))
  const nextPath = `/telegram/connect?token=${encodeURIComponent(token)}`
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`
  const registerHref = `/register?telegramToken=${encodeURIComponent(token)}`

  useEffect(() => {
    if (!validToken || status !== 'authenticated' || provisional || started.current) return
    started.current = true
    setPhase('linking')
    fetch('/api/telegram/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || (locale === 'fa' ? 'اتصال انجام نشد' : 'Could not link the accounts'))
        router.replace('/dashboard/profile?telegram=linked')
        router.refresh()
      })
      .catch(reason => {
        setError(reason instanceof Error ? reason.message : (locale === 'fa' ? 'اتصال انجام نشد' : 'Could not link the accounts'))
        setPhase('error')
      })
  }, [locale, provisional, router, status, token, validToken])

  async function useExistingAccount() {
    await signOut({ redirect: false })
    router.push(loginHref)
    router.refresh()
  }

  if (!validToken) {
    return (
      <div className="auth-form">
        <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
        <h1>{locale === 'fa' ? 'لینک نامعتبر است' : 'Invalid link'}</h1>
        <p className="error-text">{locale === 'fa' ? 'از داخل ربات دستور /link را دوباره بزن و لینک تازه را باز کن.' : 'Run /link in the bot again and open the fresh link.'}</p>
      </div>
    )
  }

  if (status === 'loading' || phase === 'linking' || (status === 'authenticated' && !provisional && phase === 'idle')) {
    return (
      <div className="auth-form" aria-busy="true">
        <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
        <h1>{locale === 'fa' ? 'همگام‌سازی حساب' : 'Syncing accounts'}</h1>
        <p className="muted">{locale === 'fa' ? 'در حال اتصال تلگرام به حساب سایت…' : 'Connecting Telegram to your website account…'}</p>
      </div>
    )
  }

  if (status === 'authenticated' && provisional) {
    return (
      <div className="auth-form">
        <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
        <p className="auth-form-eyebrow">TELEGRAM ↔ WEB</p>
        <h1>{locale === 'fa' ? 'تکمیل حساب تلگرامی' : 'Complete your Telegram account'}</h1>
        <p className="auth-form-intro">
          {locale === 'fa'
            ? 'خریدها، کیف پول و اشتراک‌های فعلی حفظ می‌شوند. فقط برای همین حساب ایمیل و رمز سایت بساز.'
            : 'Your purchases, wallet and subscriptions stay in place. Add website email/password to this same account.'}
        </p>
        <Link href={registerHref} className="btn btn-primary w-full">{locale === 'fa' ? 'ساخت ورود سایت برای همین حساب' : 'Create website login'}</Link>
        <button className="btn btn-ghost w-full" type="button" onClick={useExistingAccount}>{locale === 'fa' ? 'از قبل حساب سایت دارم' : 'I already have a website account'}</button>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="auth-form">
        <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
        <p className="auth-form-eyebrow">TELEGRAM ↔ WEB</p>
        <h1>{locale === 'fa' ? 'اتصال تلگرام و سایت' : 'Connect Telegram and website'}</h1>
        <p className="auth-form-intro">
          {locale === 'fa'
            ? 'اگر حساب سایت داری وارد همان حساب شو؛ اگر نداری، برای همین حساب تلگرامی ایمیل و رمز بساز. اطلاعات قبلی حذف نمی‌شود.'
            : 'Sign in to an existing website account, or create website credentials for this Telegram account. Existing data is preserved.'}
        </p>
        <Link href={loginHref} className="btn btn-primary w-full">{locale === 'fa' ? 'ورود و اتصال به حساب موجود' : 'Sign in and connect'}</Link>
        <Link href={registerHref} className="btn btn-ghost w-full">{locale === 'fa' ? 'ساخت حساب سایت برای همین تلگرام' : 'Create website login for this Telegram'}</Link>
      </div>
    )
  }

  return (
    <div className="auth-form">
      <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
      <h1>{locale === 'fa' ? 'اتصال انجام نشد' : 'Connection failed'}</h1>
      <p className="error-text" role="alert">{error || (locale === 'fa' ? 'از ربات یک لینک تازه بگیر و دوباره امتحان کن.' : 'Get a fresh link from the bot and try again.')}</p>
    </div>
  )
}
