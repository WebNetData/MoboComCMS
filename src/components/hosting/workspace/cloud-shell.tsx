'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import ThemeLangControls from '@/components/ThemeLangControls'
import { usePathname } from '@/platform/routing/navigation'
import { useShellGroups } from '@/components/shell/ShellNav'
import CloudNavigation from './cloud-navigation'
import CloudDrawer from './cloud-drawer'
import s from './cloud-shell.module.css'

function CloudAccount() {
  const { data: session } = useSession()
  const user = session?.user as (NonNullable<typeof session>['user'] & { phone?: string | null }) | undefined
  const displayName = user?.name || 'حساب موبوکام'
  return <div className={s.account}><Link href="/dashboard" className={s.accountIdentity}>
    <span className={s.avatar} aria-hidden="true">{displayName.charAt(0)}</span><span><strong>{displayName}</strong><small dir={user?.phone ? 'ltr' : undefined}>{user?.phone || 'حساب موبوکام'}</small></span>
  </Link></div>
}

export default function CloudShell({ children, locale, theme, name }: { children: ReactNode; locale: string; theme: string; name: string }) {
  const path = usePathname() || '/cloud/dashboard'
  const groups = useShellGroups('mobocom.cloud.menu')
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useEffect(close, [path, close])
  return <div className={s.shell} dir="rtl">
    <a href="#cloud-content" className={s.skip}>رفتن به محتوای پنل</a>
    <header className={s.header}>
      <Link href="/cloud/dashboard" className={s.brand}><span className={s.mark}><Icon name="cloud" size={22} /></span><span className={s.brandText}><strong>{name}</strong><small>فضای ابری شما</small></span></Link>
      <div className={s.tools}><ThemeLangControls locale={locale} theme={theme} compact /><Link href="/dashboard" className={s.accountLink} aria-label="حساب موبوکام"><Icon name="user" size={18} /><span className={s.accountLabel}>حساب موبوکام</span></Link>
        <button type="button" className={s.menuToggle} aria-label="باز کردن منوی پنل ابری" aria-expanded={open} aria-controls="cloud-mobile-navigation" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
      </div>
    </header>
    <div className={s.workspace}>
      <aside className={s.sidebar} aria-label="منوی کناری پنل ابری"><div className={s.sidebarInner}><div className={s.sidebarHeading}><span className={s.sidebarSymbol}><Icon name="server" size={20} /></span><div><strong>پنل ابری</strong><small>مدیریت سرویس‌ها و دامنه‌ها</small></div></div><CloudNavigation path={path} choice={groups.choice} onToggle={groups.toggle} onNavigate={close} /><CloudAccount /></div></aside>
      <main id="cloud-content" className={s.content} tabIndex={-1}>{children}</main>
    </div>
    <CloudDrawer open={open} onClose={close} name={name}><CloudNavigation path={path} choice={groups.choice} onToggle={groups.toggle} onNavigate={close} shown={open} /><CloudAccount /></CloudDrawer>
    <footer className={s.footer}><span>{name} · پنل ابری</span><Link href="/cloud">صفحه اصلی ابر</Link></footer>
  </div>
}
