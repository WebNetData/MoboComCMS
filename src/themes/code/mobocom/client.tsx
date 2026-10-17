'use client'

import Link from '@/platform/routing/Link'
import { usePathname } from '@/platform/routing/navigation'
import { localizeMenu, ThemeNavigationBranch, ThemeNavigationIcon, type PublicMenuLink } from '@/themes/sdk/client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { DefaultThemeFooter, ThemeLangControls, ThemePluginOutlet, ThemeSiteSearch, ThemeWordmark, themeSignOut, useThemeI18n, useThemeSession, useThemeSite } from '@/themes/sdk/client'
import type { ThemeClientModule, ThemeFooterProps, ThemeHeaderProps } from '@/themes/types'
import Icon from './icons'

type LocalText = { fa: string; en: string; [locale: string]: string }
const tx = (value: LocalText, locale: string) => value[locale] || value[locale.split('-')[0]] || value.fa || value.en

function Brand({ footer = false }: { footer?: boolean }) {
  const site = useThemeSite()
  const { locale } = useThemeI18n()
  if (site.wordmark) return <Link href="/" className="mb-brand has-wordmark" aria-label={site.brand}><ThemeWordmark height={footer ? Math.min(site.wordmarkHeight || 40, 40) : undefined} /></Link>
  return <Link href="/" className="mb-brand" aria-label={site.brand}>
    {site.logo ? <img src={site.logo} alt="" className="mb-logo"/> : <span className="mb-mark" aria-hidden="true">{site.brand.trim().slice(0, 1)}</span>}
    <span className="mb-brand-copy"><strong>{site.brand}</strong>{!footer && <small>{tx(site.tagline, locale)}</small>}</span>
  </Link>
}

type NavLink = PublicMenuLink
const EntryIcon = ({ link, size = 17 }: { link: NavLink; size?: number }) => link.icon === undefined ? <Icon name={navIcon(link.href)} size={size}/> : <ThemeNavigationIcon name={link.icon} size={size}/>

// The icon of a section, from the first part of its address.
const NAV_ICONS: Record<string, string> = {
  products: 'bag', shop: 'bag', store: 'bag', cart: 'bag', blog: 'news', journal: 'news', magazine: 'news', music: 'music', cinema: 'film', games: 'game',
  software: 'download', forum: 'chat', community: 'users', people: 'users', vip: 'crown', plans: 'globe', businesses: 'star', search: 'search',
}
const navIcon = (href: string) => { const part = href.split(/[/?#]/).filter(Boolean)[0]; return part ? NAV_ICONS[part] || 'sparkles' : 'home' }

/** Closes a popover on Escape, on a press outside it, and when the address changes. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const pathname = usePathname()
  useEffect(() => { close() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const onEvent = (event: Event) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) close() }
    document.addEventListener('keydown', onEvent)
    document.addEventListener('pointerdown', onEvent)
    return () => { document.removeEventListener('keydown', onEvent); document.removeEventListener('pointerdown', onEvent) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Main navigation that never clips: links that do not fit the available width
 * move into a “More” dropdown (re-measured on resize and when links change).
 */
function PriorityNav({ links, isOn, label, more }: { links: NavLink[]; isOn: (href: string) => boolean; label: string; more: string }) {
  const nav = useRef<HTMLElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(links.length)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = nav.current
    const ruler = measure.current
    if (!el || !ruler) return
    const fit = () => {
      const widths = [...ruler.children].map(child => (child as HTMLElement).offsetWidth + 2)
      const moreWidth = 96
      const available = el.clientWidth - 10
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
  useDismiss(nav, open, () => setOpen(false))
  const overflow = links.slice(visible)
  // A highlight that slides to the link under the pointer (or the one that has the focus).
  const rail = useRef<HTMLDivElement>(null)
  const [glide, setGlide] = useState<{ x: number; width: number } | null>(null)
  const glideTo = (target: EventTarget | null) => {
    const item = target instanceof Element ? target.closest<HTMLElement>('[data-nav-item]') : null
    if (item && rail.current?.contains(item)) setGlide({ x: item.offsetLeft, width: item.offsetWidth })
  }
  return <nav ref={nav} className="mb-nav" aria-label={label}>
    <div ref={measure} className="mb-nav-measure" aria-hidden="true">{links.map(link => <span key={link.id || link.href}><EntryIcon link={link}/>{link.label}{!!link.children?.length && <b style={{ display: 'inline-block', width: 34 }} aria-hidden="true">⌄</b>}</span>)}</div>
    <div ref={rail} className="mb-nav-rail" onMouseOver={event => glideTo(event.target)} onFocus={event => glideTo(event.target)} onMouseLeave={() => setGlide(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setGlide(null) }}>
      <span className="mb-nav-glider" aria-hidden="true" data-on={glide ? '' : undefined} style={glide ? { width: glide.width, transform: `translateX(${glide.x}px)` } : undefined}/>
      {links.slice(0, visible).map(link => <ThemeNavigationBranch key={link.id || link.href} link={link}><Link className="mb-nav-entry" href={link.href} data-nav-item="" aria-current={isOn(link.href) ? 'page' : undefined}><EntryIcon link={link}/><span>{link.label}</span></Link></ThemeNavigationBranch>)}
      {overflow.length > 0 && <div className="mb-nav-more">
        <button type="button" data-nav-item="" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)} className={overflow.some(link => isOn(link.href)) ? 'is-active' : ''}><Icon name="grid" size={17}/><span>{more}</span><Icon name="chevron" size={14}/></button>
        {open && <div className="mb-nav-dropdown mb-pop">{overflow.map(link => <ThemeNavigationBranch key={link.id || link.href} link={link} inline onNavigate={() => setOpen(false)}><Link href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}><i><EntryIcon link={link}/></i>{link.label}</Link></ThemeNavigationBranch>)}</div>}
      </div>}
    </div>
  </nav>
}

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; role?: string | null }

