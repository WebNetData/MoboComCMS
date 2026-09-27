'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SectionBar, SectionBarItem, MegaPromo } from '@/modules/navigation/domain/megamenu'

const OPEN_DELAY = 110
const CLOSE_DELAY = 220

function Chevron() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}
function HomeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg>
}
function SearchIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
}

const count = (value?: number) => (value ? <span className="mm-count">{value.toLocaleString('fa-IR')}</span> : null)

/** Dropdown body of one category: sub-category columns, featured items and the section promo. */
export function MegaPanel({ item, promo, onNavigate }: { item: SectionBarItem; promo: MegaPromo | null; onNavigate?: () => void }) {
  const aside = item.features.length > 0 || !!promo
  return <div className={`mm-body${aside ? '' : ' is-wide'}`}>
    <div className="mm-main">
      <div className="mm-head">
        <span className="mm-title">{item.label}</span>
        <Link href={item.href} className="mm-all" onClick={onNavigate}>همهٔ {item.label} <span aria-hidden="true">←</span></Link>
      </div>
      {item.columns.length ? <div className="mm-columns" style={{ '--mm-cols': Math.min(item.columns.length, 4) } as React.CSSProperties}>
        {item.columns.map((column, index) => <section key={`${column.title}-${index}`} className="mm-column" aria-label={column.title}>
          <h3 className="mm-column-title">{column.href ? <Link href={column.href} onClick={onNavigate}>{column.title}</Link> : column.title}</h3>
          <ul>{column.links.map((link) => <li key={link.href}><Link href={link.href} onClick={onNavigate}><span>{link.label}</span>{count(link.count)}</Link></li>)}</ul>
        </section>)}
      </div> : <p className="mm-empty">زیردسته‌ای ثبت نشده است؛ <Link href={item.href} onClick={onNavigate}>همهٔ موارد {item.label}</Link> را ببینید.</p>}
    </div>
    {aside && <aside className="mm-aside">
      {item.features.length > 0 && <div className="mm-features">
        <span className="mm-aside-title">پیشنهاد {item.label}</span>
        {item.features.map((feature) => <Link key={feature.href} href={feature.href} className="mm-feature" onClick={onNavigate}>
          <img src={feature.image} alt="" loading="lazy" decoding="async" onError={(event) => event.currentTarget.setAttribute('data-broken', '')} />
          <span>{feature.kicker && <small>{feature.kicker}</small>}<b>{feature.title}</b></span>
        </Link>)}
      </div>}
      {promo && <Link href={promo.href} className={`mm-promo${promo.image ? ' has-image' : ''}`} onClick={onNavigate} style={promo.image ? { backgroundImage: `url("${encodeURI(promo.image)}")` } : undefined}>
        <b>{promo.title}</b>{promo.text && <span>{promo.text}</span>}<em>{promo.cta || 'مشاهده'} ←</em>
      </Link>}
    </aside>}
  </div>
}

/**
 * A section's own menu bar (shown inside the section, under the site header):
 * section home, one entry per main category with its mega panel, quick links
 * and the section search. Hover opens with an intent delay; the chevron opens
 * it from the keyboard; Escape, outside clicks and navigation close it. On
 * small screens the entries scroll sideways and the panel opens below the bar.
 */
export default function SectionMegaBar({ bar, searchValue, extra }: { bar: SectionBar; searchValue?: string; extra?: ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const schedule = useCallback((key: string | null, delay: number) => { clear(); timer.current = setTimeout(() => setOpen(key), delay) }, [])
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

  const isOn = (href: string) => {
    const path = decodeURIComponent(href.split('?')[0])
    const here = decodeURIComponent(pathname)
    return path !== bar.home && (here === path || here.startsWith(`${path}/`))
  }
  const openItem = bar.items.find((item) => item.key === open) || null

  return <div ref={root} className="mm-bar-wrap" onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(null) }}>
    <div className="container mm-bar">
      <nav className="mm-bar-nav" aria-label={`منوی ${bar.title}`}>
        <Link href={bar.home} className={`mm-bar-home${pathname === bar.home ? ' is-active' : ''}`} aria-current={pathname === bar.home ? 'page' : undefined}><HomeIcon /><span>خانهٔ {bar.title}</span></Link>
        {bar.items.map((item) => {
          const expanded = open === item.key
          const on = isOn(item.href)
          if (!item.columns.length && !item.features.length) return <Link key={item.key} href={item.href} className={`mm-bar-link${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined}>{item.label}</Link>
          return <div key={item.key} className={`mm-bar-item${expanded ? ' is-open' : ''}`} onMouseEnter={() => schedule(item.key, open ? 0 : OPEN_DELAY)} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
            <Link href={item.href} className={`mm-bar-link${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined}>{item.label}</Link>
            <button type="button" className="mm-trigger" data-mm-trigger={item.key} aria-expanded={expanded} aria-controls={panelId} aria-label={`زیردسته‌های ${item.label}`} onClick={() => { clear(); setOpen(expanded ? null : item.key) }}><Chevron /></button>
          </div>
        })}
        {bar.quick.length > 0 && <span className="mm-bar-sep" aria-hidden="true" />}
        {bar.quick.map((link) => <Link key={link.href + link.label} href={link.href} className="mm-bar-quick">{link.label}</Link>)}
      </nav>
      {bar.search && <form action={bar.search.action} className="mm-bar-search" role="search">
        {bar.search.categories.length > 0 && <select name={bar.search.param} aria-label="دسته" defaultValue=""><option value="">همهٔ دسته‌ها</option>{bar.search.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>}
        <input name="q" type="search" defaultValue={searchValue} placeholder={bar.search.placeholder} aria-label={bar.search.placeholder} />
        <button type="submit" aria-label="جست‌وجو"><SearchIcon /></button>
      </form>}
      {extra}
    </div>
    <div id={panelId} className="mm-panel" hidden={!openItem} onMouseEnter={clear} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
      {openItem && <div className="container"><div className="mm-panel-inner"><MegaPanel item={openItem} promo={bar.promo} onNavigate={() => setOpen(null)} /></div></div>}
    </div>
  </div>
}
