'use client'

import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useEffect, useState, type ReactNode } from 'react'

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

// What the signed-in staff member holds, asked once for all the games screens.
let mine: Promise<string[] | null> | null = null
/**
 * Whether the viewer is a games author and not a manager: they get the list of their own games and nothing
 * else of this section, so the other tabs (which their permission does not open) are not offered. This only
 * decides what is shown; every request is decided again on the server.
 */
export function useGamesAuthor() {
  const [author, setAuthor] = useState(false)
  useEffect(() => {
    let alive = true
    mine ??= fetch('/api/me').then((response) => (response.ok ? response.json() : null)).then((data) => (Array.isArray(data?.permissions) ? data.permissions as string[] : null)).catch(() => null)
    void mine.then((permissions) => { if (alive) setAuthor(!!permissions && permissions.includes('games.author') && !permissions.includes('games.manage')) })
    return () => { alive = false }
  }, [])
  return author
}

export function GamesShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  const author = useGamesAuthor()
  return <div className="sa ga" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های مدیریت بازی">{TABS.filter((tab) => !author || tab.href === '/admin/games/titles').map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href) || (tab.href === '/admin/games/titles' && /^\/admin\/games\/(\d+|new)$/.test(pathname))
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>
    {children}
  </div>
}

export const RELEASE_LABEL = (release: { state: string; days: number | null }) =>
  release.state === 'tba' ? 'بدون تاریخ' : release.state === 'upcoming' ? `${(release.days || 0).toLocaleString('fa-IR')} روز مانده` : 'منتشر شده'
