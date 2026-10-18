'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import ThemeLangControls from '@/components/ThemeLangControls'
import { getCookie } from '@/platform/browser/preferences'
import { useSite } from '@/components/site/SiteProvider'
import Icon from '@/components/site/Icon'
import BrandLockup from '@/components/site/SiteLogo'

/**
 * Reseller (agency) panel shell. Access comes from an active Reseller contract
 * rather than an admin permission, so agencies never touch /admin.
 */
export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  const site = useSite()
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { t, locale } = useI18n()
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
  const [me, setMe] = useState<{ isReseller?: boolean; resellerActive?: boolean; resellerIsOwner?: boolean; resellerPermissions?: string[]; role?: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setMe(d)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') window.location.href = '/login?next=/reseller'
  }, [status])

  const allowed = Boolean(me?.isReseller)
  useEffect(() => {
    if (loaded && me && !allowed) window.location.href = '/dashboard'
  }, [loaded, me, allowed])

  const can = (name: string) => Boolean(me?.resellerIsOwner || me?.resellerPermissions?.includes(name) || (name === 'sales.view' && me?.resellerPermissions?.includes('sales.review')) || (name.endsWith('.view') && me?.resellerPermissions?.includes(name.replace('.view', '.manage'))))
  const NAV = [
    ...(can('accounts.manage') ? [{ href: '/reseller', label: t.resellerOverview, icon: 'grid', exact: true }] : []),
    ...(can('accounts.view') ? [{ href: '/reseller/accounts', label: t.myAccounts, icon: 'devices' }] : []),
    ...(can('offers.view') ? [{ href: '/reseller/offers', label: locale === 'fa' ? 'پلن‌ها و قیمت فروش' : 'Offers & retail prices', icon: 'grid' }] : []),
    ...(can('sales.view') ? [{ href: '/reseller/bot', label: locale === 'fa' ? 'سفارش‌های ربات' : 'Bot orders', icon: 'support' }] : []),
    ...(can('sales.view') ? [{ href: '/reseller/reports', label: locale === 'fa' ? 'گزارش فروش' : 'Sales reports', icon: 'grid' }] : []),
    ...(me?.resellerIsOwner ? [{ href: '/reseller/team', label: locale === 'fa' ? 'تیم نمایندگی' : 'Agency team', icon: 'devices' }] : []),
  ]

  useEffect(() => {
    if (loaded && me?.isReseller && !can('accounts.manage') && pathname === '/reseller' && NAV.length) window.location.replace(NAV[0].href)
  }, [loaded, me, pathname])

  if (status !== 'authenticated' || !allowed) {
    return <div className="container py-20 text-center muted">{t.loading}</div>
  }

  const initial = (session?.user?.name || session?.user?.email || '?').charAt(0).toUpperCase()
  const isOn = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))

  const navLinks = (
    <>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isOn(item.href, item.exact) ? 'page' : undefined}
          className={`side-link ${isOn(item.href, item.exact) ? 'side-link-active' : ''}`}
        >
          <span className="side-icon"><Icon name={item.icon} size={19} /></span> {item.label}
        </Link>
      ))}
      {me?.resellerIsOwner && <Link href="/dashboard/wallet" className="side-link" onClick={() => setOpen(false)}>
        <span className="side-icon"><Icon name="wallet" size={19} /></span> {t.wallet}
      </Link>}
      <Link href="/plans" className="side-link" onClick={() => setOpen(false)}>
        <span className="side-icon"><Icon name="globe" size={19} /></span> {t.browsePlans}
      </Link>
      {me?.role === 'ADMIN' && (
        <Link href="/admin" className="side-link" onClick={() => setOpen(false)}>
          <span className="side-icon"><Icon name="shield" size={19} /></span> {t.admin}
        </Link>
      )}
    </>
  )

  return (
    <div className="app-shell">
      <aside className="side">
        <Link href="/" className="side-brand">
          <BrandLockup />
        </Link>

        <div className="side-user">
          <span className="avatar" style={{ background: 'var(--primary)' }}>{session?.user?.image ? <img src={session.user.image} alt="" /> : initial}</span>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{session?.user?.name || '—'}</div>
            <div className="muted text-xs truncate" dir="ltr">{session?.user?.email}</div>
            <span className={`badge ${me?.resellerActive === false ? 'badge-red' : 'badge-purple'} mt-1`}>
              {me?.resellerActive === false ? t.resellerInactive : t.reseller}
            </span>
          </div>
        </div>

        <nav className="side-nav" aria-label={t.resellerPanel}>{navLinks}</nav>

        <div className="side-foot">
          <ThemeLangControls locale={locale} theme={theme} />
          <button onClick={() => signOut({ callbackUrl: '/' })} className="muted text-sm hover-text-danger">{t.logout}</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="mobile-bar">
          <Link href="/" className="side-brand" style={{ padding: 0 }}>
            <BrandLockup />
          </Link>
          <div className="flex items-center gap-2">
            <span className="badge badge-purple">{t.reseller}</span>
            <ThemeLangControls locale={locale} theme={theme} />
            <button ref={menuButton} className="icon-btn" aria-label={locale === 'fa' ? (open ? 'بستن منو' : 'باز کردن منو') : (open ? 'Close menu' : 'Open menu')} aria-expanded={open} aria-controls="reseller-mobile-navigation" onClick={() => setOpen((v) => !v)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button>
          </div>
        </div>
        <nav id="reseller-mobile-navigation" className="mobile-drawer" hidden={!open} aria-label={t.resellerPanel}>{navLinks}<button onClick={() => signOut({ callbackUrl: '/' })} className="side-link mobile-logout">{t.logout}</button></nav>

        <main className="app-main">{children}</main>
      </div>
    </div>
  )
}
