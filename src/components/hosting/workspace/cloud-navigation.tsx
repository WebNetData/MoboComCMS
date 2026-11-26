'use client'

import ShellNav from '@/components/shell/ShellNav'
import { cloudGroups } from './cloud-menu'
import s from './cloud-shell.module.css'

export default function CloudNavigation({ path, choice, onToggle, onNavigate, shown = true }: {
  path: string; choice: Record<string, boolean>; onToggle: (id: string, open: boolean) => void; onNavigate?: () => void; shown?: boolean
}) {
  return <nav className={`${s.navigation} side-nav`} aria-label="بخش‌های پنل ابری">
    <ShellNav groups={cloudGroups} isOn={(href, exact) => path === href || (!exact && path.startsWith(href + '/'))} choice={choice} onToggle={onToggle} onNavigate={onNavigate} openByDefault itemIcons shown={shown} />
  </nav>
}
