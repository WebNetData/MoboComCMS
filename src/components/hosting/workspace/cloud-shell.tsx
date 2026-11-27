'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { signOut, useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import ThemeLangControls from '@/components/ThemeLangControls'
import { usePathname } from '@/platform/routing/navigation'
import { useShellGroups } from '@/components/shell/ShellNav'
import CloudNavigation from './cloud-navigation'
import CloudDrawer from './cloud-drawer'
import { cloudDashboardPath, cloudMenuLabel } from './cloud-menu'
import s from './cloud-shell.module.css'

function CloudAccount() {
  const { data: session } = useSession()
  const user = session?.user as (NonNullable<typeof session>['user'] & { phone?: string | null }) | undefined
  const displayName = user?.name?.trim() || 'حساب موبوکام'
  const accountDetail = user?.phone || user?.email
  return <div className={s.account}>
    <div className={s.accountIdentity}>
      <span className={s.avatar} aria-hidden="true">{displayName[0]}</span>
      <span><strong dir="auto">{displayName}</strong>{accountDetail && <small dir="ltr">{accountDetail}</small>}</span>
    </div>
    <button type="button" className={s.control} title="خروج از حساب" aria-label="خروج از حساب" onClick={() => void signOut({ callbackUrl: '/cloud' })}>
      <Icon name="logout" size={18} />
    </button>
  </div>
}

export default function CloudShell({ children, locale, theme, name }: { children: ReactNode; locale: string; theme: string; name: string }) {
  const path = usePathname() || cloudDashboardPath
  const groups = useShellGroups('mobocom.cloud.menu')
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useEffect(close, [path, close])

  return <div className={s.shell} dir="rtl">
    <a href="#cloud-content" className={s.skip}>رفتن به محتوای پنل</a>
    <header className={s.header}>
      <div className={s.headerStart}>
        <button type="button" className={`${s.control} ${s.menuToggle}`} aria-label="باز کردن منوی پنل ابری" aria-expanded={open} aria-controls="cloud-mobile-navigation" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <nav className={s.crumbs} aria-label="مسیر صفحه">
          <Link href={cloudDashboardPath}>{name}</Link>
          <Icon name="chevron" size={14} />
          <span aria-current="page">{cloudMenuLabel(path)}</span>
        </nav>
      </div>
      <ThemeLangControls locale={locale} theme={theme} compact />
    </header>
    <aside className={s.sidebar} aria-label="منوی کناری پنل ابری">
      <Link href={cloudDashboardPath} className={s.brand}>
        <span className={s.mark}><Icon name="cloud" size={21} /></span>
        <strong dir="auto">{name}</strong>
      </Link>
      <CloudNavigation path={path} choice={groups.choice} onToggle={groups.toggle} />
      <CloudAccount />
    </aside>
    <main id="cloud-content" className={s.content} tabIndex={-1}>{children}</main>
    <CloudDrawer open={open} onClose={close} name={name}>
      <CloudNavigation path={path} choice={groups.choice} onToggle={groups.toggle} onNavigate={close} shown={open} />
      <CloudAccount />
    </CloudDrawer>
    <footer className={s.footer}><Link href="/cloud">صفحهٔ اصلی ابر</Link></footer>
  </div>
}
