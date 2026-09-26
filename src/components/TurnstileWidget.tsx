'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

export default function TurnstileWidget({ action, locale, resetKey, onToken }: {
  action: 'login' | 'register'
  locale: string
  resetKey: number
  onToken: (token: string) => void
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!siteKey || !ready || !container.current || !window.turnstile) return
    if (widgetId.current) window.turnstile.remove(widgetId.current)
    onToken('')
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      theme: 'auto',
      language: locale === 'fa' ? 'fa' : 'en',
      size: 'flexible',
      callback: (token: string) => onToken(token),
      'expired-callback': () => onToken(''),
      'error-callback': () => onToken(''),
    })
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [action, locale, onToken, ready, resetKey, siteKey])

  if (!siteKey) return null
  return (
    <div className="mb-4" aria-label={locale === 'fa' ? 'اعتبارسنجی انسان بودن' : 'Human verification'}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} />
    </div>
  )
}
