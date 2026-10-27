'use client'

import type { ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

export { Notice, fa, faDate, send, useJson } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/cinema', label: 'داشبورد', exact: true },
  { href: '/admin/cinema/titles', label: 'فیلم‌ها و سریال‌ها' },
  { href: '/admin/cinema/people', label: 'بازیگران و کارگردان‌ها' },
  { href: '/admin/celebrities', label: 'چهره‌ها (همهٔ بخش‌ها)' },
  { href: '/admin/cinema/formats', label: 'انواع' },
  { href: '/admin/cinema/lists', label: 'ژانر، کشور و زبان' },
  { href: '/admin/cinema/link-lists', label: 'صدا و کیفیت لینک‌ها' },
  { href: '/admin/cinema/settings', label: 'صفحهٔ اصلی و تنظیمات' },
]

export function CinemaShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <SectionShell tabs={TABS} label="بخش‌های مدیریت فیلم و سریال" title={title} actions={actions}>{children}</SectionShell>
}
