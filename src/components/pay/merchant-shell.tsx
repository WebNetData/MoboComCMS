'use client'
import type { ReactNode } from 'react'
import { signOut, useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import ThemeLangControls from '@/components/ThemeLangControls'
import { usePathname } from '@/platform/routing/navigation'
import PayNavigation from './navigation'
import s from './MerchantShell.module.css'

export default function MerchantShell({ children, locale, theme }: { children: ReactNode; locale: string; theme: string }) {
  const path = usePathname() || '/pay/merchant', view = path.split('/')[3] || 'overview'
  const { status } = useSession()
  return <div className={s.shell} dir="rtl">
    <a href="#merchant-content" className={s.skip}>رفتن به محتوای پنل</a>
    <header className={s.header}><Link href="/pay/merchant" className={s.brand}><span className={s.mark}><Icon name="card" size={24} /></span><span><bdi>MoboCom Pay</bdi><small>فضای اختصاصی پذیرندگان</small></span></Link><div className={s.tools}><ThemeLangControls locale={locale} theme={theme} compact /><Link href="/dashboard" aria-label="حساب موبوکام"><Icon name="user" size={18} /><span className={s.accountLabel}>حساب موبوکام</span></Link>{status === 'authenticated' && <button type="button" onClick={() => void signOut({ callbackUrl: '/pay/merchant' })}>خروج</button>}</div></header>
    <div className={s.workspace}><aside className={s.sidebar}><div className={s.sidebarInner}><p className={s.caption}>مدیریت کسب‌وکار</p><div className={s.navigation}><PayNavigation area="merchant" current={view} /></div><div className={s.sidebarNote}><Icon name="shield" size={20} /><strong>فضای اختصاصی کسب‌وکار</strong><p>دسترسی پذیرندگی توسط مدیریت صادر می‌شود. سوابق مالی در حساب موبوکام شما نگهداری می‌شوند.</p></div></div></aside><main id="merchant-content" className={s.content} tabIndex={-1}>{children}</main></div>
    <footer className={s.footer}><span>موبوکام‌پی · پنل پذیرندگان</span><span>مبالغ ریالی و اعتبار تتری جدا نمایش داده می‌شوند.</span></footer>
  </div>
}
