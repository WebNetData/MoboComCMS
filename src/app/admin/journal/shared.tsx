'use client'

import type { ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

export { Notice, fa, faDate, send, useJson } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/journal', label: 'داشبورد', exact: true },
  { href: '/admin/posts', label: 'نوشته‌ها' },
  { href: '/admin/postcats', label: 'دسته‌بندی‌ها' },
  { href: '/admin/comments', label: 'دیدگاه‌ها' },
  { href: '/admin/journal/formats', label: 'قالب‌ها' },
  { href: '/admin/journal/styles', label: 'استایل صفحهٔ نوشته' },
  { href: '/admin/journal/settings', label: 'صفحهٔ اصلی و تنظیمات' },
]

export function JournalShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <SectionShell tabs={TABS} label="بخش‌های مدیریت مجله" title={title} actions={actions}>{children}</SectionShell>
}
