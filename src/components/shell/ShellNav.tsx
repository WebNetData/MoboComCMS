'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'

// The menu of a workspace shell (account dashboard, admin): parts with a caption, groups that open and
// close, and their links. One renderer for the side column and the phone drawer; the layout owns what is listed.

export interface ShellItem { href: string; label: string; icon: string; exact?: boolean; badge?: React.ReactNode; heading?: string }
export interface ShellGroup {
  id: string
  title: string
  icon: string
  items: ShellItem[]
  /** Shown above the group when it starts a new part of the menu. */
  caption?: string
  /** A group of one link is drawn as that link. */
  flat?: boolean
}

/** Which groups the reader opened or closed. With a key the choice is kept on this device. */
export function useShellGroups(storageKey?: string) {
  const [choice, setChoice] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!storageKey) return
    try { const stored = JSON.parse(window.localStorage.getItem(storageKey) || '{}'); if (stored && typeof stored === 'object') setChoice(stored) } catch { /* the menu works without the stored choice */ }
  }, [storageKey])
  const toggle = useCallback((id: string, open: boolean) => {
    const next = { ...choice, [id]: open }
    setChoice(next)
    if (storageKey) try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* private window */ }
  }, [choice, storageKey])
  return { choice, toggle }
}

export default function ShellNav({ groups, isOn, choice, onToggle, onNavigate, openByDefault = false, forceOpen = false, itemIcons = false, shown = true }: {
  groups: ShellGroup[]
  isOn: (href: string, exact?: boolean) => boolean
  choice: Record<string, boolean>
  onToggle: (id: string, open: boolean) => void
  onNavigate?: () => void
  /** Groups the reader has not touched: all open (short menus) or only the one holding the current page. */
  openByDefault?: boolean
  /** While searching, every remaining group is open. */
  forceOpen?: boolean
  itemIcons?: boolean
  /** The phone drawer is in the page while closed: tell the menu when it opens. */
  shown?: boolean
}) {
  // In a long menu the current page's link may sit below the fold of the side column: bring it into view there
  // (only that column scrolls, never the page). Module groups arrive after the first paint, hence the count.
  const marker = useRef<HTMLSpanElement>(null)
  const current = groups.flatMap((group) => group.items).find((item) => isOn(item.href, item.exact))?.href || ''
  useEffect(() => {
    const column = marker.current?.closest<HTMLElement>('.side-nav, .mobile-drawer')
    const link = column?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!column || !link) return
    const top = link.getBoundingClientRect().top - column.getBoundingClientRect().top
    if (top < 0 || top > column.clientHeight - link.offsetHeight) column.scrollTop += top - column.clientHeight / 2
  }, [current, groups.length, shown])
  return <>
    <span ref={marker} hidden />
    {groups.map((group) => {
      if (!group.items.length) return null
      const active = group.items.some((item) => isOn(item.href, item.exact))
      const caption = group.caption ? <div className="ws-caption">{group.caption}</div> : null
      if (group.flat) {
        const item = group.items[0]
        return <div className="ws-part" key={group.id}>{caption}<Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`side-link ws-flat ${active ? 'side-link-active' : ''}`}><span className="ws-tile"><Icon name={group.icon} size={18} /></span><span className="ws-label">{item.label}</span>{item.badge}</Link></div>
      }
      const open = forceOpen || (choice[group.id] ?? (active || openByDefault))
      return <div className="ws-part" key={group.id}>
        {caption}
        <div className={`admin-nav-group ws-group ${active ? 'has-active' : ''} ${open ? 'is-open' : ''}`}>
          <button type="button" className="admin-nav-toggle ws-toggle" aria-expanded={open} onClick={() => onToggle(group.id, !open)}>
            <span className="ws-tile"><Icon name={group.icon} size={18} /></span>
            <span className="ws-label">{group.title}</span>
            <Icon name="chevron" size={14} className="admin-nav-chevron" />
          </button>
          <div className="admin-nav-items ws-items" hidden={!open}>
            {group.items.map((item) => {
              const on = isOn(item.href, item.exact)
              return <Fragment key={item.href}>
                {item.heading && <span className="ws-subhead">{item.heading}</span>}
                <Link href={item.href} onClick={onNavigate} aria-current={on ? 'page' : undefined} className={`side-link ws-item ${on ? 'side-link-active' : ''}`}>
                  {itemIcons && <span className="side-icon"><Icon name={item.icon} size={17} /></span>}<span className="ws-label">{item.label}</span>{item.badge}
                </Link>
              </Fragment>
            })}
          </div>
        </div>
      </div>
    })}
  </>
}
