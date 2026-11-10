'use client'
import SectionName from '@/components/site/SectionName'

import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { daysLeft, day, fa } from '../services/shared'
import { DomainCard, ServiceCard, isServer, useCloudData } from './CloudServices'

const QUICK = [
  { href: '/dashboard/cloud/new?type=server&region=IR', title: 'سرور ایران', text: 'پینگ پایین برای کاربران داخل', icon: 'server', tone: 'ir' },
  { href: '/dashboard/cloud/new?type=server&region=INTL', title: 'سرور خارج', text: 'اروپا، آسیا و آمریکا', icon: 'globe', tone: 'intl' },
  { href: '/dashboard/cloud/new?type=hosting', title: 'هاست سایت', text: 'کنترل‌پنل، ایمیل و پایگاه داده', icon: 'layers', tone: 'web' },
  { href: '/dashboard/cloud/new?type=domain', title: 'دامنه', text: 'ثبت یا انتقال', icon: 'link', tone: 'domain' },
]

/** MoboCom Cloud for the member: what they have, what is due soon, and the fastest way to build more. */
export default function CloudOverview() {
  const { services, domains, failed, retry } = useCloudData()
  const servers = services?.filter((row) => isServer(row.product.kind)) || [], hosting = services?.filter((row) => !isServer(row.product.kind)) || []
  const active = services?.filter((row) => row.status === 'ACTIVE').length || 0
  const due = [
    ...(services || []).filter((row) => row.status === 'ACTIVE' && row.nextDueAt).map((row) => ({ key: `s${row.id}`, href: `/dashboard/services/${row.id}`, label: row.label, at: row.nextDueAt!, what: 'تمدید' })),
    ...(domains || []).filter((row) => row.status === 'ACTIVE' && row.expiresAt).map((row) => ({ key: `d${row.id}`, href: `/dashboard/domains/${row.id}`, label: row.display, at: row.expiresAt!, what: 'انقضا' })),
  ].map((row) => ({ ...row, left: daysLeft(row.at) ?? 0 })).filter((row) => row.left <= 30).sort((a, b) => a.left - b.left).slice(0, 5)
  const loading = services === null && !failed

  return <div className="dt-page cl-page" dir="rtl">
    <header className="cl-hero">
      <span className="cl-orb" aria-hidden="true"><Icon name="cloud" size={30} /></span>
      <div><p className="cw-eyebrow"><SectionName id="hosting" en="MoboCom Cloud">موبوکام کلاد</SectionName></p><h1>زیرساخت شما در یک نگاه</h1><p>سرورهای ایران و خارج، هاست سایت و دامنه‌ها؛ وضعیت، تمدید و ساخت سرویس تازه از همین‌جا.</p></div>
      <Link className="btn btn-primary cl-hero-cta" href="/dashboard/cloud/new"><Icon name="plus" size={18} />ساخت سرویس تازه</Link>
    </header>

    {failed ? <div className="dt-empty is-bad" role="alert"><Icon name="cloud" size={28} /><b>اطلاعات کلاد دریافت نشد</b><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" className="btn btn-ghost" onClick={retry}>تلاش دوباره</button></div> : <>
      <div className="cl-stats" aria-busy={loading}>
        <Link href="/dashboard/cloud/servers" className="cl-stat"><span aria-hidden="true"><Icon name="server" size={20} /></span><b>{loading ? '…' : fa(servers.length)}</b><small>سرور</small></Link>
        <Link href="/dashboard/cloud/hosting" className="cl-stat"><span aria-hidden="true"><Icon name="layers" size={20} /></span><b>{loading ? '…' : fa(hosting.length)}</b><small>هاست</small></Link>
        <Link href="/dashboard/cloud/domains" className="cl-stat"><span aria-hidden="true"><Icon name="globe" size={20} /></span><b>{domains === null ? '…' : fa(domains.length)}</b><small>دامنه</small></Link>
        <div className="cl-stat is-live"><span aria-hidden="true"><Icon name="activity" size={20} /></span><b>{loading ? '…' : fa(active)}</b><small>سرویس فعال</small></div>
      </div>

      <section className="cl-section" aria-labelledby="cl-quick">
        <h2 id="cl-quick">ساخت سریع</h2>
        <div className="cl-quick">{QUICK.map((item) => <Link key={item.href} href={item.href} className={`cl-quick-card is-${item.tone}`}>
          <span className="cl-quick-icon" aria-hidden="true"><Icon name={item.icon} size={22} /></span><b>{item.title}</b><span>{item.text}</span><Icon name="arrow" size={16} className="cl-quick-go" />
        </Link>)}</div>
      </section>

      {due.length > 0 && <section className="cl-section" aria-labelledby="cl-due">
        <h2 id="cl-due">تمدیدهای نزدیک</h2>
        <ul className="cl-due">{due.map((row) => <li key={row.key}><Link href={row.href}>
          <span className={`cl-due-days${row.left <= 7 ? ' is-near' : ''}`}>{row.left > 0 ? `${fa(row.left)} روز` : 'گذشته'}</span>
          <b dir="auto">{row.label}</b><small>{row.what} · {day.format(new Date(row.at))}</small>
        </Link></li>)}</ul>
      </section>}

      {!loading && (servers.length > 0 || hosting.length > 0 || (domains?.length || 0) > 0) && <section className="cl-section" aria-labelledby="cl-recent">
        <h2 id="cl-recent">سرویس‌های اخیر</h2>
        <div className="hs-grid">{[...(services || []).slice(0, 4).map((row) => <ServiceCard key={`s${row.id}`} row={row} />), ...(domains || []).slice(0, 2).map((row) => <DomainCard key={`d${row.id}`} row={row} />)]}</div>
      </section>}
      {!loading && !services?.length && !domains?.length && <div className="dt-empty cl-empty"><Icon name="cloud" size={30} /><b>هنوز سرویسی در کلاد ندارید</b><span>اولین سرور، هاست یا دامنهٔ خود را در چند قدم بسازید.</span><Link className="btn btn-primary" href="/dashboard/cloud/new">شروع کنید</Link></div>}
    </>}
  </div>
}
