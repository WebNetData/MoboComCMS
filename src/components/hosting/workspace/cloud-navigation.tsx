'use client'

import ShellNav from '@/components/shell/ShellNav'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { cloudGroups, cloudMenuMatch, cloudNewServicePath } from './cloud-menu'
import s from './cloud-shell.module.css'

export default function CloudNavigation({ path, choice, onToggle, onNavigate, shown = true }: {
  path: string; choice: Record<string, boolean>; onToggle: (id: string, open: boolean) => void; onNavigate?: () => void; shown?: boolean
}) {
  return <nav className={`${s.navigation} side-nav`} aria-label="بخش‌های پنل ابری">
    <Link href={cloudNewServicePath} className={s.createLink} aria-current={path === cloudNewServicePath ? 'page' : undefined} onClick={onNavigate}>
      <span><Icon name="plus" size={17} /></span> ساخت سرویس <Icon name="arrow" size={16} />
    </Link>
    <ShellNav groups={cloudGroups} isOn={(href, exact) => cloudMenuMatch(path, href, exact)} choice={choice} onToggle={onToggle} onNavigate={onNavigate} itemIcons shown={shown} />
  </nav>
}
