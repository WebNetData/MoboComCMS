'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ThemeLangControls, ThemePluginOutlet, useThemeI18n, useThemeSession, useThemeSite } from '@/themes/sdk/client'
import type { ThemeClientModule, ThemeFooterProps, ThemeHeaderProps } from '@/themes/types'
import Icon from './icons'

type LocalText = { fa: string; en: string; [locale: string]: string }
const tx = (value: LocalText, locale: string) => value[locale] || value[locale.split('-')[0]] || value.fa || value.en

function Brand({ footer = false }: { footer?: boolean }) {
  const site = useThemeSite()
  const { locale } = useThemeI18n()
  return <Link href="/" className="mb-brand" aria-label={site.brand}>
    {site.logo ? <img src={site.logo} alt="" className="mb-logo"/> : <span className="mb-mark" aria-hidden="true">{site.brand.trim().slice(0, 1)}</span>}
    <span className="mb-brand-copy"><strong>{site.brand}</strong>{!footer && <small>{tx(site.tagline, locale)}</small>}</span>
  </Link>
}

function MobocomHeader({ theme, navPages, breadcrumbs }: ThemeHeaderProps) {
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
    <a className="mb-skip" href="#main-content">{L('رفتن به محتوای اصلی', 'Skip to content')}</a>
    <ThemePluginOutlet slot="site.before-header" site={site} locale={locale}/>
    <header className="site-header mb-header">
      <div className="mb-container mb-header-bar">
        <Brand/>
        <nav className="mb-nav" aria-label={L('ناوبری اصلی', 'Primary navigation')}>{links.map(link => <Link key={link.href} href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>)}</nav>
        <div className="mb-header-actions">
          <ThemeLangControls locale={locale} theme={theme} compact/>
          <Link href={session ? '/dashboard' : '/login'} className="mb-account"><Icon name="user" size={18}/><span>{session ? L('حساب من', 'My account') : L('ورود / ثبت‌نام', 'Log in')}</span></Link>
          <button type="button" className="mb-menu-button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="mb-mobile-nav" aria-label={open ? L('بستن منو', 'Close menu') : L('باز کردن منو', 'Open menu')}><Icon name={open ? 'close' : 'menu'} size={20}/></button>
        </div>
      </div>
      {open && <nav id="mb-mobile-nav" className="mb-container mb-mobile-nav" aria-label={L('ناوبری موبایل', 'Mobile navigation')}>{links.map(link => <Link key={link.href} href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>)}</nav>}
      {breadcrumbs?.length ? <nav className="mb-container mb-breadcrumbs" aria-label={L('مسیر صفحه', 'Breadcrumb')}>{breadcrumbs.map((item, index) => <span key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <strong aria-current="page">{item.label}</strong>}{index < breadcrumbs.length - 1 && <span aria-hidden="true"> / </span>}</span>)}</nav> : null}
    </header>
    <ThemePluginOutlet slot="site.after-header" site={site} locale={locale}/>
  </>
}

function MobocomFooter({ navPages }: ThemeFooterProps) {
  const { locale } = useThemeI18n()
  const site = useThemeSite()
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  return <>
    <ThemePluginOutlet slot="site.before-footer" site={site} locale={locale}/>
    <footer className="site-footer mb-footer">
      <div className="mb-container mb-footer-grid">
        <div className="mb-footer-brand"><Brand footer/><p>{tx(site.copyright, locale)}</p></div>
        <nav aria-label={L('بخش‌ها', 'Sections')}><h3>{L('بخش‌ها', 'Sections')}</h3>{site.navigation.map(item => <Link key={item.href} href={item.href}>{tx(item.label, locale)}</Link>)}</nav>
        <nav aria-label={L('راهنما و پشتیبانی', 'Help')}><h3>{L('راهنما و پشتیبانی', 'Help & support')}</h3>{site.footer.map(item => <Link key={item.href} href={item.href}>{tx(item.label, locale)}</Link>)}{navPages?.map(page => <Link key={page.slug} href={`/p/${page.slug}`}>{locale === 'fa' ? page.title : page.titleEn || page.title}</Link>)}</nav>
        <nav aria-label={L('حساب کاربری', 'Account')}><h3>{L('حساب کاربری', 'Your account')}</h3><Link href="/dashboard/orders">{L('سفارش‌های من', 'My orders')}</Link><Link href="/dashboard/wallet">{L('کیف پول', 'Wallet')}</Link><Link href="/dashboard/tickets">{L('تیکت‌های پشتیبانی', 'Support tickets')}</Link><Link href="/dashboard/profile">{L('تنظیمات حساب', 'Account settings')}</Link></nav>
      </div>
      <div className="mb-container mb-footer-bottom"><span>© {new Date().getFullYear().toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US', { useGrouping: false })} {site.brand}</span><span>{tx(site.tagline, locale)}</span></div>
    </footer>
    <ThemePluginOutlet slot="site.after-footer" site={site} locale={locale}/>
  </>
}

const Header: NonNullable<ThemeClientModule['Header']> = (props) => <div data-code-theme="mobocom"><MobocomHeader {...props}/></div>
const Footer: NonNullable<ThemeClientModule['Footer']> = (props) => <div data-code-theme="mobocom"><MobocomFooter {...props}/></div>
export const theme: ThemeClientModule = { Header, Footer }
