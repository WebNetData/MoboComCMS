'use client'

import type { ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

export { Notice, fa, send, useJson } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/music', label: 'داشبورد', exact: true },
  { href: '/admin/music/library', label: 'آهنگ، آلبوم و پلی‌لیست' },
  { href: '/admin/music/artists', label: 'خواننده‌ها و هنرمندان' },
  { href: '/admin/celebrities', label: 'هنرمندان و چهره‌ها (پروفایل یکتا)' },
  { href: '/admin/music/lists', label: 'فهرست‌ها (سبک، نوع انتشار، نقش)' },
  { href: '/admin/music/settings', label: 'صفحهٔ اصلی و تنظیمات' },
]

export function MusicShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <SectionShell tabs={TABS} label="بخش‌های مدیریت موزیک" title={title} actions={actions}>{children}</SectionShell>
}
