'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { MegaMenu } from '@/modules/navigation/domain/megamenu'

const MegaContext = createContext<MegaMenu[]>([])

export function MegaMenuProvider({ menus, children }: { menus: MegaMenu[]; children: ReactNode }) {
  return <MegaContext.Provider value={menus}>{children}</MegaContext.Provider>
}

export const useMegaMenus = () => useContext(MegaContext)

type NavLink = { href: string; label: string }
const OPEN_DELAY = 110
const CLOSE_DELAY = 220

function Chevron() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

function formatCount(count?: number) {
  return count ? <span className="mm-count">{count.toLocaleString('fa-IR')}</span> : null
}

/** The panel body — shared by the header and the admin preview. */
export function MegaMenuPanelBody({ menu, onNavigate }: { menu: MegaMenu; onNavigate?: () => void }) {
  const hasAside = menu.quick.length > 0 || menu.features.length > 0 || !!menu.promo
  return <div className={`mm-body${hasAside ? '' : ' is-wide'}`}>
    <div className="mm-main">
      <div className="mm-head">
        <span className="mm-title">{menu.title}</span>
        <Link href={menu.href} className="mm-all" onClick={onNavigate}>ورود به {menu.title} <span aria-hidden="true">←</span></Link>
      </div>
      {menu.columns.length ? <div className="mm-columns" style={{ '--mm-cols': Math.min(menu.columns.length, 4) } as React.CSSProperties}>
        {menu.columns.map((column, index) => <section key={`${column.title}-${index}`} className="mm-column" aria-label={column.title}>
          <h3 className="mm-column-title">{column.href ? <Link href={column.href} onClick={onNavigate}>{column.title}</Link> : column.title}</h3>
          <ul>{column.links.map((link) => <li key={link.href}><Link href={link.href} onClick={onNavigate}><span>{link.label}</span>{formatCount(link.count)}</Link></li>)}</ul>
        </section>)}
      </div> : <p className="mm-empty">هنوز دسته‌بندی‌ای برای این بخش ساخته نشده است.</p>}
    </div>
    {hasAside && <aside className="mm-aside">
      {menu.quick.length > 0 && <nav className="mm-quick" aria-label={`دسترسی سریع ${menu.title}`}>
        {menu.quick.map((link) => <Link key={link.href + link.label} href={link.href} onClick={onNavigate}>{link.label}</Link>)}
      </nav>}
      {menu.features.length > 0 && <div className="mm-features">
        {menu.features.map((feature) => <Link key={feature.href} href={feature.href} className="mm-feature" onClick={onNavigate}>
          <img src={feature.image} alt="" loading="lazy" decoding="async" onError={(event) => event.currentTarget.setAttribute('data-broken', '')} />
          <span>{feature.kicker && <small>{feature.kicker}</small>}<b>{feature.title}</b></span>
        </Link>)}
      </div>}
      {menu.promo && <Link href={menu.promo.href} className={`mm-promo${menu.promo.image ? ' has-image' : ''}`} onClick={onNavigate} style={menu.promo.image ? { backgroundImage: `url("${encodeURI(menu.promo.image)}")` } : undefined}>
        <b>{menu.promo.title}</b>{menu.promo.text && <span>{menu.promo.text}</span>}<em>{menu.promo.cta || 'مشاهده'} ←</em>
      </Link>}
    </aside>}
  </div>
}

/**
 * Desktop main navigation with a mega panel under every section link that has one.
 * Hover opens with a short intent delay; the chevron button opens it from the
 * keyboard; Escape, outside clicks and navigation close it.
 */
