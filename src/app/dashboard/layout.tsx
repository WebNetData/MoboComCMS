'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import ThemeLangControls from '@/components/ThemeLangControls'
import { getCookie } from '@/platform/browser/preferences'
import { useSite } from '@/components/site/SiteProvider'
import { PluginOutlet } from '@/plugins/registry'
import Icon from '@/components/site/Icon'
import BrandMark from '@/components/BrandMark'
import NotificationCount from '@/components/NotificationCount'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const site = useSite()
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { t, locale } = useI18n()
  // Without the VPN module the account area is about orders, wallet and VIP.
  const vpnOn = useModuleEnabled('vpn')
  const storeOn = useModuleEnabled('store')
  const gamesOn = useModuleEnabled('games')
  const communityOn = useModuleEnabled('community')
  const paywallOn = useModuleEnabled('paywall')
  const theme = getCookie('theme') || 'dark'
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (status === 'unauthenticated') window.location.href = '/login?next=/dashboard'
  }, [status])

  // Members with missing required details finish them first (admin-defined fields).
  useEffect(() => {
    if (status !== 'authenticated') return
    let active = true
    fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (active && data?.needsCompletion) window.location.replace(`/welcome?next=${encodeURIComponent(window.location.pathname)}`)
    }).catch(() => null)
    return () => { active = false }
  }, [status])

  const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: string; exact?: boolean }[] }[] = [
    {
      label: vpnOn ? (locale === 'fa' ? 'اشتراک‌ها' : 'Subscriptions') : (locale === 'fa' ? 'پیشخوان' : 'Overview'),
      items: [{ href: '/dashboard', label: vpnOn ? t.mySubs : (locale === 'fa' ? 'نمای کلی حساب' : 'Account overview'), icon: vpnOn ? 'devices' : 'grid', exact: true }],
    },
    {
      label: locale === 'fa' ? 'مالی' : 'Billing',
      items: [
        { href: '/dashboard/wallet', label: t.wallet, icon: 'wallet' },
        { href: '/dashboard/orders', label: t.myOrders, icon: 'grid' },
        { href: '/dashboard/invoices', label: t.myInvoices, icon: 'wallet' },
        ...(paywallOn ? [{ href: '/dashboard/purchases', label: locale === 'fa' ? 'خریدهای من (فایل و مقاله)' : 'My purchases', icon: 'sparkles' }] : []),
        ...(storeOn ? [{ href: '/dashboard/addresses', label: locale === 'fa' ? 'آدرس‌های ارسال' : 'Shipping addresses', icon: 'globe' }] : []),
        ...(storeOn ? [{ href: '/dashboard/gift-cards', label: locale === 'fa' ? 'کارت هدیه' : 'Gift cards', icon: 'sparkles' }, { href: '/dashboard/club', label: locale === 'fa' ? 'باشگاه مشتریان' : 'Customer club', icon: 'shield' }] : []),
      ],
    },
    ...(communityOn || gamesOn ? [{ label: locale === 'fa' ? 'پروفایل و جامعه' : 'Profile & community', items: [
      ...(communityOn ? [{ href: '/feed', label: locale === 'fa' ? 'تازه‌ها (فید)' : 'Feed', icon: 'sparkles' }, { href: '/dashboard/public-profile', label: locale === 'fa' ? 'پروفایل عمومی من' : 'My public profile', icon: 'sliders' }] : []),
      ...(gamesOn ? [{ href: '/dashboard/games', label: locale === 'fa' ? 'کتابخانهٔ بازی من' : 'My game library', icon: 'devices' }] : []),
    ] }] : []),
    {
      label: locale === 'fa' ? 'حساب و پشتیبانی' : 'Account & support',
      items: [
        { href: '/dashboard/notifications', label: locale === 'fa' ? 'اعلان‌ها' : 'Notifications', icon: 'bell' },
        { href: '/dashboard/tickets', label: t.supportCenter, icon: 'chat' },
        { href: '/dashboard/referrals', label: locale === 'fa' ? 'دعوت از دوستان' : 'Invite friends', icon: 'sparkles' },
        ...(site.publicApiEnabled ? [{ href: '/dashboard/api', label: t.apiAccess, icon: 'bolt' }] : []),
        { href: '/dashboard/profile', label: locale === 'fa' ? 'تنظیمات حساب' : 'Account settings', icon: 'sliders' },
      ],
    },
  ]

  const isAdmin = ((session as any)?.user?.role ?? (session as any)?.role) === 'ADMIN'
  const [isReseller, setIsReseller] = useState(false)
  // The session token keeps the name from sign-in; the account's current name wins.
  const [profileName, setProfileName] = useState('')
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => setProfileName(String(d?.name || ''))).catch(() => null)
  }, [status, pathname])

  // resellers get a link to their own panel
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsReseller(Boolean(d?.isReseller)))
      .catch(() => setIsReseller(false))
  }, [status])

  if (status !== 'authenticated') {
    return <div className="container py-20 text-center muted">{t.loading}</div>
  }

  const displayName = profileName || session?.user?.name || ''
  const initial = (displayName || session?.user?.email || '?').charAt(0).toUpperCase()
  const isOn = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))
  // The deepest matching menu entry names the current page in the top bar.
  const current = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
    .filter((item) => isOn(item.href, item.exact))
    .sort((a, b) => b.href.length - a.href.length)[0]

  const navLinks = (
    <>
      {NAV_GROUPS.map((group) => (
        <div className="side-group" key={group.label}>
          <div className="side-group-label">{group.label}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isOn(item.href, item.exact) ? 'page' : undefined}
              className={`side-link ${isOn(item.href, item.exact) ? 'side-link-active' : ''}`}
            >
              <span className="side-icon"><Icon name={item.icon} size={19} /></span> {item.label} {item.href === '/dashboard/notifications' && <NotificationCount />}
            </Link>
          ))}
        </div>
      ))}
      <div className="side-group side-group-rule">
        {isReseller && (
          <Link href="/reseller" className="side-link" onClick={() => setOpen(false)}>
            <span className="side-icon"><Icon name="grid" size={19} /></span> {t.resellerPanel}
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" className="side-link" onClick={() => setOpen(false)}>
            <span className="side-icon"><Icon name="shield" size={19} /></span> {t.admin}
          </Link>
        )}
        {vpnOn ? (
          <Link href="/plans" className="side-link" onClick={() => setOpen(false)}>
            <span className="side-icon"><Icon name="globe" size={19} /></span> {t.browsePlans}
          </Link>
        ) : storeOn ? (
          <Link href="/products" className="side-link" onClick={() => setOpen(false)}>
            <span className="side-icon"><Icon name="grid" size={19} /></span> {locale === 'fa' ? 'فروشگاه' : 'Shop'}
          </Link>
        ) : null}
      </div>
    </>
  )

  return (
    <div className="app-shell user-shell">
      <aside className="side">
        <Link href="/" className="side-brand">
          <span className="brand-mark"><BrandMark/></span> {site.brand}
        </Link>

        <div className="side-user">
          <span className="avatar" style={{ background: 'var(--primary)' }}>{initial}</span>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{displayName || '—'}</div>
            <div className="muted text-xs truncate" dir="ltr">{session?.user?.email}</div>
          </div>
        </div>

        <nav className="side-nav" aria-label={t.myPanel}>{navLinks}</nav>

        <div className="side-foot">
          <ThemeLangControls locale={locale} theme={theme} />
          <button onClick={() => signOut({ callbackUrl: '/' })} className="muted text-sm hover-text-danger">{t.logout}</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="mobile-bar">
          <Link href="/" className="side-brand" style={{ padding: 0 }}>
            <span className="brand-mark"><BrandMark/></span> {site.brand}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeLangControls locale={locale} theme={theme} />
            <button ref={menuButton} className="icon-btn" aria-label={locale === 'fa' ? (open ? 'بستن منو' : 'باز کردن منو') : (open ? 'Close menu' : 'Open menu')} aria-expanded={open} aria-controls="dashboard-mobile-navigation" onClick={() => setOpen((v) => !v)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button>
          </div>
        </div>
        <nav id="dashboard-mobile-navigation" className="mobile-drawer" hidden={!open} aria-label={t.myPanel}>{navLinks}<button onClick={() => signOut({ callbackUrl: '/' })} className="side-link mobile-logout">{t.logout}</button></nav>

        <header className="dash-top">
          <nav className="dash-crumbs" aria-label={locale === 'fa' ? 'مسیر صفحه' : 'Breadcrumb'}>
            <Link href="/dashboard">{locale === 'fa' ? 'حساب کاربری' : 'Account'}</Link>
            {current && current.href !== '/dashboard' && <><span aria-hidden="true">/</span><span className="dash-crumb-group">{current.group}</span><span aria-hidden="true">/</span><b aria-current="page">{current.label}</b></>}
          </nav>
          <div className="dash-top-actions">
            <Link href="/" className="dash-top-link"><Icon name="globe" size={17} /> {locale === 'fa' ? 'مشاهدهٔ سایت' : 'View site'}</Link>
            <Link href="/dashboard/notifications" className="dash-top-icon" aria-label={locale === 'fa' ? 'اعلان‌ها' : 'Notifications'}><Icon name="bell" size={19} /><NotificationCount /></Link>
            <Link href="/dashboard/profile" className="dash-top-user" aria-label={locale === 'fa' ? 'تنظیمات حساب' : 'Account settings'}><span className="avatar">{initial}</span></Link>
          </div>
        </header>
        <main className="app-main"><PluginOutlet slot="dashboard.top" site={site} locale={locale}/>{children}<PluginOutlet slot="dashboard.bottom" site={site} locale={locale}/></main>
      </div>
    </div>
  )
}