/** The signed-in member: a chip that opens the account menu. A visitor gets sign in and sign up. */
function AccountMenu({ L }: { L: (fa: string, en: string) => string }) {
  const { data: session, status } = useThemeSession()
  const user = session?.user as SessionUser | undefined
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useDismiss(box, open, () => setOpen(false))
  if (!user) return <div className="mb-guest" data-loading={status === 'loading' || undefined}>
    <Link href="/login" className="mb-login">{L('ورود', 'Log in')}</Link>
    <Link href="/register" className="mb-account" aria-label={L('ثبت‌نام', 'Sign up')}><Icon name="user" size={18}/><span>{L('ثبت‌نام', 'Sign up')}</span></Link>
  </div>
  const name = user.name?.trim() || L('حساب من', 'My account')
  const real = user.email && !/\.local$/.test(user.email) ? user.email : ''
  const role = user.role === 'ADMIN' ? L('مدیر سایت', 'Administrator') : L('عضو سایت', 'Member')
  const portrait = <span className="mb-avatar" aria-hidden="true">{user.image ? <img src={user.image} alt=""/> : name.slice(0, 1)}</span>
  const tiles: [string, string, string][] = [
    ['/dashboard', 'grid', L('پیشخوان', 'Dashboard')], ['/dashboard/orders', 'bag', L('سفارش‌های من', 'My orders')],
    ['/dashboard/tickets', 'chat', L('پشتیبانی', 'Support')], ['/dashboard/profile', 'sliders', L('تنظیمات حساب', 'Account settings')],
  ]
  return <div ref={box} className="mb-user">
    <button type="button" className="mb-user-chip" aria-expanded={open} aria-haspopup="true" aria-label={`${L('منوی حساب', 'Account menu')}: ${name}`} onClick={() => setOpen(value => !value)}>
      {portrait}<span className="mb-user-id"><strong>{name}</strong><small>{role}</small></span><Icon name="chevron" size={14}/>
    </button>
    {open && <div className="mb-user-menu mb-pop" role="menu">
      <div className="mb-user-head">{portrait}<strong>{name}</strong>{real && <small dir="ltr">{real}</small>}<em>{role}</em></div>
      <div className="mb-user-grid">{tiles.map(([href, icon, label]) => <Link key={href} href={href} role="menuitem"><i><Icon name={icon} size={17}/></i>{label}</Link>)}</div>
      {user.role === 'ADMIN' && <Link href="/admin" role="menuitem"><i><Icon name="shield" size={17}/></i>{L('پنل مدیریت', 'Admin panel')}</Link>}
      <button type="button" role="menuitem" className="is-danger" onClick={() => themeSignOut({ callbackUrl: '/' })}><i><Icon name="logout" size={17}/></i>{L('خروج از حساب', 'Log out')}</button>
    </div>}
  </div>
}

