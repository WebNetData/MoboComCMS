'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import type { PublicMenuLink } from '@/modules/site/config/menus'
import NavigationIcon from './NavigationIcon'
import styles from './NavigationBranch.module.css'

/** Ordinary navigation links with a separate disclosure, not an ARIA application menu. */
export default function NavigationBranch({ link, children, inline = false, onNavigate }: { link: PublicMenuLink; children: ReactNode; inline?: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  if (!link.children?.length) return <>{children}</>
  return <div ref={root} className={`${styles.branch}${inline ? ` ${styles.inline}` : ''}`} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus() } }} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <div className={styles.heading}>{children}<button ref={trigger} type="button" aria-expanded={open} aria-controls={id} aria-label={`زیرمنوی ${link.label}`} onClick={() => setOpen(value => !value)}><span aria-hidden="true">⌄</span></button></div>
    <div id={id} hidden={!open} className={styles.panel}><ul>{link.children.map(item => <li key={item.id || item.href + item.label}><NavigationBranch link={item} inline onNavigate={onNavigate}><Link href={item.href} onClick={() => { setOpen(false); onNavigate?.() }}><NavigationIcon name={item.icon} /><span>{item.label}</span></Link></NavigationBranch></li>)}</ul></div>
  </div>
}
