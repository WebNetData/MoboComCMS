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
import Link from '@/components/AppLink'
import { usePathname, useRouter } from '@/platform/routing/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useSite } from '@/components/site/SiteProvider'
import Icon from '@/components/site/Icon'
import BrandMark from '@/components/BrandMark'
import ThemeLangControls from '@/components/ThemeLangControls'
import NotificationCount from '@/components/NotificationCount'
import { useI18n } from '@/i18n/LocaleProvider'

import { tg, applyTelegramChrome, onTelegramEvent, selectionHaptic, telegramBackButton } from './telegram-client'
import { miniAppParent, miniAppTab } from '@/modules/site/domain/miniapp-navigation'

export default function MiniAppShell({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [theme, setTheme] = useState('dark')
  const pathname = usePathname()
  const { status, update } = useSession()
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
    try { app?.ready?.(); app?.expand?.() } catch { /* Old clients keep the ordinary page. */ }


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
      await update().catch(() => undefined)
      setPhase('ready')
      return
    }
    signing.current = false
    setPhase('auth-failed')
  }, [status, sdkReady, update])

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



  useEffect(() => {
    if (!sdkReady || phase !== 'ready') return
    return telegramBackButton(pathname !== '/miniapp', () => router.push(miniAppParent(pathname)))
  }, [sdkReady, phase, pathname, router])

  const fa = locale === 'fa'
  const NAV = [
    { key: 'home', href: '/miniapp', label: t.miniHome, icon: 'home' },
    { key: 'explore', href: '/miniapp/explore', label: fa ? 'کشف کنید' : 'Explore', icon: 'grid' },
    { key: 'library', href: '/miniapp/library', label: fa ? 'کتابخانه' : 'Library', icon: 'bookmark' },
    { key: 'wallet', href: '/miniapp/wallet', label: t.miniWallet, icon: 'wallet' },
    { key: 'account', href: '/miniapp/account', label: fa ? 'حساب من' : 'Account', icon: 'user' },
  ]
  const activeTab = miniAppTab(pathname)

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

        <main className="tg-main" id="miniapp-main">
          {phase === 'ready' && pathname !== '/miniapp' && <Link href={miniAppParent(pathname)} className="tg-back"><Icon name="arrow" size={16} />{fa ? 'بازگشت' : 'Back'}</Link>}
          {phase === 'boot' && <div className="tg-loading" role="status"><BrandMark /><p>{t.loading}</p><span className="tg-loading-track" /></div>}
          {phase === 'ready' && children}
          {phase === 'auth-failed' && (
            <div className="tg-empty card">
              <div className="tile-icon mx-auto"><Icon name="shield" size={30} /></div>
              <p className="muted mb-3">{tg()?.initData ? t.miniAuthError : (locale === 'fa' ? 'نشست حساب معتبر نیست یا ارتباط با سرور برقرار نشد. دوباره وارد حساب خود شوید.' : 'Your session is no longer valid or the server could not be reached. Please sign in again.')}</p>
              <Link href="/login?next=/miniapp" className="btn btn-primary">{t.login}</Link>
              <button type="button" className="btn btn-ghost" onClick={() => { verified.current = ''; setSdkReady(value => value + 1) }}>{fa ? 'تلاش دوباره' : 'Try again'}</button>
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
              <Link key={item.href} href={item.href} onClick={() => { if (activeTab !== item.key) selectionHaptic() }} aria-current={activeTab === item.key ? 'page' : undefined} className={`tg-tab ${activeTab === item.key ? 'tg-tab-on' : ''}`}>
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
