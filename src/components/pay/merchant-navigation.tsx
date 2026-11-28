'use client'

import ShellNav from '@/components/shell/ShellNav'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
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
    <Link href="/pay/merchant/payments" onClick={onNavigate} className={s.create}>
      <span><Icon name="plus" size={18} /></span>ساخت لینک پرداخت<Icon name="arrow" size={16} />
    </Link>
    <ShellNav groups={merchantGroups} isOn={(href, exact) => path === href || (!exact && path.startsWith(href + '/'))} choice={choice} onToggle={onToggle} onNavigate={onNavigate} itemIcons shown={shown} />
  </nav>
}
