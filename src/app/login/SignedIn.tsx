'use client'

import Link from '@/components/AppLink'
import { signOut } from 'next-auth/react'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { useSite } from '@/components/site/SiteProvider'
import { translate } from '@/modules/site/config/types'

export type SignedInPerson = { name: string; email: string; image: string | null; admin: boolean }

const ACCOUNT = [
  ['/dashboard', 'grid', 'پیشخوان', 'Dashboard'],
  ['/dashboard/orders', 'bag', 'سفارش‌ها', 'Orders'],
  ['/dashboard/wallet', 'wallet', 'کیف پول', 'Wallet'],
  ['/dashboard/invoices', 'receipt', 'فاکتورها', 'Invoices'],
  ['/dashboard/requests', 'file', 'درخواست‌های من', 'My requests'],
  ['/dashboard/tickets', 'lifebuoy', 'پشتیبانی', 'Support'],
] as const

const SECTION_ICON: Record<string, string> = { '/products': 'bag', '/shop': 'bag', '/blog': 'book', '/music': 'music', '/cinema': 'film', '/games': 'gamepad', '/software': 'box', '/forum': 'chat', '/vip': 'crown' }

/** What a member who is already signed in sees on the sign-in and sign-up pages: where to go next, not a form. */
export default function SignedIn({ person, next }: { person: SignedInPerson; next: string }) {
  const { locale } = useI18n()
  const site = useSite()
  const fa = locale === 'fa'
  const sections = site.navigation.filter((link) => link.href !== '/' && link.href.startsWith('/')).slice(0, 8)
  const initial = (person.name || person.email || '?').trim().slice(0, 1).toUpperCase()

  return (
    <div className="auth-signed" role="status" aria-live="polite">
      <div className="auth-signed-badge" aria-hidden="true">
        {person.image ? <img src={person.image} alt="" /> : <span>{initial}</span>}
        <i><Icon name="check" size={14} /></i>
      </div>
      <p className="auth-form-eyebrow">{fa ? 'ورود انجام شده است' : 'SIGNED IN'}</p>
      <h1>{fa ? 'شما وارد حساب کاربری خود شده‌اید' : 'You are already signed in'}</h1>
      <p className="auth-form-intro">
        {fa ? <>با حساب <b dir="auto">{person.name || person.email}</b> وارد شده‌اید{person.name && person.email ? <> (<span dir="ltr">{person.email}</span>)</> : null}. برای ادامه یکی از بخش‌های زیر را انتخاب کنید.</>
          : <>You are signed in as <b dir="auto">{person.name || person.email}</b>. Choose where to go next.</>}
      </p>

      <div className="auth-signed-main">
        {next && <Link href={next} className="btn btn-primary">{fa ? 'ادامه از جایی که بودید' : 'Continue where you were'}<Icon name="arrow" size={18} /></Link>}
        <Link href="/dashboard" className={next ? 'btn btn-ghost' : 'btn btn-primary'}><Icon name="grid" size={18} />{fa ? 'ورود به پنل کاربری' : 'Open my account'}</Link>
        {person.admin && <Link href="/admin" className="btn btn-ghost auth-signed-admin"><Icon name="shield" size={18} />{fa ? 'پنل مدیریت' : 'Admin panel'}</Link>}
      </div>

      <h2 className="auth-signed-title">{fa ? 'حساب من' : 'My account'}</h2>
      <nav className="auth-signed-grid" aria-label={fa ? 'حساب من' : 'My account'}>
        {ACCOUNT.map(([href, icon, faLabel, enLabel]) => <Link key={href} href={href} className="auth-signed-tile"><span><Icon name={icon} size={18} /></span>{fa ? faLabel : enLabel}</Link>)}
      </nav>

      {sections.length > 0 && <>
        <h2 className="auth-signed-title">{fa ? 'بخش‌های سایت' : 'Explore'}</h2>
        <nav className="auth-signed-sections" aria-label={fa ? 'بخش‌های سایت' : 'Explore'}>
          {sections.map((link) => <Link key={link.href} href={link.href}><Icon name={SECTION_ICON[link.href] || 'layers'} size={16} />{translate(link.label, locale)}</Link>)}
        </nav>
      </>}

      <p className="auth-signed-switch">
        {fa ? 'حساب دیگری دارید؟' : 'Another account?'}{' '}
        <button type="button" className="link-button" onClick={() => void signOut({ callbackUrl: '/login' })}>{fa ? 'خروج و ورود با حساب دیگر' : 'Sign out and use another account'}</button>
      </p>
    </div>
  )
}
