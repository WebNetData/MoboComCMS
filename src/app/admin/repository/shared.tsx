'use client'

import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import type { ReactNode } from 'react'

export { Notice, fa, faDate, send, useJson } from '../store/shared'

const TABS = [
  { href: '/admin/repository', label: 'مرور و نصب', exact: true },
  { href: '/admin/repository/products', label: 'محصولات من (فروش)' },
  { href: '/admin/repository/licenses', label: 'لایسنس‌ها' },
  { href: '/admin/repository/settings', label: 'تنظیمات' },
]

export function RepoShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  return <div className="sa rp" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های مخزن">{TABS.map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>
    {children}
  </div>
}

export const kb = (size: number) => (size >= 1048576 ? `${(size / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت` : `${Math.max(1, Math.round(size / 1024)).toLocaleString('fa-IR')} کیلوبایت`)
export const KIND: Record<string, string> = { PLUGIN: 'افزونه', THEME: 'قالب' }
