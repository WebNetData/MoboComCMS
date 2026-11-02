'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { safeNext } from '@/modules/identity/domain/continuation'

export default function TelegramLoginButton({ botUsername }: { botUsername: string }) {
  const host = useRef<HTMLDivElement>(null)
  const params = useSearchParams()
  const { locale } = useI18n()
  const [error, setError] = useState('')
  const [widgetReady, setWidgetReady] = useState(false)

  useEffect(() => {
    if (!botUsername || !host.current) return
    setError('')
    setWidgetReady(false)
    host.current.replaceChildren()
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-userpic', 'true')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-lang', locale)
    const callback = new URL('/login/telegram/callback', window.location.origin)
    const next = safeNext(params.get('next'))
    if (next) callback.searchParams.set('next', next)
    script.setAttribute('data-auth-url', callback.toString())
    const unavailable = locale === 'fa' ? 'دکمهٔ تلگرام در این مرورگر بارگذاری نشد.' : 'Telegram sign-in could not load in this browser.'
    let timer: ReturnType<typeof setTimeout> | undefined
    script.onload = () => {
      timer = setTimeout(() => {
        if (host.current?.querySelector('iframe')) setWidgetReady(true)
        else setError(unavailable)
      }, 500)
    }
    script.onerror = () => setError(unavailable)
    host.current.appendChild(script)
    return () => { if (timer) clearTimeout(timer); script.onload = null; script.onerror = null; script.remove() }
  }, [botUsername, locale, params])

  return (
    <section className="auth-telegram-login" id="telegram-login" aria-label={locale === 'fa' ? 'ورود با تلگرام' : 'Sign in with Telegram'}>
      <div className="auth-telegram-heading"><span className="auth-telegram-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2.5 2.5 10l7.4 2.1 2.1 7.4 9.5-17Z"/><path d="m9.9 12.1 11.6-9.6"/></svg></span><div><strong>{locale === 'fa' ? 'ورود با تلگرام' : 'Continue with Telegram'}</strong><span>{locale === 'fa' ? 'سریع و بدون رمز عبور' : 'Fast, password-free access'}</span></div></div>
      {botUsername ? <div ref={host} className="auth-telegram-widget" aria-busy={!widgetReady && !error} /> : <p className="muted text-sm" role="status">{locale === 'fa' ? 'ورود تلگرام پس از تنظیم ربات در مدیریت فعال می‌شود.' : 'Telegram sign-in will be available after the bot is configured.'}</p>}
      {botUsername && !widgetReady && !error && <p className="muted text-xs">{locale === 'fa' ? 'در حال آماده‌سازی دکمهٔ تلگرام…' : 'Preparing Telegram sign-in…'}</p>}
      {error && <p className="error-text mt-2" role="alert">{error}</p>}
      {error && botUsername && <p className="auth-telegram-note"><a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">{locale === 'fa' ? 'ربات MoboComCMS را باز کنید' : 'Open the MoboComCMS bot'}</a> {locale === 'fa' ? 'و دستور /link را بفرستید.' : 'and send /link to connect your account.'}</p>}
      <p className="auth-telegram-note">{locale === 'fa' ? 'حساب ایمیلی دارید؟ ابتدا از داخل پروفایل آن را به تلگرام وصل کنید.' : 'Already have an email account? Link Telegram from your profile first.'}</p>
    </section>
  )
}
