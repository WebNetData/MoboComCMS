'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ThemeLangControls, ThemePluginOutlet, ThemeSiteSearch, useThemeI18n, useThemeSession, useThemeSite } from '@/themes/sdk/client'
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

type NavLink = { href: string; label: string }

/**
 * Main navigation that never clips: links that do not fit the available width
 * move into a “More” dropdown (re-measured on resize and when links change).
 */
function PriorityNav({ links, isOn, label, more }: { links: NavLink[]; isOn: (href: string) => boolean; label: string; more: string }) {
  const nav = useRef<HTMLElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(links.length)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => { setOpen(false) }, [pathname])
  useLayoutEffect(() => {
    const el = nav.current
    const ruler = measure.current
    if (!el || !ruler) return
    const fit = () => {
      const widths = [...ruler.children].map(child => (child as HTMLElement).offsetWidth + 2)
      const moreWidth = 90
      const available = el.clientWidth
      let used = 0
      let count = 0
      for (const [index, width] of widths.entries()) {
        const rest = index < widths.length - 1 ? moreWidth : 0
        if (used + width + rest > available) break
        used += width
        count++
      }
      setVisible(count)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [links])
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !nav.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close) }
  }, [open])
  const overflow = links.slice(visible)
  return <nav ref={nav} className="mb-nav" aria-label={label}>
    <div ref={measure} className="mb-nav-measure" aria-hidden="true">{links.map(link => <span key={link.href}>{link.label}</span>)}</div>
    {links.slice(0, visible).map(link => <Link key={link.href} href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>)}
    {overflow.length > 0 && <div className="mb-nav-more">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)} className={overflow.some(link => isOn(link.href)) ? 'is-active' : ''}>{more}<Icon name="chevron" size={14}/></button>
      {open && <div className="mb-nav-dropdown" role="menu">{overflow.map(link => <Link key={link.href} href={link.href} role="menuitem" aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>)}</div>}
    </div>}
  </nav>
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
        <PriorityNav links={links} isOn={isOn} label={L('ناوبری اصلی', 'Primary navigation')} more={L('بیشتر', 'More')}/>
        <div className="mb-header-actions">
          <ThemeSiteSearch className="mb-search"/>
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
