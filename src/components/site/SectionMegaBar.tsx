'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import type { SectionBar, SectionBarItem, MegaPromo, MegaLink } from '@/modules/navigation/domain/megamenu'
import NavigationIcon from './NavigationIcon'
import NavigationBranch from './NavigationBranch'
import LiveSearchInput from '@/components/search/LiveSearchInput'

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
          <h3 className="mm-column-title">{column.href ? <Link href={column.href} onClick={onNavigate}><NavigationIcon name={column.icon} />{column.title}</Link> : column.title}</h3>
          <ul>{column.links.map((link, index) => <li key={`${link.href}-${index}`}><NavigationBranch link={link} inline onNavigate={onNavigate}><Link href={link.href} onClick={onNavigate}><NavigationIcon name={link.icon} /><span>{link.label}</span>{count(link.count)}</Link></NavigationBranch></li>)}</ul>
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

const MORE = '__more__'
const MORE_WIDTH = 96

/** Entries that did not fit in the bar: each category with its first sub-links, then the quick links. */
function MorePanel({ items, quick, onNavigate }: { items: SectionBarItem[]; quick: MegaLink[]; onNavigate: () => void }) {
  return <div className="mm-body is-wide mm-more-body">
    <div className="mm-main">
      {items.length > 0 && <div className="mm-more-grid">{items.map((item) => <section key={item.key} className="mm-column">
        <h3 className="mm-column-title"><Link href={item.href} onClick={onNavigate}><NavigationIcon name={item.icon} />{item.label}</Link></h3>
        <ul>{item.columns.flatMap((column) => column.links).slice(0, 6).map((link, index) => <li key={`${link.href}-${index}`}><NavigationBranch link={link} inline onNavigate={onNavigate}><Link href={link.href} onClick={onNavigate}><NavigationIcon name={link.icon} /><span>{link.label}</span>{count(link.count)}</Link></NavigationBranch></li>)}</ul>
      </section>)}</div>}
      {quick.length > 0 && <div className="mm-more-quick">{quick.map((link) => <Link key={link.href + link.label} href={link.href} onClick={onNavigate}><NavigationIcon name={link.icon} />{link.label}</Link>)}</div>}
    </div>
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
  // Priority+ layout: as many entries as fit (and at most bar.maxItems categories); the rest go under «بیشتر».
  const nav = useRef<HTMLElement>(null)
  const widths = useRef<number[] | null>(null)
  const signature = JSON.stringify([bar.items.map(({ key, label, icon }) => [key, label, icon]), bar.quick.map(({ href, label, icon }) => [href, label, icon]), bar.maxItems, bar.showHome, bar.homeIcon, bar.homeLabel])
  const [fit, setFit] = useState<{ items: number; quick: number } | null>(null)
  const layout = useCallback(() => {
    const el = nav.current
    if (!el || !widths.current) return
    const home = (el.querySelector('.mm-bar-home') as HTMLElement | null)?.offsetWidth || 0
    const gap = 4
    let space = el.clientWidth - home - gap
    const total = widths.current.reduce((sum, w) => sum + w + gap, 0)
    const cap = bar.maxItems > 0 ? Math.min(bar.maxItems, bar.items.length) : bar.items.length
    const needMore = total > space || cap < bar.items.length
    if (needMore) space -= MORE_WIDTH
    let items = 0
    for (let i = 0; i < cap && space - (widths.current[i] + gap) >= 0; i++) { space -= widths.current[i] + gap; items++ }
    let quick = 0
    if (items === bar.items.length) {
      space -= 18 // separator
      for (let i = 0; i < bar.quick.length && space - (widths.current[bar.items.length + i] + gap) >= 0; i++) { space -= widths.current[bar.items.length + i] + gap; quick++ }
    }
    setFit((current) => (current && current.items === items && current.quick === quick ? current : { items, quick }))
  }, [bar.items.length, bar.quick.length, bar.maxItems])
  // Measure every entry once per bar (all rendered), then lay out on every resize.
  useLayoutEffect(() => { widths.current = null; setFit(null) }, [signature])
  useLayoutEffect(() => {
    const el = nav.current
    if (!el || fit !== null) return
    widths.current = [...el.querySelectorAll<HTMLElement>('[data-mm-entry]')].map((entry) => entry.offsetWidth)
    layout()
  }, [fit, layout])
  useEffect(() => {
    const el = nav.current
    if (!el) return
    const observer = new ResizeObserver(() => layout())
    observer.observe(el)
    return () => observer.disconnect()
  }, [layout])
  const shownItems = fit ? bar.items.slice(0, fit.items) : bar.items
  const shownQuick = fit ? bar.quick.slice(0, fit.quick) : bar.quick
  const moreItems = fit ? bar.items.slice(fit.items) : []
  const moreQuick = fit ? bar.quick.slice(fit.quick) : []
  const hasMore = moreItems.length + moreQuick.length > 0

  const openItem = bar.items.find((item) => item.key === open) || null

  return <div ref={root} className="mm-bar-wrap" onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(null) }}>
    <div className="container mm-bar">
      <nav ref={nav} className={`mm-bar-nav${fit ? ' is-fitted' : ''}`} aria-label={`منوی ${bar.title}`}>
        {bar.showHome !== false && <Link href={bar.home} className={`mm-bar-home${pathname === bar.home ? ' is-active' : ''}`} aria-current={pathname === bar.home ? 'page' : undefined}>{bar.homeIcon === undefined ? <HomeIcon /> : <NavigationIcon name={bar.homeIcon} />}<span>{bar.homeLabel || `خانهٔ ${bar.title}`}</span></Link>}
        {shownItems.map((item) => {
          const expanded = open === item.key
          const on = isOn(item.href)
          if (!item.columns.length && !item.features.length) return <Link key={item.key} data-mm-entry="" href={item.href} className={`mm-bar-link${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined}><NavigationIcon name={item.icon} />{item.label}</Link>
          return <div key={item.key} data-mm-entry="" className={`mm-bar-item${expanded ? ' is-open' : ''}`} onMouseEnter={() => schedule(item.key, open ? 0 : OPEN_DELAY)} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
            <Link href={item.href} className={`mm-bar-link${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined}><NavigationIcon name={item.icon} />{item.label}</Link>
            <button type="button" className="mm-trigger" data-mm-trigger={item.key} aria-expanded={expanded} aria-controls={panelId} aria-label={`زیردسته‌های ${item.label}`} onClick={() => { clear(); setOpen(expanded ? null : item.key) }}><Chevron /></button>
          </div>
        })}
        {shownQuick.length > 0 && <span className="mm-bar-sep" aria-hidden="true" />}
        {shownQuick.map((link) => <Link key={link.href + link.label} data-mm-entry="" href={link.href} className="mm-bar-quick"><NavigationIcon name={link.icon} />{link.label}</Link>)}
        {hasMore && <div className={`mm-bar-item mm-more${open === MORE ? ' is-open' : ''}`} onMouseEnter={() => schedule(MORE, open ? 0 : OPEN_DELAY)} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
          <button type="button" className="mm-more-btn" data-mm-trigger={MORE} aria-expanded={open === MORE} aria-controls={panelId} onClick={() => { clear(); setOpen(open === MORE ? null : MORE) }}>
            بیشتر<span className="mm-more-count">{(moreItems.length + moreQuick.length).toLocaleString('fa-IR')}</span><Chevron />
          </button>
        </div>}
      </nav>
      {bar.search && <form action={bar.search.action} className="mm-bar-search" role="search">
        {bar.search.categories.length > 0 && <select name={bar.search.param} aria-label="دسته" defaultValue=""><option value="">همهٔ دسته‌ها</option>{bar.search.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>}
        <LiveSearchInput action={bar.search.action} defaultValue={searchValue} placeholder={bar.search.placeholder} />
        <button type="submit" aria-label="جست‌وجو"><SearchIcon /></button>
      </form>}
      {extra}
    </div>
    <div id={panelId} className="mm-panel" hidden={!openItem && open !== MORE} onMouseEnter={clear} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
      {openItem && <div className="container"><div className="mm-panel-inner"><MegaPanel item={openItem} promo={bar.promo} onNavigate={() => setOpen(null)} /></div></div>}
      {open === MORE && hasMore && <div className="container"><div className="mm-panel-inner"><MorePanel items={moreItems} quick={moreQuick} onNavigate={() => setOpen(null)} /></div></div>}
    </div>
  </div>
}
