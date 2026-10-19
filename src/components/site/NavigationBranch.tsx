'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from '@/platform/routing/navigation'
import Link from '@/components/AppLink'
import type { PublicMenuLink } from '@/modules/site/config/menus'
import NavigationIcon from './NavigationIcon'
import styles from './NavigationBranch.module.css'

/** Ordinary navigation links with a separate disclosure, not an ARIA application menu. */
export default function NavigationBranch({ link, children, inline = false, onNavigate }: { link: PublicMenuLink; children: ReactNode; inline?: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState<CSSProperties | null>(null)
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), intent = useRef<'first' | 'last' | null>(null)
  const id = useId(), pathname = usePathname(), mega = link.menuDisplay === 'mega' && !inline
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const owns = (target: Node | null) => !!target && (!!root.current?.contains(target) || !!panel.current?.contains(target))
  const focusEdge = (edge: 'first' | 'last') => { const items = navigationTargets(panel.current).filter(el => !el.hasAttribute('data-navigation-close')); (edge === 'first' ? items[0] : items.at(-1))?.focus() }
  const dismiss = (restore = false) => { clear(); setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => { if (event.target instanceof Node && !owns(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('focusin', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('focusin', close) }
  }, [open])
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    if (inline) return
    const place = () => {
      const el = root.current
      if (!el || !el.getClientRects().length) { setOpen(false); return }
      const rect = el.getBoundingClientRect(), surface = el.closest('nav')?.getBoundingClientRect() || rect
      const gutter = 12, available = window.innerWidth - gutter * 2
      const width = Math.min(mega ? Math.min(1120, Math.max(320, surface.width)) : 340, available)
      const rtl = getComputedStyle(el).direction === 'rtl'
      // Both kinds open from their own tab: its outer edge lines up with the panel's (clamped to the window).
      const desired = rtl ? rect.right - width : rect.left
      const top = Math.min(rect.bottom + 8, window.innerHeight - 100)
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) { setOpen(false); return }
      const left = Math.max(gutter, Math.min(desired, window.innerWidth - width - gutter))
      // Where the tab's middle falls on the panel's top edge, for the mark that ties the two together.
      const caret = Math.max(28, Math.min(width - 28, rect.left + rect.width / 2 - left))
      setPosition({ left, top: Math.max(gutter, top), width, maxHeight: Math.max(80, Math.min(window.innerHeight * .74, window.innerHeight - Math.max(gutter, top) - gutter)), '--navigation-caret': `${caret}px` } as CSSProperties)
    }
    place()
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) setOpen(false) }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true) }
  }, [open, inline, mega, link.menuColumns])
  useLayoutEffect(() => { if (open && (inline || position) && intent.current) { focusEdge(intent.current); intent.current = null } }, [open, inline, position])
  if (!link.children?.length) return <>{children}</>
  const leave = () => { clear(); if (!owns(document.activeElement)) timer.current = setTimeout(() => setOpen(false), 200) }
  const navigate = () => { dismiss(); onNavigate?.() }
  const content = <div ref={panel} id={id} hidden={!open} className={`${styles.panel}${inline ? ` ${styles.inlinePanel}` : ` ${styles.floating}`}${mega ? ` ${styles.mega}` : ''}`} data-navigation-panel={inline ? 'inline' : mega ? 'mega' : 'dropdown'} style={inline ? undefined : { ...position, visibility: position ? 'visible' : 'hidden', '--navigation-columns': link.menuColumns || 3 } as CSSProperties} dir={inline ? undefined : root.current ? getComputedStyle(root.current).direction : 'rtl'} onPointerEnter={clear} onPointerLeave={inline ? undefined : leave} onKeyDown={event => {
    if (inline || event.key !== 'Tab') return
    const items = navigationTargets(panel.current), first = items[0], last = items.at(-1)
    if (event.shiftKey && event.target === first) { event.preventDefault(); dismiss(true) }
    else if (!event.shiftKey && event.target === last) {
      event.preventDefault()
      const targets = navigationTargets(document.body).filter(el => !panel.current?.contains(el)), index = targets.indexOf(trigger.current!)
      dismiss(); (targets[index + 1] || trigger.current)?.focus()
    }
  }}>
    {inline ? <NavigationItems links={link.children} onNavigate={navigate} /> : <nav aria-label={`زیرمنوی ${link.label}`}>
      <div className={styles.panelHead}>
        {link.icon && <span className={styles.headIcon} aria-hidden="true"><NavigationIcon name={link.icon} /></span>}
        <div className={styles.headCopy}><strong>{link.label}</strong>{link.description && <p>{link.description}</p>}</div>
        {link.href.startsWith('/') && !link.href.startsWith('//') && <Link href={link.href} className={styles.viewAll} onClick={navigate}>مشاهدهٔ همه<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></Link>}
        <button type="button" data-navigation-close="" className={styles.close} aria-label={`بستن زیرمنوی ${link.label}`} onClick={() => dismiss(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </div>
      <NavigationItems links={link.children} mega={mega} onNavigate={navigate} />
    </nav>}
  </div>
  return <div ref={root} data-navigation-branch="" data-open={open ? '' : undefined} data-menu-display={link.menuDisplay || 'dropdown'} className={`${styles.branch}${inline ? ` ${styles.inline}` : ''}`} onPointerEnter={event => { if (!inline && event.pointerType === 'mouse') { clear(); timer.current = setTimeout(() => setOpen(true), 110) } }} onPointerLeave={inline ? undefined : leave} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); dismiss(true) } }} onBlur={event => { if (event.relatedTarget instanceof Node && !owns(event.relatedTarget)) dismiss() }} onClickCapture={event => { if (event.target instanceof Element && event.target.closest('a[href]')) navigate() }}>
    <div className={styles.heading}>{children}<button ref={trigger} type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} aria-label={`زیرمنوی ${link.label}`} onClick={() => { clear(); setOpen(value => !value) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); const edge = event.key === 'ArrowDown' ? 'first' : 'last'; if (open) focusEdge(edge); else { intent.current = edge; setOpen(true) } }
      if (!inline && open && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); focusEdge('first') }
    }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></div>
    {inline ? content : open ? createPortal(content, document.body) : null}
  </div>
}

/** Visible native actions only; hidden descendants never enter the keyboard path. */
function navigationTargets(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') : []
}

function NavigationAnchor({ link, onNavigate, group = false }: { link: PublicMenuLink; onNavigate: () => void; group?: boolean }) {
  return <Link href={link.href} onClick={onNavigate} className={`${styles.itemLink}${group ? ` ${styles.groupLink}` : ''}`}>
    {link.icon && <span className={styles.icon}><NavigationIcon name={link.icon} /></span>}
    <span className={styles.copy}><span className={styles.itemTitle}>{link.label}</span>{link.description && <small>{link.description}</small>}</span>
    {!group && !link.children?.length && <svg className={styles.linkArrow} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>}
  </Link>
}

function NavigationItems({ links, mega = false, onNavigate }: { links: PublicMenuLink[]; mega?: boolean; onNavigate: () => void }) {
  return <ul className={mega ? styles.columns : styles.links}>{links.map((item, index) => <li key={item.id || `${item.href}:${index}`} className={mega ? styles.column : undefined}>
    {mega && item.children?.length ? <><NavigationAnchor link={item} onNavigate={onNavigate} group /><NavigationItems links={item.children} onNavigate={onNavigate} /></> : <NavigationBranch link={item} inline onNavigate={onNavigate}><NavigationAnchor link={item} onNavigate={onNavigate} /></NavigationBranch>}
  </li>)}</ul>
}
