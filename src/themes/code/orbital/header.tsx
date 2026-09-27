'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeLangControls, ThemePluginOutlet, themeSignOut, useThemeI18n, useThemeSession, useThemeSite } from '@/themes/sdk/client'
import type { ThemeHeaderProps } from '@/themes/types'

type LocalText = { fa: string; en: string; [locale: string]: string }
const tx = (value: LocalText, locale: string) => value[locale] || value[locale.split('-')[0]] || value.en || value.fa
function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
}

export default function OrbitalHeader({ theme, navPages, breadcrumbs }: ThemeHeaderProps) {
  const { data: session } = useThemeSession()
  const { locale } = useThemeI18n()
  const site = useThemeSite()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const mobileNav = useRef<HTMLElement>(null)
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  const links = useMemo(() => {
    const items = [...site.navigation.map(item => ({ href: item.href, label: tx(item.label, locale) })), ...(navPages || []).map(page => ({ href: `/p/${page.slug}`, label: locale === 'fa' ? page.title : page.titleEn || page.title }))]
    return items.filter((item, index) => items.findIndex(other => other.href === item.href) === index)
  }, [locale, navPages, site.navigation])
  // Section links do not mark every page under the root path as active.
  const isOn = (href: string) => !href.includes('#') && (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))
  useEffect(() => { setOpen(false); setSearchOpen(false) }, [pathname])
  useEffect(() => { if (open) mobileNav.current?.querySelector<HTMLAnchorElement>('a')?.focus() }, [open])
  useEffect(() => { if (searchOpen) searchInput.current?.focus() }, [searchOpen])
  useEffect(() => {
    if (!open && !searchOpen) return
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) { setOpen(false); setSearchOpen(false) }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (open) { setOpen(false); menuButton.current?.focus() }
      if (searchOpen) { setSearchOpen(false); searchButton.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [open, searchOpen])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1101px)')
    const closeMenu = () => { setOpen(false); setSearchOpen(false) }
    desktop.addEventListener('change', closeMenu)
    return () => desktop.removeEventListener('change', closeMenu)
  }, [])
  const brandName = <>{site.brand.endsWith('VPN') ? <>{site.brand.slice(0, -3)}<span>VPN</span></> : site.brand}</>
  const searchForm = (mobile = false) => <form action="/blog" method="get" role="search" className="orbital-guide-search"><SearchIcon /><input ref={mobile ? undefined : searchInput} type="search" name="q" maxLength={120} required aria-label={L('جست‌وجو در راهنماها و مجله', 'Search guides and articles')} placeholder={L('جست‌وجو در راهنماها…', 'Search guides and articles…')} /><button type="submit">{L('جست‌وجو', 'Search')}</button></form>
  return <>
    <a className="orbital-skip-link" href="#main-content" onClick={event => { const main = document.querySelector('main'); if (main) { event.preventDefault(); main.tabIndex = -1; main.focus(); main.scrollIntoView({ block: 'start' }) } }}>{L('رفتن به محتوای اصلی', 'Skip to content')}</a>
    <ThemePluginOutlet slot="site.before-header" site={site} locale={locale} />
    <header ref={headerRef} className="site-header orbital-header-shell" onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setSearchOpen(false) } }}>
      <div className="container orbital-header-bar">
        <Link href="/" className="orbital-brand" aria-label={site.brand}>{site.logo ? <img className="orbital-custom-logo" src={site.logo} alt=""/> : <span className="orbital-brand-mark orbital-h-logo" aria-hidden="true"><i /><i /><b /></span>}<span className="orbital-brand-copy"><strong dir="ltr">{brandName}</strong><small>{tx(site.tagline, locale)}</small></span></Link>
        <nav className="orbital-nav orbital-desktop-only" aria-label={L('ناوبری اصلی', 'Primary navigation')}>{links.map(link => <Link key={link.href} href={link.href} aria-current={isOn(link.href) ? 'page' : undefined} className={`orbital-nav-link ${isOn(link.href) ? 'is-active' : ''}`}>{link.label}</Link>)}</nav>
        <div className="orbital-header-actions">
          <button ref={searchButton} type="button" className={`orbital-icon-button orbital-desktop-only ${searchOpen ? 'is-active' : ''}`} onClick={() => { setSearchOpen(value => !value); setOpen(false) }} aria-label={L('جست‌وجو در مجله', 'Search the journal')} aria-expanded={searchOpen} aria-controls="orbital-header-search"><SearchIcon /></button>
          <div className="orbital-preferences"><ThemeLangControls locale={locale} theme={theme} /></div>
          <Link href={session ? '/dashboard' : '/login'} className="orbital-header-link orbital-desktop-only">{session ? L('پنل من', 'Dashboard') : L('ورود', 'Login')}</Link>
          <Link href={session ? '/dashboard' : '/register'} className="orbital-cta orbital-header-cta">{session ? L('حساب من', 'My account') : L('شروع کنید', 'Get MoboComCMS')}<span aria-hidden="true">↗</span></Link>
          <button ref={menuButton} type="button" className="orbital-icon-button orbital-mobile-toggle orbital-mobile-only" onClick={() => { setOpen(value => !value); setSearchOpen(false) }} aria-expanded={open} aria-controls="orbital-mobile-navigation" aria-label={open ? L('بستن منو', 'Close menu') : L('باز کردن منو', 'Open menu')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg></button>
        </div>
      </div>
      {searchOpen && <div id="orbital-header-search" className="container orbital-search-panel orbital-desktop-only">{searchForm()}</div>}
      {breadcrumbs?.length ? <div className="orbital-breadcrumb-bar"><nav className="container breadcrumbs" aria-label={L('مسیر صفحه', 'Breadcrumb')}>{breadcrumbs.map((item, index) => <span key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <strong aria-current="page">{item.label}</strong>}{index < breadcrumbs.length - 1 && <span aria-hidden="true"> / </span>}</span>)}</nav></div> : null}
      {open && <div id="orbital-mobile-navigation" className="container orbital-mobile-panel orbital-mobile-only"><div className="orbital-mobile-card"><nav ref={mobileNav} className="orbital-mobile-links" aria-label={L('ناوبری موبایل', 'Mobile navigation')}>{links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} aria-current={isOn(link.href) ? 'page' : undefined} className={`orbital-mobile-link ${isOn(link.href) ? 'is-active' : ''}`}>{link.label}<span aria-hidden="true">↗</span></Link>)}</nav>{searchForm(true)}<div className="orbital-mobile-footer">{session ? <button type="button" className="orbital-header-link" onClick={() => themeSignOut({ callbackUrl: '/' })}>{L('خروج', 'Logout')}</button> : <Link href="/login" onClick={() => setOpen(false)} className="orbital-header-link">{L('ورود به حساب', 'Login')}</Link>}<Link href={session ? '/dashboard' : '/register'} onClick={() => setOpen(false)} className="orbital-cta">{session ? L('ورود به پنل', 'Open dashboard') : L('شروع با MoboComCMS', 'Get MoboComCMS')}</Link></div></div></div>}
    </header>
    <ThemePluginOutlet slot="site.after-header" site={site} locale={locale} />
  </>
}
