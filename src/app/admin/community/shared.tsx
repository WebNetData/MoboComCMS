'use client'

import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import type { ReactNode } from 'react'

export { Notice, Pager, fa, faDate, faDay, send, useJson } from '../store/shared'

const TABS = [
  { href: '/admin/community', label: 'داشبورد', exact: true },
  { href: '/admin/community/reports', label: 'گزارش‌ها' },
  { href: '/admin/community/posts', label: 'پست‌ها' },
  { href: '/admin/community/people', label: 'کاربران و تأیید' },
  { href: '/admin/sections/community', label: 'تنظیمات' },
]

export type Person = { userId: number; username: string; name: string; avatar: string; avatarColor: string; verified: boolean }

export function Who({ person }: { person: Person | null }) {
  if (!person) return <span className="sa-sub">—</span>
  return <span className="ca-who">{person.avatar ? <img src={person.avatar} alt="" /> : <span className="ca-dot" style={{ background: person.avatarColor }}>{person.name.slice(0, 1)}</span>}<span><a href={`/u/${person.username}`} target="_blank" rel="noreferrer" className="sa-link"><b>{person.name}</b></a>{person.verified && ' ✔'}<small className="sa-sub" dir="ltr">@{person.username}</small></span></span>
}

export function CommunityShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname()
  return <div className="sa" dir="rtl">
    <nav className="sa-tabs" aria-label="مدیریت جامعه">{TABS.map((tab) => { const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href); return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link> })}</nav>
    <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>
    {children}
  </div>
}
