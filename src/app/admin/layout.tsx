'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from '@/components/AppLink'
import { usePathname, useSearchParams } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import ThemeLangControls from '@/components/ThemeLangControls'
import { getCookie } from '@/platform/browser/preferences'
import { useSite } from '@/components/site/SiteProvider'
import Icon from '@/components/site/Icon'
import BrandMark from '@/components/BrandMark'

interface NavItem {
  href: string
  label: string
  icon: string
  perm?: string | string[]
  exact?: boolean
}

interface NavGroup {
  title: string
  icon?: string
  items: NavItem[]
}
type SectionMenu = { id: string; title: string; titleEn: string; icon: string; items: { href: string; label: string; labelEn?: string; icon?: string; permissions?: string[]; exact?: boolean }[] }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const site = useSite()
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const search = useSearchParams()
  const { t, locale } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [navQuery, setNavQuery] = useState('')
  useEffect(() => { setExpanded({}); setNavQuery('') }, [pathname])
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
    if (status === 'unauthenticated') window.location.href = '/login?next=/admin'
  }, [status])

  const s: any = session as any
  const [me, setMe] = useState<{ role: string; roleId: number | null; permissions: string[] | null } | null>(null)
  const [extensionNav, setExtensionNav] = useState<NavItem[]>([])
  const [sectionNav, setSectionNav] = useState<NavGroup[]>([])
  const [disabledPaths, setDisabledPaths] = useState<string[]>([])
  const [navVersion, setNavVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setNavVersion(v => v + 1)
    window.addEventListener('happ:modules-changed', refresh)
    return () => window.removeEventListener('happ:modules-changed', refresh)
  }, [])

  // permissions are resolved server-side so role edits apply without re-login
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/extensions/navigation').then(r => r.ok ? r.json() : null).then(d => {
      setExtensionNav((d?.items || []).map((item: any) => ({ href: item.href, label: locale === 'fa' ? item.label : item.labelEn || item.label, icon: item.icon || 'grid', perm: item.permission })))
      setSectionNav((Array.isArray(d?.sections) ? d.sections as SectionMenu[] : []).map((menu) => ({
        title: locale === 'fa' ? menu.title : menu.titleEn || menu.title,
        icon: menu.icon,
        items: menu.items.map((item) => ({ href: item.href, label: locale === 'fa' ? item.label : item.labelEn || item.label, icon: item.icon || 'grid', perm: item.permissions && item.permissions.length ? [...item.permissions] : undefined, exact: item.exact })),
      })))
      setDisabledPaths(Array.isArray(d?.disabledPaths) ? d.disabledPaths.filter((p: unknown) => typeof p === 'string') : [])
    }).catch(() => setExtensionNav([]))
    fetch('/api/me')
      .then((r) => {
        if (r.status === 401) {
          void signOut({ callbackUrl: '/login?next=/admin' })
          return null
        }
        return r.ok ? r.json() : null
      })
      .then((data) => {
        // Staff 2-step policy: set it up first (the admin API refuses until then).
        if (data?.needsTwoFactor) { window.location.href = '/dashboard/profile?require2fa=1#two-factor'; return }
        setMe(data)
      })
      .catch(() => setMe(null))
  }, [locale, status, navVersion])

  const role = me?.role ?? s?.user?.role ?? s?.role
  const perms: string[] | null = me ? me.permissions : s?.user?.permissions ?? s?.permissions ?? null
  const roleId = me ? me.roleId : s?.user?.roleId ?? s?.roleId ?? null
  const isAdmin = role === 'ADMIN'

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) window.location.href = '/dashboard'
  }, [status, isAdmin])

  const moduleOff = (href: string) => disabledPaths.some(prefix => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`))
  function allowed(perm?: string | string[]) {
    if (!perm) return true
    if (roleId == null) return true // legacy super admin
    return (Array.isArray(perm) ? perm : [perm]).some(p => !!perms?.includes(p))
  }

  const L = (fa: string, en: string) => locale === 'fa' ? fa : en
  const GROUPS: NavGroup[] = [
    { title: t.overview, items: [{ href: '/admin', label: t.dashboard, icon: 'grid', exact: true }, { href: '/admin/analytics', label: L('آمار بازدید و فروش', 'Analytics'), icon: 'sliders', perm: ['analytics.view', 'dashboard.view'] }] },
    // Every feature module brings its own group (declared in its manifest).
    ...sectionNav,
    { title: L('وب‌سایت و محتوا', 'Website & content'), items: [
      { href: '/admin/site-management', label: L('مرکز مدیریت سایت', 'Website management'), icon: 'grid', perm: 'settings.manage' },
      { href: '/admin/theme-builder', label: L('سازندهٔ قالب (هدر، فوتر، صفحه، پست، محصول)', 'Theme builder'), icon: 'sparkles', perm: 'cms.pages' },
      { href: '/admin/studio', label: L('صفحه اصلی، ظاهر و منوها', 'Homepage, design & navigation'), icon: 'sliders', perm: 'settings.manage' },
      { href: '/admin/mega-menu', label: L('منو و مگامنوی بخش‌ها', 'Section menus'), icon: 'grid', perm: 'settings.manage' },
      { href: '/admin/seo', label: L('مرکز سئو', 'SEO center'), icon: 'globe', perm: 'settings.manage' },
      { href: '/admin/trust-seals', label: L('نمادهای اعتماد (اینماد، ساماندهی)', 'Trust seals'), icon: 'shield', perm: 'settings.manage' },
      { href: '/admin/ai', label: L('دستیار هوش مصنوعی', 'AI assistant'), icon: 'sparkles', perm: ['cms.posts', 'cms.products', 'forum.moderate', 'settings.manage'] },
      { href: '/admin/email', label: L('ایمیل سایت (جیمیل / SMTP)', 'Site email (Gmail / SMTP)'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/newsletter', label: L('خبرنامه و کمپین ایمیلی', 'Newsletter & campaigns'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/images', label: L('بهینه‌سازی تصاویر', 'Image optimization'), icon: 'sparkles', perm: 'settings.manage' },
      { href: '/admin/monitoring', label: L('پایش سرعت و سلامت سرور', 'Performance & health'), icon: 'shield', perm: 'settings.manage' },
      { href: '/admin/sms', label: L('پنل پیامک (IPPanel)', 'SMS (IPPanel)'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/pages', label: t.pageBuilder, icon: 'grid', perm: 'cms.pages' },
      { href: '/admin/forms', label: L('فرم‌ها و پاسخ‌ها', 'Forms & submissions'), icon: 'chat', perm: 'cms.pages' },
      { href: '/admin/copyright', label: L('گزارش‌های حق نشر', 'Copyright reports'), icon: 'shield', perm: ['copyright.manage', 'settings.manage'] },
      { href: '/admin/locations', label: t.mapLocations, icon: 'globe', perm: 'settings.manage' },
    ] },
    { title: L('ابزارهای مشترک محتوا', 'Shared content tools'), items: [
      { href: '/admin/sections', label: L('همهٔ بخش‌ها و آدرس‌ها', 'All sections & addresses'), icon: 'grid', perm: 'settings.manage', exact: true },
      { href: '/admin/taxonomy', label: L('دسته‌بندی و زیردسته‌ها', 'Categories'), icon: 'grid', perm: ['software.manage', 'games.manage', 'music.manage', 'cinema.manage', 'cms.posts'] },
      { href: '/admin/downloads', label: L('محافظت از لینک دانلود', 'Download protection'), icon: 'shield', perm: ['downloads.manage', 'settings.manage'] },
      { href: '/admin/reviews', label: L('امتیازها و نظرها', 'Ratings & reviews'), icon: 'sparkles', perm: ['reviews.moderate', 'cms.posts'] },
    ] },
    { title: L('سرویس VPN', 'VPN service'), items: [
      { href: '/admin/plans', label: t.plansAdmin, icon: 'globe', perm: 'plans.manage' },
      { href: '/admin/service-offers', label: L('فروش حجمی', 'Volume offers'), icon: 'grid', perm: 'plans.manage' },
      { href: '/admin/trial', label: L('اکانت آزمایشی', 'Trial accounts'), icon: 'sparkles', perm: 'plans.manage' },
      { href: '/admin/subscriptions', label: t.subscriptions, icon: 'devices', perm: 'subs.manage' },
      { href: '/admin/panels', label: t.panels, icon: 'shield', perm: 'panels.manage' },
    ] },
    // Discounts and referrals serve the shop, VIP and VPN alike.
    { title: L('بازاریابی', 'Marketing'), items: [
      { href: '/admin/promotions', label: L('کدهای تخفیف', 'Discount codes'), icon: 'bolt', perm: 'plans.manage' },
      { href: '/admin/referrals', label: L('سامانه معرفی', 'Referrals'), icon: 'devices', perm: 'settings.manage' },
      { href: '/admin/social', label: L('انتشار در تلگرام و اینستاگرام', 'Social auto-publish'), icon: 'chat', perm: ['social.manage', 'settings.manage'] },
      { href: '/admin/push', label: L('اعلان مرورگر', 'Web push'), icon: 'bolt', perm: ['push.manage', 'settings.manage'] },
    ] },
    { title: L('کاربران و پشتیبانی', 'Customers & support'), items: [
      { href: '/admin/users', label: t.customers, icon: 'devices', perm: 'users.manage' },
      { href: '/admin/profile-fields', label: L('فیلدهای ثبت‌نام و تکمیل مشخصات', 'Registration fields'), icon: 'sliders', perm: ['users.manage', 'settings.manage'] },
      { href: '/admin/security', label: L('امنیت ورود و بازیابی رمز', 'Sign-in security'), icon: 'shield', perm: 'settings.manage' },
      { href: '/admin/resellers', label: t.resellers, icon: 'globe', perm: 'resellers.manage' },
      { href: '/admin/reseller-sales', label: L('فروش نمایندگان', 'Reseller sales'), icon: 'wallet', perm: 'resellers.manage' },
      { href: '/admin/tickets', label: t.tickets, icon: 'chat', perm: 'tickets.handle' },
      { href: '/admin/ticket-departments', label: L('دپارتمان‌های تیکت', 'Ticket departments'), icon: 'sliders', perm: 'tickets.departments.manage' },
      { href: '/admin/incidents', label: L('وضعیت و اختلال سرویس', 'Service incidents'), icon: 'shield', perm: 'tickets.handle' },
    ] },
    { title: t.finance, items: [
      { href: '/admin/finance', label: t.financeAdmin, icon: 'wallet', perm: 'finance.manage' },
      { href: '/admin/orders', label: t.orders, icon: 'grid', perm: 'orders.manage' },
      { href: '/admin/operations', label: L('مرکز عملیات سفارش', 'Order operations'), icon: 'shield', perm: 'orders.manage' },
      { href: '/admin/invoices', label: t.invoicesAdmin, icon: 'wallet', perm: 'invoices.manage' },
      { href: '/admin/invoice-profile', label: L('مشخصات فروشنده در صورتحساب رسمی', 'Official invoice profile'), icon: 'sliders', perm: ['invoices.manage', 'settings.manage'] },
      { href: '/admin/payments', label: t.ledger, icon: 'wallet', perm: 'finance.manage' },
      { href: '/admin/expenses', label: t.expensesAdmin, icon: 'wallet', perm: 'finance.manage' },
      { href: '/admin/gateways', label: t.gatewaysAdmin, icon: 'wallet', perm: 'gateways.manage' },
      { href: '/admin/receipts', label: L('رسیدهای کارت به کارت', 'Transfer receipts'), icon: 'wallet', perm: 'invoices.manage' },
      { href: '/admin/bank-accounts', label: L('حساب‌های بانکی', 'Bank accounts'), icon: 'wallet', perm: 'gateways.manage' },
    ] },
    { title: L('اتصال‌ها و افزونه‌ها', 'Integrations'), items: [
      { href: '/admin/telegram', label: L('ربات و مینی‌اپ', 'Telegram & Mini App'), icon: 'chat', perm: 'settings.manage' },
      { href: '/admin/connection-guide', label: L('راهنمای اتصال', 'Connection guide'), icon: 'devices', perm: 'settings.manage' },
      { href: '/admin/happ', label: L('اتصال Happ', 'Happ connection'), icon: 'devices', perm: 'settings.manage' },
      { href: '/admin/extensions', label: L('افزونه‌ها و ماژول‌ها', 'Extensions & modules'), icon: 'grid', perm: 'settings.manage', exact: true },
      { href: '/admin/extensions/editor', label: L('ویرایشگر افزونه و قالب', 'Plugin & theme editor'), icon: 'sliders', perm: 'settings.manage' },
      ...extensionNav,
    ] },
    { title: L('تنظیمات و دسترسی‌ها', 'Settings & access'), items: [
      { href: '/admin/settings', label: L('تنظیمات عمومی و امکانات', 'General settings & features'), icon: 'sliders', perm: 'settings.manage' },
      { href: '/admin/roles', label: t.rolesPermissions, icon: 'shield', perm: 'roles.manage' },
      { href: '/admin/audit', label: L('گزارش فعالیت‌ها', 'Audit log'), icon: 'sliders', perm: 'audit.view' },
    ] },
  ]

  if (status !== 'authenticated' || !isAdmin) {
    return <div className="container py-20 text-center muted">{t.loading}</div>
  }

  const initial = (session?.user?.name || session?.user?.email || '?').charAt(0).toUpperCase()
  const isOn = (href: string, exact?: boolean) => {
    const [path, query] = href.split('?')
    if (query) return pathname === path && new URLSearchParams(query).get('tab') === search.get('tab') && (new URLSearchParams(query).get('tax') ?? search.get('tax')) === search.get('tax')
    if (path === pathname && search.get('tab') && sectionNav.some((group) => group.items.some((item) => item.href.startsWith(`${path}?`)))) return false
    return exact ? pathname === path : pathname.startsWith(path)
  }

  const nav = <>
    <label className="admin-nav-search"><span className="sr-only">{L('جست‌وجوی بخش مدیریت', 'Search admin sections')}</span><input type="search" className="input" value={navQuery} placeholder={L('جست‌وجوی بخش…', 'Find a section…')} onChange={e => setNavQuery(e.target.value)} /></label>
    {GROUPS.map(group => {
      const items = group.items.filter(item => allowed(item.perm) && !moduleOff(item.href) && (!navQuery.trim() || (item.label + ' ' + group.title).toLowerCase().includes(navQuery.trim().toLowerCase())))
      if (!items.length) return null
      const active = items.some(item => isOn(item.href, item.exact))
      const groupOpen = !!navQuery.trim() || (expanded[group.title] ?? active)
      if (items.length === 1 && items[0].href === '/admin') return <Link key="overview" href="/admin" onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={`side-link ${active ? 'side-link-active' : ''}`}><Icon name="grid" size={19} />{t.dashboard}</Link>
      return <div className={`admin-nav-group ${active ? 'has-active' : ''}`} key={group.title}>
        <button type="button" className="admin-nav-toggle" aria-expanded={groupOpen} onClick={() => setExpanded(current => ({ ...current, [group.title]: !groupOpen }))}><Icon name={group.icon || items[0].icon} size={18}/><span>{group.title}</span><svg className="admin-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
        <div className="admin-nav-items" hidden={!groupOpen}>{items.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={isOn(item.href, item.exact) ? 'page' : undefined} className={`side-link ${isOn(item.href, item.exact) ? 'side-link-active' : ''}`}>{item.label}</Link>)}</div>
      </div>
    })}
  </>

  return (
    <div className="app-shell admin-shell">
      <aside className="side">
        <Link href="/admin" className="side-brand">
          <span className="brand-mark"><BrandMark/></span> {site.brand} <span className="badge badge-purple">{t.admin}</span>
        </Link>

        <div className="side-user">
          <span className="avatar" style={{ background: 'var(--primary)' }}>{initial}</span>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{session?.user?.name || '—'}</div>
            <div className="muted text-xs truncate" dir="ltr">{session?.user?.email}</div>
          </div>
        </div>

        <nav className="side-nav" aria-label={t.admin}>{nav}</nav>

        <div className="side-foot">
          <ThemeLangControls locale={locale} theme={theme} />
          <button onClick={() => signOut({ callbackUrl: '/' })} className="muted text-sm hover-text-danger">{t.logout}</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="mobile-bar">
          <Link href="/admin" className="side-brand" style={{ padding: 0 }}>
            <span className="brand-mark"><BrandMark/></span> <span className="badge badge-purple">{t.admin}</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeLangControls locale={locale} theme={theme} />
            <button ref={menuButton} className="icon-btn" aria-label={locale === 'fa' ? (open ? 'بستن منو' : 'باز کردن منو') : (open ? 'Close menu' : 'Open menu')} aria-expanded={open} aria-controls="admin-mobile-navigation" onClick={() => setOpen((v) => !v)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button>
          </div>
        </div>
        <nav id="admin-mobile-navigation" className="mobile-drawer" hidden={!open} aria-label={t.admin}>{nav}<button onClick={() => signOut({ callbackUrl: '/' })} className="side-link mobile-logout">{t.logout}</button></nav>

        <main className="app-main">{moduleOff(pathname) ? <div className="card module-off-card">
          <span className="section-kicker">MODULE DISABLED</span>
          <h1 className="h2">{L('این بخش غیرفعال است', 'This section is turned off')}</h1>
          <p className="muted">{L('ماژول مربوط به این صفحه در «افزونه‌ها و ماژول‌ها» خاموش شده است. داده‌ها حذف نشده‌اند و با فعال‌سازی دوباره برمی‌گردند.', 'Its feature module is disabled in Extensions & modules. Nothing was deleted — turning it back on restores everything.')}</p>
          <Link className="btn btn-primary" href="/admin/extensions">{L('مدیریت ماژول‌ها', 'Manage modules')}</Link>
        </div> : children}</main>
      </div>
    </div>
  )
}
