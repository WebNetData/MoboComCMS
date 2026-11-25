'use client'

import ShellNav from '@/components/shell/ShellNav'
import { merchantGroups } from './merchant-menu'
import s from './MerchantShell.module.css'

export default function MerchantNavigation({ path, choice, onToggle, onNavigate, shown = true }: {
  path: string
  choice: Record<string, boolean>
  onToggle: (id: string, open: boolean) => void
  onNavigate?: () => void
  shown?: boolean
}) {
  return <nav className={`${s.navigation} side-nav`} aria-label="بخش‌های پنل پذیرندگان">
    <ShellNav groups={merchantGroups} isOn={(href, exact) => path === href || (!exact && path.startsWith(href + '/'))} choice={choice} onToggle={onToggle} onNavigate={onNavigate} openByDefault itemIcons shown={shown} />
  </nav>
}
