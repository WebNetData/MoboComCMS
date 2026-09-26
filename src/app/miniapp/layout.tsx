'use client'
import './miniapp.css'

// The Telegram mini app shell.
//
// 1. Loads the Telegram WebApp SDK and adapts to the client (theme, height).
// 2. Signs the visitor in from `initData` — the Telegram id *is* the account —
//    or falls back to an existing web session (so the same pages work in a
//    normal browser, which is also how they are testable).
// 3. Renders a phone-shaped app with a bottom tab bar.
import Script from 'next/script'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useSite } from '@/components/site/SiteProvider'
import Icon from '@/components/site/Icon'
import BrandMark from '@/components/BrandMark'
import ThemeLangControls from '@/components/ThemeLangControls'
import NotificationCount from '@/components/NotificationCount'
import { useI18n } from '@/i18n/LocaleProvider'

import { tg, applyTelegramChrome, onTelegramEvent } from './telegram-client'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n()
  const vpnOn = useModuleEnabled('vpn')
  const [theme, setTheme] = useState('dark')
  const pathname = usePathname()
  const { status, data: session, update } = useSession()
  const site = useSite()
  const signing = useRef(false)
  const verified = useRef('')
  const browserCheck = useRef(false)
  const [sdkReady, setSdkReady] = useState(0)
  const [phase, setPhase] = useState<'boot' | 'ready' | 'needs-telegram' | 'auth-failed'>('boot')

  useEffect(() => {
    // A blocked SDK must not leave browser visitors on an endless loading screen.
    // A later onReady increments again so Telegram authentication is still retried.
    const fallback = window.setTimeout(() => setSdkReady(value => value || 1), 8000)
    return () => window.clearTimeout(fallback)
  }, [])

  const bootstrap = useCallback(async () => {
    if (!sdkReady || status === 'loading') return
    const app = tg()
    if (app?.ready) app.ready()
    if (app?.expand) app.expand()
    if (app?.disableVerticalSwipes) app.disableVerticalSwipes()


    const initData = app?.initData || ''
    if (!initData) {
      if (status !== 'authenticated') { setPhase('needs-telegram'); return }
      if (browserCheck.current) return
      browserCheck.current = true
      try {
        // A JWT can outlive a deleted account or belong to another local database.
        const response = await fetch('/api/me', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
        setPhase(response.ok ? 'ready' : 'auth-failed')
      } catch { setPhase('auth-failed') }
      finally { browserCheck.current = false }
      return
    }
    if (verified.current === initData && status === 'authenticated') {
      setPhase('ready')
      return
    }
    if (signing.current) return
    signing.current = true
    setPhase('boot')
    const res = await signIn('telegram', { initData, redirect: false }).catch(() => null)
    if (res && !res.error) {
      verified.current = initData
      signing.current = false
      await update()
      setPhase('ready')
      return
    }
    signing.current = false
    setPhase('auth-failed')
  }, [status, sdkReady, session, update])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])
  // Keep the Telegram client chrome (app header, background, bottom bar) in
  // sync with the site design tokens, and re-apply on Telegram theme changes.
  useEffect(() => {
    const sync = () => {
      setTheme(document.documentElement.dataset.theme || 'dark')
      if (sdkReady) applyTelegramChrome()
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-design', 'style'] })
    const unsubscribe = sdkReady ? onTelegramEvent('themeChanged', sync) : () => {}
    return () => { observer.disconnect(); unsubscribe() }
  }, [sdkReady])



  const NAV = [
    { href: '/miniapp', label: t.miniHome, icon: 'grid', exact: true },
    vpnOn ? { href: '/miniapp/plans', label: t.miniPlans, icon: 'globe' } : { href: '/products', label: locale === 'fa' ? 'فروشگاه' : 'Shop', icon: 'grid' },
    { href: '/miniapp/wallet', label: t.miniWallet, icon: 'wallet' },
    { href: '/miniapp/support', label: t.miniSupport, icon: 'chat' },
  ]

  const isOn = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => setSdkReady(value => value + 1)} onError={() => setSdkReady(value => value + 1)} />
      <div className="tg-app">
        <header className="tg-header">
          <Link href="/miniapp" className="tg-brand" aria-label={site.brand}>
            {site.logo ? <img className="tg-logo" src={site.logo} alt="" /> : <BrandMark />}
            <span className="tg-brand-copy"><span className="text-lg" dir="ltr">{site.brand}</span><small>{site.tagline[locale] || site.tagline.fa}</small></span>
          </Link>
          <ThemeLangControls locale={locale} theme={theme} compact />
          {phase === 'ready' && <Link href="/miniapp/notifications" className="icon-btn" aria-label={locale === 'fa' ? 'اعلان‌ها' : 'Notifications'} aria-current={pathname === '/miniapp/notifications' ? 'page' : undefined}><Icon name="bell" size={20} /><NotificationCount /></Link>}
        </header>

        <main className="tg-main">
          {phase === 'boot' && <div className="tg-loading" role="status"><BrandMark /><p>{t.loading}</p><span className="tg-loading-track" /></div>}
          {phase === 'ready' && children}
          {phase === 'auth-failed' && (
            <div className="tg-empty card">
              <div className="tile-icon mx-auto"><Icon name="shield" size={30} /></div>
              <p className="muted mb-3">{tg()?.initData ? t.miniAuthError : (locale === 'fa' ? 'نشست حساب معتبر نیست یا ارتباط با سرور برقرار نشد. دوباره وارد حساب خود شوید.' : 'Your session is no longer valid or the server could not be reached. Please sign in again.')}</p>
              <Link href="/login?next=/miniapp" className="btn btn-primary">{t.login}</Link>
            </div>
          )}
          {phase === 'needs-telegram' && (
            <div className="tg-empty card">
              <div className="tile-icon mx-auto"><Icon name="globe" size={30} /></div>
              <h2 className="font-bold mb-2">{t.miniOpenInTelegram}</h2>
              <p className="muted mb-3">{t.miniOpenInTelegramHint}</p>
              <Link href="/login?next=/miniapp" className="btn btn-ghost">{t.login}</Link>
            </div>
          )}
        </main>

        {phase === 'ready' && (
          <nav className="tg-nav" aria-label={locale === 'fa' ? 'منوی مینی‌اپ' : 'Mini app navigation'}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isOn(item.href, item.exact) ? 'page' : undefined} className={`tg-tab ${isOn(item.href, item.exact) ? 'tg-tab-on' : ''}`}>
                <span className="tg-tab-icon"><Icon name={item.icon} /></span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </>
  )
}
