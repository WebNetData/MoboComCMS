'use client'

import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import type { ReactNode } from 'react'

// Games admin shell: section tabs over the shared admin kit (sa-* styles,
// JSON loader and mutations from the store admin).

export { Notice, Pager, fa, faDate, faDay, send, useJson } from '../store/shared'

const TABS = [
  { href: '/admin/games', label: 'داشبورد', exact: true },
  { href: '/admin/games/titles', label: 'بازی‌ها' },
  { href: '/admin/games/releases', label: 'تقویم انتشار' },
  { href: '/admin/games/franchises', label: 'مجموعه‌ها' },
  { href: '/admin/studios', label: 'سازندگان و ناشران' },
  { href: '/admin/games/settings', label: 'صفحهٔ اصلی و تنظیمات' },
]

export function GamesShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  return <div className="sa ga" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های مدیریت بازی">{TABS.map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href) || (tab.href === '/admin/games/titles' && /^\/admin\/games\/(\d+|new)$/.test(pathname))
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>
    {children}
  </div>
}

export const RELEASE_LABEL = (release: { state: string; days: number | null }) =>
  release.state === 'tba' ? 'بدون تاریخ' : release.state === 'upcoming' ? `${(release.days || 0).toLocaleString('fa-IR')} روز مانده` : 'منتشر شده'
