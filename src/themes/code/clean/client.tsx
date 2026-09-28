'use client'

import Link from '@/platform/routing/Link'
import { usePathname } from '@/platform/routing/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ThemeLangControls, ThemePluginOutlet, useThemeI18n, useThemeSession, useThemeSite } from '@/themes/sdk/client'
import type { ThemeClientModule, ThemeFooterProps, ThemeHeaderProps } from '@/themes/types'
import CleanIcon from './icons'

type LocalText = { fa: string; en: string; [locale: string]: string }
const tx = (value: LocalText, locale: string) => value[locale] || value[locale.split('-')[0]] || value.en || value.fa

function Brand() {
  const site = useThemeSite()
  const { locale } = useThemeI18n()
  return <Link href="/" className="cl-brand" aria-label={site.brand}>
    {site.logo ? <img src={site.logo} alt="" className="cl-logo"/> : <span className="cl-mark" aria-hidden="true">{site.brand.slice(0, 1)}</span>}
    <span className="cl-brand-copy"><strong dir="ltr">{site.brand}</strong><small>{tx(site.tagline, locale)}</small></span>
  </Link>
}

function CleanHeader({ theme, navPages, breadcrumbs }: ThemeHeaderProps) {
  const { data: session } = useThemeSession()
  const { locale } = useThemeI18n()
  const site = useThemeSite()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  const links = useMemo(() => {
    const items = [...site.navigation.map(item => ({ href: item.href, label: tx(item.label, locale) })), ...(navPages || []).map(page => ({ href: `/p/${page.slug}`, label: locale === 'fa' ? page.title : page.titleEn || page.title }))]
    return items.filter((item, index) => items.findIndex(other => other.href === item.href) === index)
  }, [locale, navPages, site.navigation])
  const isOn = (href: string) => !href.includes('#') && (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return <>
    <a className="cl-skip" href="#main-content">{L('رفتن به محتوای اصلی', 'Skip to content')}</a>
    <ThemePluginOutlet slot="site.before-header" site={site} locale={locale}/>
    <header className="site-header cl-header">
      <div className="cl-container cl-header-bar">
        <Brand/>
        <nav className="cl-nav" aria-label={L('ناوبری اصلی', 'Primary navigation')}>{links.map(link => <Link key={link.href} href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>)}</nav>
        <div className="cl-header-actions">
          <ThemeLangControls locale={locale} theme={theme} compact/>
          {!session && <Link href="/login" className="cl-header-login">{L('ورود', 'Log in')}</Link>}
          <Link href={session ? '/dashboard' : '/register'} className="cl-btn cl-btn-primary cl-btn-sm">{session ? L('حساب من', 'My account') : L('شروع کنید', 'Get started')}</Link>
          <button type="button" className="cl-menu-button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="cl-mobile-nav" aria-label={open ? L('بستن منو', 'Close menu') : L('باز کردن منو', 'Open menu')}><CleanIcon name={open ? 'close' : 'menu'} size={20}/></button>
        </div>
      </div>
      {open && <nav id="cl-mobile-nav" className="cl-container cl-mobile-nav" aria-label={L('ناوبری موبایل', 'Mobile navigation')}>
        {links.map(link => <Link key={link.href} href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>)}
        {!session && <Link href="/login">{L('ورود به حساب', 'Log in')}</Link>}
      </nav>}
      {breadcrumbs?.length ? <nav className="cl-container cl-breadcrumbs" aria-label={L('مسیر صفحه', 'Breadcrumb')}>{breadcrumbs.map((item, index) => <span key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <strong aria-current="page">{item.label}</strong>}{index < breadcrumbs.length - 1 && <span aria-hidden="true"> / </span>}</span>)}</nav> : null}
    </header>
    <ThemePluginOutlet slot="site.after-header" site={site} locale={locale}/>
  </>
}

function CleanFooter({ navPages }: ThemeFooterProps) {
  const { locale } = useThemeI18n()
  const site = useThemeSite()
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  return <>
    <ThemePluginOutlet slot="site.before-footer" site={site} locale={locale}/>
    <footer className="site-footer cl-footer">
      <div className="cl-container cl-footer-grid">
        <div className="cl-footer-brand"><Brand/><p>{tx(site.copyright, locale)}</p></div>
        <nav aria-label={L('کشف کنید', 'Explore')}><h3>{L('کشف کنید', 'Explore')}</h3>{site.navigation.map(item => <Link key={item.href} href={item.href}>{tx(item.label, locale)}</Link>)}</nav>
        <nav aria-label={L('منابع', 'Resources')}><h3>{L('منابع', 'Resources')}</h3>{site.footer.map(item => <Link key={item.href} href={item.href}>{tx(item.label, locale)}</Link>)}{navPages?.map(page => <Link key={page.slug} href={`/p/${page.slug}`}>{locale === 'fa' ? page.title : page.titleEn || page.title}</Link>)}</nav>
        <nav aria-label={L('حساب شما', 'Your account')}><h3>{L('حساب شما', 'Your account')}</h3><Link href="/dashboard">{L('اشتراک‌های من', 'My subscriptions')}</Link><Link href="/dashboard/wallet">{L('کیف پول', 'Wallet')}</Link><Link href="/dashboard/tickets">{L('پشتیبانی', 'Support')}</Link><Link href="/miniapp">{L('نسخه مینی‌اپ', 'Mini app view')}</Link></nav>
      </div>
      <div className="cl-container cl-footer-bottom"><span dir="ltr">© {new Date().getFullYear()} {site.brand}</span><span>{tx(site.tagline, locale)}</span></div>
    </footer>
    <ThemePluginOutlet slot="site.after-footer" site={site} locale={locale}/>
  </>
}

const Header: NonNullable<ThemeClientModule['Header']> = (props) => <div data-code-theme="clean"><CleanHeader {...props}/></div>
const Footer: NonNullable<ThemeClientModule['Footer']> = (props) => <div data-code-theme="clean"><CleanFooter {...props}/></div>
export const theme: ThemeClientModule = { Header, Footer }
