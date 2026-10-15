'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useSite } from '@/components/site/SiteProvider'
import Icon from '@/components/site/Icon'
import BrandMark from '@/components/BrandMark'
import BrandLockup from '@/components/site/SiteLogo'
import NotificationCount from '@/components/NotificationCount'
import ApplyForm from './ApplyForm'
import { SellerContext, type SellerAccount } from './SellerContext'

const NAV = [
  { href: '/seller', label: 'پیشخوان فروشنده', icon: 'grid', exact: true },
  { href: '/seller/orders', label: 'سفارش‌ها', icon: 'wallet' },
  { href: '/seller/products', label: 'محصولات من', icon: 'devices' },
  { href: '/seller/products/new', label: 'افزودن محصول', icon: 'sparkles', exact: true },
  { href: '/seller/finance', label: 'مالی و تسویه', icon: 'wallet' },
  { href: '/seller/reviews', label: 'امتیاز و نظر خریداران', icon: 'chat' },
  { href: '/seller/profile', label: 'پروفایل فروشگاه', icon: 'sliders' },
]

type Account = { signupOpen: boolean; terms: string; seller: SellerAccount | null }

/** Seller panel shell: shows the application or its status until the shop is approved. */
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const site = useSite()
  const { status } = useSession()
  const pathname = usePathname()
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/seller', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setAccount(body); setError('') } else setError(response?.status === 404 ? 'بازار فروشندگان در این سایت فعال نیست.' : body?.error || 'بارگذاری نشد')
  }, [])

  useEffect(() => { if (status === 'unauthenticated') window.location.href = `/login?next=${encodeURIComponent(pathname || '/seller')}` }, [status, pathname])
  useEffect(() => { if (status === 'authenticated') void load() }, [status, load])

  if (status !== 'authenticated' || (!account && !error)) return <div className="sl-center"><div className="sa-skeleton" aria-busy="true" /></div>
  if (error) return <div className="sl-center"><div className="sa-card sl-state"><h1>پنل فروشندگی</h1><p>{error}</p><Link href="/" className="btn btn-ghost">بازگشت به سایت</Link></div></div>

  const seller = account!.seller
  if (!seller || seller.status === 'REJECTED') {
    if (!seller && !account!.signupOpen) return <div className="sl-center"><div className="sa-card sl-state"><h1>ثبت‌نام فروشنده بسته است</h1><p>در حال حاضر فروشندهٔ تازه پذیرفته نمی‌شود.</p><Link href="/" className="btn btn-ghost">بازگشت به سایت</Link></div></div>
    return <div className="sl-page" dir="rtl"><SellerTop brand={site.brand} /><div className="sl-narrow"><ApplyForm previous={seller} terms={account!.terms} onDone={() => void load()} /></div></div>
  }
  if (seller.status !== 'ACTIVE') {
    const pending = seller.status === 'PENDING'
    return <div className="sl-page" dir="rtl"><SellerTop brand={site.brand} /><div className="sl-center"><div className="sa-card sl-state">
      <span className={`sl-state-icon ${pending ? 'is-wait' : 'is-bad'}`} aria-hidden="true">{pending ? '⏳' : '⛔'}</span>
      <h1>{pending ? 'درخواست شما در حال بررسی است' : 'فروشگاه شما تعلیق شده است'}</h1>
      <p>{pending ? `«${seller.shopName}» ثبت شد. پس از بررسی مدارک، نتیجه با اعلان و پیامک به شما خبر داده می‌شود.` : seller.statusNote || 'برای اطلاع از دلیل و رفع تعلیق با پشتیبانی تماس بگیرید.'}</p>
      <div className="sl-state-actions"><Link href="/dashboard/tickets" className="btn btn-ghost">تماس با پشتیبانی</Link><Link href="/" className="btn btn-ghost">بازگشت به سایت</Link></div>
    </div></div></div>
  }

  const isOn = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href) && !(href === '/seller/products' && pathname === '/seller/products/new'))
  const links = <>
    {NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={isOn(item.href, item.exact) ? 'page' : undefined} className={`side-link ${isOn(item.href, item.exact) ? 'side-link-active' : ''}`}><span className="side-icon"><Icon name={item.icon} size={19} /></span> {item.label}</Link>)}
    <div className="side-group side-group-rule">
      <Link href={`/shop/${seller.slug}`} className="side-link" target="_blank"><span className="side-icon"><Icon name="globe" size={19} /></span> مشاهدهٔ فروشگاه من</Link>
      <Link href="/dashboard" className="side-link"><span className="side-icon"><Icon name="shield" size={19} /></span> حساب کاربری</Link>
      <Link href="/dashboard/notifications" className="side-link"><span className="side-icon"><Icon name="bell" size={19} /></span> اعلان‌ها <NotificationCount /></Link>
    </div>
  </>

  return <SellerContext.Provider value={{ seller, reload: () => void load() }}>
    <div className="app-shell user-shell sl-shell" dir="rtl">
      <aside className="side">
        <Link href="/" className="side-brand"><BrandLockup /></Link>
        <div className="side-user sl-side-shop">
          {seller.logo ? <img src={seller.logo} alt="" className="sl-logo" /> : <span className="avatar" style={{ background: 'var(--primary)' }}>{seller.shopName.slice(0, 1)}</span>}
          <div className="min-w-0"><div className="font-semibold text-sm truncate">{seller.shopName}</div><div className="muted text-xs">پنل فروشندگی</div></div>
        </div>
        <nav className="side-nav" aria-label="پنل فروشندگی">{links}</nav>
        <div className="side-foot"><button onClick={() => signOut({ callbackUrl: '/' })} className="muted text-sm hover-text-danger">خروج</button></div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="mobile-bar">
          <Link href="/seller" className="side-brand" style={{ padding: 0 }}><span className="brand-mark"><BrandMark /></span> {seller.shopName}</Link>
          <button className="icon-btn" aria-label={open ? 'بستن منو' : 'باز کردن منو'} aria-expanded={open} aria-controls="seller-mobile-nav" onClick={() => setOpen((v) => !v)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button>
        </div>
        <nav id="seller-mobile-nav" className="mobile-drawer" hidden={!open} aria-label="پنل فروشندگی">{links}</nav>
        <main className="app-main sl-main">{children}</main>
      </div>
    </div>
  </SellerContext.Provider>
}

function SellerTop({ brand }: { brand: string }) {
  return <header className="sl-top"><Link href="/" className="side-brand"><span className="brand-mark"><BrandMark /></span> {brand}</Link><Link href="/dashboard" className="btn btn-ghost btn-sm">حساب کاربری</Link></header>
}