export function MegaNav({ links, isOn, className, label, linkClass }: { links: NavLink[]; isOn: (href: string) => boolean; className?: string; label: string; linkClass?: (active: boolean) => string }) {
  const menus = useMegaMenus()
  const pathname = usePathname()
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const root = useRef<HTMLElement>(null)
  const baseId = useId()

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const schedule = useCallback((href: string | null, delay: number) => { clear(); timer.current = setTimeout(() => setOpen(href), delay) }, [])
  useEffect(() => { clear(); setOpen(null) }, [pathname])
  useEffect(() => () => clear(), [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const trigger = root.current?.querySelector<HTMLButtonElement>(`[data-mm-trigger="${CSS.escape(open)}"]`)
      setOpen(null)
      trigger?.focus()
    }
    const onPointer = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [open])

  return <nav ref={root} className={`mm-nav ${className || ''}`} aria-label={label} onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(null) }}>
    {links.map((link) => {
      const menu = menus.find((entry) => entry.href === link.href)
      if (!menu) return <Link key={link.href} href={link.href} className={linkClass?.(isOn(link.href))} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>
      const panelId = `${baseId}-${menu.section}`
      const expanded = open === link.href
      return <div key={link.href} className={`mm-item${expanded ? ' is-open' : ''}`} onMouseEnter={() => schedule(link.href, open ? 0 : OPEN_DELAY)} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
        <Link href={link.href} className={linkClass?.(isOn(link.href))} aria-current={isOn(link.href) ? 'page' : undefined}>{link.label}</Link>
        <button type="button" className="mm-trigger" data-mm-trigger={link.href} aria-expanded={expanded} aria-controls={panelId} aria-label={`زیرمنوی ${link.label}`} onClick={() => { clear(); setOpen(expanded ? null : link.href) }}><Chevron /></button>
        <div id={panelId} className="mm-panel" hidden={!expanded} onMouseEnter={clear}>
          <div className="mm-panel-inner"><MegaMenuPanelBody menu={menu} onNavigate={() => setOpen(null)} /></div>
        </div>
      </div>
    })}
  </nav>
}

/** Mobile navigation: sections with a mega menu expand in place (accordion). */
export function MegaMobileNav({ links, isOn, className, label, onNavigate }: { links: NavLink[]; isOn: (href: string) => boolean; className?: string; label: string; onNavigate?: () => void }) {
  const menus = useMegaMenus()
  const [open, setOpen] = useState<string | null>(null)
  const baseId = useId()
  return <nav className={`mm-mobile ${className || ''}`} aria-label={label}>
    {links.map((link) => {
      const menu = menus.find((entry) => entry.href === link.href)
      if (!menu) return <Link key={link.href} href={link.href} className="mm-mobile-link" aria-current={isOn(link.href) ? 'page' : undefined} onClick={onNavigate}>{link.label}</Link>
      const expanded = open === link.href
      const panelId = `${baseId}-${menu.section}`
      return <div key={link.href} className={`mm-mobile-item${expanded ? ' is-open' : ''}`}>
        <div className="mm-mobile-row">
          <Link href={link.href} className="mm-mobile-link" aria-current={isOn(link.href) ? 'page' : undefined} onClick={onNavigate}>{link.label}</Link>
          <button type="button" className="mm-mobile-toggle" aria-expanded={expanded} aria-controls={panelId} aria-label={`زیرمنوی ${link.label}`} onClick={() => setOpen(expanded ? null : link.href)}><Chevron /></button>
        </div>
        <div id={panelId} className="mm-mobile-panel" hidden={!expanded}>
          {menu.quick.length > 0 && <div className="mm-mobile-quick">{menu.quick.map((item) => <Link key={item.href + item.label} href={item.href} onClick={onNavigate}>{item.label}</Link>)}</div>}
          {menu.columns.map((column, index) => <div key={`${column.title}-${index}`} className="mm-mobile-group">
            <b>{column.href ? <Link href={column.href} onClick={onNavigate}>{column.title}</Link> : column.title}</b>
            <div>{column.links.map((item) => <Link key={item.href} href={item.href} onClick={onNavigate}>{item.label}</Link>)}</div>
          </div>)}
        </div>
      </div>
    })}
  </nav>
}
