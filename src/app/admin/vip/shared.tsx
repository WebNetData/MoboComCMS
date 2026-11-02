'use client'

import type { ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

export { Notice, fa, faDate, useJson } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/vip', label: 'داشبورد', exact: true },
  { href: '/admin/vip/members', label: 'اعضا' },
  { href: '/admin/vip/tiers', label: 'سطح‌ها' },
  { href: '/admin/vip/plans', label: 'پلن‌ها' },
  { href: '/admin/vip/perks', label: 'مزایا در هر بخش' },
]

export function VipShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return <SectionShell tabs={TABS} label="بخش‌های مدیریت اشتراک ویژه" title={title} actions={actions}>{children}</SectionShell>
}
