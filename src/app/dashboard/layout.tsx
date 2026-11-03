'use client'

import '../account-design.css'
import Spotlight from './Spotlight'
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
import BrandLockup from '@/components/site/SiteLogo'
import NotificationCount from '@/components/NotificationCount'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import ShellNav, { useShellGroups, type ShellGroup } from '@/components/shell/ShellNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const site = useSite()
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { t, locale } = useI18n()
  // Without the VPN module the account area is about orders, wallet and VIP.
  const vpnOn = useModuleEnabled('vpn')
  const storeOn = useModuleEnabled('store')
  const gamesOn = useModuleEnabled('games')
  const musicOn = useModuleEnabled('music')
  const promptsOn = useModuleEnabled('prompt-master')
  const reviewsOn = useModuleEnabled('reviews')
  const journalOn = useModuleEnabled('journal')
  const adsOn = useModuleEnabled('ads')
  const repoOn = useModuleEnabled('repository')
  const [hasLicenses, setHasLicenses] = useState(false)
  // The customer club is offered only while the shop runs it.
  const [clubOn, setClubOn] = useState(false)
  const communityOn = useModuleEnabled('community')
  const paywallOn = useModuleEnabled('paywall')
  const marketplaceOn = useModuleEnabled('marketplace')
  const theme = getCookie('theme') || 'dark'
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const groupsState = useShellGroups('mobocom.account.menu')

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

  // The licenses page is offered only where the vendor role is on and this user owns a license.
  useEffect(() => {
    if (status !== 'authenticated' || !repoOn) return
    let active = true
    fetch('/api/repo/mine', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (active && d?.licenses?.length) setHasLicenses(true) }).catch(() => null)
    return () => { active = false }
  }, [status, repoOn])

  useEffect(() => {
    if (status !== 'authenticated' || !storeOn) return
    let active = true
    fetch('/api/store/club', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (active) setClubOn(Boolean(d?.enabled)) }).catch(() => null)
    return () => { active = false }
  }, [status, storeOn])

  useEffect(() => {
    if (status === 'unauthenticated') window.location.href = '/login?next=/dashboard'
  }, [status])

  // Members with missing required details finish them first (admin-defined fields).
  useEffect(() => {
    if (status !== 'authenticated') return
    let active = true
    fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (active && data?.needsCompletion) window.location.replace(`/welcome?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }).catch(() => null)
    return () => { active = false }
  }, [status])

  const L = (fa: string, en: string) => (locale === 'fa' ? fa : en)
  // The account menu, by what a member comes here to do: buy and pay, their own things, people, tools, help.
  // Every entry keeps its address and its module switch; only the grouping and the order are presentation.
  const NAV_GROUPS: ShellGroup[] = ([
    { id: 'home', flat: true, title: vpnOn ? L('اشتراک‌ها', 'Subscriptions') : L('پیشخوان', 'Overview'), icon: vpnOn ? 'devices' : 'home',
      items: [{ href: '/dashboard', label: vpnOn ? t.mySubs : L('پیشخوان', 'Overview'), icon: vpnOn ? 'devices' : 'home', exact: true }] },
    { id: 'shopping', caption: L('حساب من', 'My account'), title: L('خرید و پرداخت', 'Orders & billing'), icon: 'bag', items: [
      { href: '/dashboard/orders', label: t.myOrders, icon: 'cart' },
      { href: '/dashboard/invoices', label: t.myInvoices, icon: 'receipt' },
      { href: '/dashboard/wallet', label: t.wallet, icon: 'wallet' },
      { href: '/dashboard/requests', label: L('درخواست‌های من', 'My requests'), icon: 'receipt' },
      ...(paywallOn ? [{ href: '/dashboard/purchases', label: L('فایل‌ها و مقاله‌های خریده', 'Bought files & articles'), icon: 'lock' }] : []),
      ...(storeOn ? [{ href: '/dashboard/addresses', label: L('آدرس‌های ارسال', 'Shipping addresses'), icon: 'pin' }, { href: '/dashboard/gift-cards', label: L('کارت هدیه', 'Gift cards'), icon: 'gift' }] : []),
      ...(storeOn && clubOn ? [{ href: '/dashboard/club', label: L('باشگاه مشتریان', 'Customer club'), icon: 'crown' }] : []),
      ...(repoOn && hasLicenses ? [{ href: '/dashboard/licenses', label: L('لایسنس‌های من', 'My licenses'), icon: 'key' }] : []),
    ] },
    { id: 'mine', title: L('محتوای من', 'My things'), icon: 'bookmark', items: [
      ...(gamesOn || musicOn || reviewsOn || promptsOn ? [{ href: '/dashboard/library', label: L('کتابخانهٔ من', 'My library'), icon: 'book' }] : []),
      ...(promptsOn ? [{ href: '/dashboard/prompts', label: L('پرامپت مستر من', 'My Prompt Master'), icon: 'sparkles' }] : []),
      ...(gamesOn ? [{ href: '/dashboard/games', label: L('کتابخانهٔ بازی', 'Game library'), icon: 'gamepad' }] : []),
      { href: '/dashboard/collections', label: L('مجموعه‌های من', 'My collections'), icon: 'folder' },
      ...(reviewsOn || storeOn || journalOn ? [{ href: '/dashboard/reviews', label: L('نظرهای من', 'My reviews'), icon: 'star' }] : []),
      { href: '/dashboard/recent', label: L('اخیراً مشاهده‌شده', 'Recently viewed'), icon: 'clock' },
    ] },
    { id: 'people', title: L('جامعه', 'Community'), icon: 'users', items: [
      ...(communityOn ? [{ href: '/feed', label: L('تازه‌ها (فید)', 'Feed'), icon: 'rss' }] : []),
      { href: '/dashboard/public-profile', label: L('تصویر و پروفایل من', 'My picture & profile'), icon: 'user' },
      { href: '/dashboard/referrals', label: L('دعوت از دوستان', 'Invite friends'), icon: 'link' },
    ] },
    { id: 'tools', title: L('ابزارها', 'Tools'), icon: 'bolt', items: [
      ...(adsOn ? [{ href: '/dashboard/ads', label: L('تبلیغات من', 'My advertising'), icon: 'megaphone' }] : []),
      ...(site.publicApiEnabled ? [{ href: '/dashboard/api', label: t.apiAccess, icon: 'code' }] : []),
    ] },
    { id: 'support', caption: L('پشتیبانی و تنظیمات', 'Support & settings'), title: L('پیام‌ها و پشتیبانی', 'Messages & support'), icon: 'lifebuoy', items: [
      { href: '/dashboard/notifications', label: L('اعلان‌ها', 'Notifications'), icon: 'bell', badge: <NotificationCount /> },
      { href: '/dashboard/tickets', label: t.supportCenter, icon: 'ticket' },
    ] },
    { id: 'settings', flat: true, title: L('تنظیمات حساب', 'Account settings'), icon: 'sliders', items: [{ href: '/dashboard/profile', label: L('تنظیمات حساب', 'Account settings'), icon: 'sliders' }] },
  ] as ShellGroup[]).filter((group) => group.items.length)

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

  // Refreshing the session must not discard an editor's local draft.
  if (!session) {
    return <div className="container py-20 text-center muted">{t.loading}</div>
  }

  const displayName = profileName || session?.user?.name || ''
  const initial = (displayName || session?.user?.email || '?').charAt(0).toUpperCase()
  const isOn = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))
  // The deepest matching menu entry names the current page in the top bar.
  const current = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.flat ? '' : group.title })))
    .filter((item) => isOn(item.href, item.exact))
    .sort((a, b) => b.href.length - a.href.length)[0]

  // Ways out of the account area: the panels this member also has, and the shop.
  const OUTSIDE = ['/seller', '/reseller', '/admin', '/plans', '/products']
  const shortcuts: ShellGroup = { id: 'shortcuts', caption: L('میان‌برها', 'Shortcuts'), title: L('پنل‌های دیگر', 'Other panels'), icon: 'external', items: [
    ...(marketplaceOn && storeOn ? [{ href: '/seller', label: L('پنل فروشندگی', 'Seller panel'), icon: 'store' }] : []),
    ...(isReseller ? [{ href: '/reseller', label: t.resellerPanel, icon: 'users' }] : []),
    ...(isAdmin ? [{ href: '/admin', label: t.admin, icon: 'shield' }] : []),
    ...(vpnOn ? [{ href: '/plans', label: t.browsePlans, icon: 'globe' }] : storeOn ? [{ href: '/products', label: L('فروشگاه', 'Shop'), icon: 'bag' }] : []),
  ] }
  const navLinks = <ShellNav groups={[...NAV_GROUPS, shortcuts]} isOn={(href, exact) => !OUTSIDE.includes(href) && isOn(href, exact)} choice={groupsState.choice} onToggle={groupsState.toggle} onNavigate={() => setOpen(false)} openByDefault itemIcons shown={open} />

  return (
    <div className="app-shell user-shell member-shell">
      <Spotlight />
      <aside className="side">
        <Link href="/" className="side-brand">
          <BrandLockup />
        </Link>

        <nav className="side-nav" aria-label={t.myPanel}>{navLinks}</nav>

        <div className="side-foot ws-foot">
          <Link href="/dashboard/profile" className="side-user">
            <span className="avatar" style={{ background: 'var(--primary)' }}>{session?.user?.image ? <img src={session.user.image} alt="" /> : initial}</span>
            <span className="min-w-0 ws-who">
              <span className="font-semibold text-sm truncate">{displayName || '—'}</span>
              <span className="muted text-xs truncate" dir="ltr">{session?.user?.email}</span>
            </span>
          </Link>
          <button type="button" onClick={() => signOut({ callbackUrl: '/' })} className="ws-out" aria-label={t.logout} title={t.logout}><Icon name="logout" size={18} /></button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="mobile-bar">
          <Link href="/" className="side-brand" style={{ padding: 0 }}>
            <BrandLockup />
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
            {current && current.href !== '/dashboard' && <>{current.group && <><span aria-hidden="true">/</span><span className="dash-crumb-group">{current.group}</span></>}<span aria-hidden="true">/</span><b aria-current="page">{current.label}</b></>}
          </nav>
          <div className="dash-top-actions">
            <Link href="/" className="dash-top-link"><Icon name="globe" size={17} /> {locale === 'fa' ? 'مشاهدهٔ سایت' : 'View site'}</Link>
            <ThemeLangControls locale={locale} theme={theme} />
            <Link href="/dashboard/notifications" className="dash-top-icon" aria-label={locale === 'fa' ? 'اعلان‌ها' : 'Notifications'}><Icon name="bell" size={19} /><NotificationCount /></Link>
            <Link href="/dashboard/profile" className="dash-top-user" aria-label={locale === 'fa' ? 'تنظیمات حساب' : 'Account settings'}><span className="avatar">{session?.user?.image ? <img src={session.user.image} alt="" /> : initial}</span></Link>
          </div>
        </header>
        <main className="app-main"><PluginOutlet slot="dashboard.top" site={site} locale={locale}/>{children}<PluginOutlet slot="dashboard.bottom" site={site} locale={locale}/></main>
      </div>
    </div>
  )
}
