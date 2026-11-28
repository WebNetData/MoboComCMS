'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { signOut, useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import ThemeLangControls from '@/components/ThemeLangControls'
import ProfilePortrait from '@/components/admin/ProfilePortrait'
import { usePathname } from '@/platform/routing/navigation'
import { useShellGroups } from '@/components/shell/ShellNav'
import MerchantNavigation from './merchant-navigation'
import MerchantDrawer from './merchant-drawer'
import s from './MerchantShell.module.css'

function MerchantAccount({ name, email, image, authenticated, onNavigate }: { name: string; email: string; image: string; authenticated: boolean; onNavigate?: () => void }) {
  return <div className={s.account}>
    <Link href="/dashboard/profile" className={s.accountIdentity} onClick={onNavigate}><span className={s.avatar} aria-hidden="true"><ProfilePortrait image={image} name={name || email || 'موبوکام'} /></span><span><strong dir="auto">{name || 'حساب موبوکام'}</strong>{email && <small dir="ltr">{email}</small>}</span></Link>
    {authenticated && <button type="button" onClick={() => void signOut({ callbackUrl: '/pay/merchant' })} aria-label="خروج از حساب موبوکام"><Icon name="logout" size={18} /></button>}
  </div>
}

export default function MerchantShell({ children, locale, theme }: { children: ReactNode; locale: string; theme: string }) {
  const path = usePathname() || '/pay/merchant'
  const { data: session, status } = useSession()
  const groups = useShellGroups('mobocom.pay.menu')
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  // Route changes, including browser history, must not leave an old modal over the new page.
  useEffect(close, [path, close])
  const navigation = <MerchantNavigation path={path} choice={groups.choice} onToggle={groups.toggle} onNavigate={close} />
  const account = { name: session?.user?.name || '', email: session?.user?.email || '', image: session?.user?.image || '', authenticated: status === 'authenticated' }
  return <div className={s.shell} dir="rtl">
    <a href="#merchant-content" className={s.skip}>رفتن به محتوای پنل</a>
    <header className={s.header}>
      <Link href="/pay/merchant" className={s.brand}><span className={s.mark}><Icon name="card" size={23} /></span><bdi>MoboCom Pay</bdi></Link>
      <div className={s.tools}><Link href="/pay/merchant/support" className={s.supportLink} aria-label="پشتیبانی موبوکام‌پی"><Icon name="ticket" size={18} /></Link><ThemeLangControls locale={locale} theme={theme} compact /><Link href="/dashboard/profile" className={s.accountLink} aria-label="تنظیمات حساب موبوکام"><span className={s.avatar} aria-hidden="true"><ProfilePortrait image={account.image} name={account.name || account.email || 'موبوکام'} /></span></Link>
        <button type="button" className={s.menuToggle} aria-label="باز کردن منوی پذیرندگان" aria-expanded={open} aria-controls="merchant-mobile-navigation" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
      </div>
    </header>
    <div className={s.workspace}>
      <aside className={s.sidebar} aria-label="منوی کناری پذیرندگان"><div className={s.sidebarInner}><div className={s.sidebarHeading}><span className={s.sidebarSymbol}><Icon name="card" size={20} /></span><strong>پنل پذیرندگان</strong></div>{navigation}<MerchantAccount {...account} /></div></aside>
      <main id="merchant-content" className={s.content} tabIndex={-1}>{children}</main>
    </div>
    <MerchantDrawer open={open} onClose={close}><MerchantNavigation path={path} choice={groups.choice} onToggle={groups.toggle} onNavigate={close} shown={open} /><MerchantAccount {...account} onNavigate={close} /></MerchantDrawer>
  </div>
}
