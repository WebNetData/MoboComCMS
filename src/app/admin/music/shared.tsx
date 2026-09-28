'use client'

import type { ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

export { Notice, fa, send, useJson } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/music', label: 'داشبورد', exact: true },
  { href: '/admin/music/library', label: 'آهنگ، آلبوم و هنرمند' },
  { href: '/admin/music/settings', label: 'صفحهٔ اصلی و تنظیمات' },
]

export function MusicShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <SectionShell tabs={TABS} label="بخش‌های مدیریت موزیک" title={title} actions={actions}>{children}</SectionShell>
}
