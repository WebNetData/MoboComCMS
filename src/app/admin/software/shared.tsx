'use client'

import type { ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

export { Notice, fa, faDate, send, useJson } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/software', label: 'داشبورد', exact: true },
  { href: '/admin/software/titles', label: 'نرم‌افزارها' },
  { href: '/admin/software/releases', label: 'نسخه‌ها' },
  { href: '/admin/studios', label: 'سازندگان و ناشران' },
  { href: '/admin/software/settings', label: 'صفحهٔ اصلی و تنظیمات' },
]

export function SoftwareShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <SectionShell tabs={TABS} label="بخش‌های مدیریت نرم‌افزار" title={title} actions={actions}>{children}</SectionShell>
}