function MobocomHeader({ theme, navPages, breadcrumbs }: ThemeHeaderProps) {
  const { data: session } = useThemeSession()
  const { locale } = useThemeI18n()
  const site = useThemeSite()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [navAway, setNavAway] = useState(false)
  const header = useRef<HTMLElement>(null)
  const drawer = useRef<HTMLDivElement>(null)
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  const links = useMemo(() => {
    const items: PublicMenuLink[] = [...localizeMenu(site.navigation, locale), ...(navPages || []).map(page => ({ href: `/p/${page.slug}`, label: locale === 'fa' ? page.title : page.titleEn || page.title }))]
    return items.filter((item, index) => !!item.id || items.findIndex(other => other.href === item.href) === index)
  }, [locale, navPages, site.navigation])
  const isOn = (href: string) => !href.includes('#') && (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 8)
      // Going down the page the links step aside; any move up, the top of the page, or the keyboard inside them brings them back.
      // Inside a section its own bar takes the place under the header for the whole page, so there the site links return only at the top.
      const sectionBar = document.querySelector('.mm-bar-wrap')
      if (y < (sectionBar ? 24 : 140) || header.current?.querySelector('.mb-navbar')?.contains(document.activeElement)) setNavAway(false)
      else if (sectionBar || y - last > 6) setNavAway(true)
      else if (last - y > 6) setNavAway(false)
      last = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // The open drawer holds the page still, closes on Escape, and takes the focus.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    drawer.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', onKey) }
  }, [open])
  const user = session?.user as SessionUser | undefined
  return <>
    <a className="mb-skip" href="#main-content">{L('رفتن به محتوای اصلی', 'Skip to content')}</a>
    <ThemePluginOutlet slot="site.before-header" site={site} locale={locale}/>
    <header ref={header} className="site-header mb-header" data-scrolled={scrolled || undefined} data-nav-away={navAway || undefined}>
      <div className="mb-container mb-header-bar">
        <Brand/>
        <ThemeSiteSearch className="mb-search"/>
        <div className="mb-header-actions">
          <ThemeLangControls locale={locale} theme={theme} compact/>
          <AccountMenu L={L}/>
          <button type="button" className="mb-menu-button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="mb-mobile-nav" aria-label={open ? L('بستن منو', 'Close menu') : L('باز کردن منو', 'Open menu')}><Icon name={open ? 'close' : 'menu'} size={20}/></button>
        </div>
        <span className="mb-progress" aria-hidden="true"/>
      </div>
      <div className="mb-navbar" onFocus={() => setNavAway(false)}>
        <div className="mb-container mb-navbar-inner"><PriorityNav links={links} isOn={isOn} label={L('ناوبری اصلی', 'Primary navigation')} more={L('بیشتر', 'More')}/></div>
      </div>
    </header>
    <div className="mb-navbar-space" aria-hidden="true"/>
    {breadcrumbs?.length ? <nav className="mb-container mb-breadcrumbs" aria-label={L('مسیر صفحه', 'Breadcrumb')}>{breadcrumbs.map((item, index) => <span key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <strong aria-current="page">{item.label}</strong>}{index < breadcrumbs.length - 1 && <span aria-hidden="true"> / </span>}</span>)}</nav> : null}
    {open && <div className="mb-drawer-layer">
      <button type="button" className="mb-drawer-shade" aria-label={L('بستن منو', 'Close menu')} onClick={() => setOpen(false)}/>
      <div ref={drawer} id="mb-mobile-nav" className="mb-drawer" role="dialog" aria-modal="true" aria-label={L('منوی سایت', 'Site menu')}>
        <div className="mb-drawer-head"><Brand/><button type="button" className="mb-menu-button" onClick={() => setOpen(false)} aria-label={L('بستن منو', 'Close menu')}><Icon name="close" size={20}/></button></div>
        <nav className="mb-drawer-nav" aria-label={L('ناوبری موبایل', 'Mobile navigation')}>{links.map(link => <ThemeNavigationBranch key={link.id || link.href} link={link} inline onNavigate={() => setOpen(false)}><Link href={link.href} aria-current={isOn(link.href) ? 'page' : undefined}><i><EntryIcon link={link} size={20}/></i><span>{link.label}</span></Link></ThemeNavigationBranch>)}</nav>
        <div className="mb-drawer-foot">
          {user
            ? <><Link href="/dashboard" className="mb-drawer-cta"><Icon name="grid" size={18}/>{L('پیشخوان من', 'My dashboard')}</Link><button type="button" className="mb-drawer-out" onClick={() => themeSignOut({ callbackUrl: '/' })}><Icon name="logout" size={18}/>{L('خروج', 'Log out')}</button></>
            : <><Link href="/register" className="mb-drawer-cta"><Icon name="user" size={18}/>{L('ثبت‌نام', 'Sign up')}</Link><Link href="/login" className="mb-drawer-out">{L('ورود', 'Log in')}</Link></>}
        </div>
      </div>
    </div>}
    <ThemePluginOutlet slot="site.after-header" site={site} locale={locale}/>
  </>
}

function MobocomFooter({ navPages }: ThemeFooterProps) {
  return <DefaultThemeFooter navPages={navPages} />
}

const Header: NonNullable<ThemeClientModule['Header']> = (props) => <div data-code-theme="mobocom" className="mb-shell"><MobocomHeader {...props}/></div>
const Footer: NonNullable<ThemeClientModule['Footer']> = (props) => <div data-code-theme="mobocom"><MobocomFooter {...props}/></div>
export const theme: ThemeClientModule = { Header, Footer }
