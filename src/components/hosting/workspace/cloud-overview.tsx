'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { isServer, useCloudData } from '@/app/dashboard/cloud/CloudServices'
import { day, daysLeft, fa } from '@/app/dashboard/services/shared'
import { SERVICE_STATUS, type ServiceStatus } from '@/modules/hosting/domain/services'
import { DOMAIN_STATUS, type DomainStatus } from '@/modules/hosting/domain/domains'
import type { CloudWorkspaceOverview } from '@/modules/hosting/domain/workspace'
import { formatMoney } from '@/shared/money'
import s from './cloud-overview.module.css'

const invoiceStatus: Record<string, string> = { PAID: 'پرداخت‌شده', UNPAID: 'پرداخت‌نشده', PENDING: 'در انتظار پرداخت', VOID: 'باطل‌شده', CANCELLED: 'لغوشده', OVERDUE: 'سررسید گذشته' }
const actionKind: Record<string, string> = { REGISTER: 'ثبت دامنه', TRANSFER: 'انتقال دامنه', RENEW: 'تمدید', NAMESERVERS: 'تغییر نیم‌سرورها', AUTHCODE: 'درخواست کد انتقال', EXPIRE: 'انقضا', TRAFFIC: 'افزایش ترافیک', UPGRADE: 'ارتقای سرویس', SUSPEND: 'تعلیق سرویس', UNSUSPEND: 'فعال‌سازی سرویس', TERMINATE: 'پایان سرویس', CANCEL: 'لغو', NOTE: 'یادداشت' }
const actionStatus: Record<string, string> = { WAITING: 'در انتظار', PENDING: 'در انتظار', RUNNING: 'در حال انجام', PROCESSING: 'در حال انجام', SUCCESS: 'انجام‌شده', COMPLETED: 'انجام‌شده', DONE: 'انجام‌شده', FAILED: 'ناموفق', CANCELLED: 'لغوشده' }
const date = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? 'تاریخ نامشخص' : day.format(d) }

export default function CloudOverview() {
  const { services, domains, failed, retry } = useCloudData()
  const [overview, setOverview] = useState<CloudWorkspaceOverview | null>(null)
  const [overviewFailed, setOverviewFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setOverview(null)
    setOverviewFailed(false)
    fetch('/api/hosting/workspace?view=overview', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Overview unavailable')
        const data: CloudWorkspaceOverview = await response.json()
        if (!Array.isArray(data.recentInvoices) || !Array.isArray(data.activity)) throw new Error('Invalid overview')
        return data
      })
      .then(setOverview)
      .catch(() => { if (!controller.signal.aborted) setOverviewFailed(true) })
    return () => controller.abort()
  }, [attempt])

  const servers = (services || []).filter(row => isServer(row.product.kind))
  const hosting = (services || []).filter(row => !isServer(row.product.kind))
  const allocated = servers.filter(row => row.status === 'ACTIVE')
  const capacity = allocated.reduce((sum, row) => ({ cpu: sum.cpu + row.product.cpuCores, ram: sum.ram + row.product.ramMb, disk: sum.disk + row.product.diskGb }), { cpu: 0, ram: 0, disk: 0 })
  const attention = [
    ...(services || []).filter(row => ['FAILED', 'SUSPENDED'].includes(row.status) || (row.status === 'ACTIVE' && row.nextDueAt && (daysLeft(row.nextDueAt) ?? Infinity) <= 30)).map(row => ({ key: `s${row.id}`, href: `/cloud/dashboard/services/${row.id}`, label: row.label, status: SERVICE_STATUS[row.status as ServiceStatus]?.label || row.status, at: row.status === 'ACTIVE' ? row.nextDueAt : null })),
    ...(domains || []).filter(row => row.status === 'EXPIRED' || (row.status === 'ACTIVE' && row.expiresAt && (daysLeft(row.expiresAt) ?? Infinity) <= 30)).map(row => ({ key: `d${row.id}`, href: `/cloud/dashboard/domains/${row.id}`, label: row.display, status: DOMAIN_STATUS[row.status as DomainStatus]?.label || row.status, at: row.status === 'ACTIVE' ? row.expiresAt : null })),
  ].slice(0, 6)
  const loading = services === null || domains === null

  return <div className={s.page} dir="rtl">
    <header className={s.heading}><div><span className={s.eyebrow}>پنل ابری</span><h1>زیرساخت شما در یک نگاه</h1><p>سرویس‌ها، دامنه‌ها و صورتحساب‌های خود را از اینجا پیگیری کنید.</p></div><Link className={s.primary} href="/cloud/dashboard/new"><Icon name="plus" size={18} /> سرویس جدید</Link></header>
    {failed ? <div className={s.message} role="alert"><strong>اطلاعات سرویس‌ها دریافت نشد</strong><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" onClick={retry}>تلاش دوباره</button></div> : <>
      <section aria-label="سرویس‌های شما" className={s.stats} aria-busy={loading}>
        {[{ title: 'سرورها', count: servers.length, icon: 'server', href: '/cloud/dashboard/servers' }, { title: 'میزبانی', count: hosting.length, icon: 'layers', href: '/cloud/dashboard/hosting' }, { title: 'دامنه‌ها', count: domains?.length || 0, icon: 'globe', href: '/cloud/dashboard/domains' }].map(item => <Link className={s.stat} href={item.href} key={item.href}><span className={s.icon}><Icon name={item.icon} size={20} /></span><span><small>{item.title}</small><strong>{loading ? '…' : fa(item.count)}</strong></span><Icon name="arrow" size={16} /></Link>)}
      </section>
      <div className={s.grid}>
        <section className={s.panel} aria-labelledby="cloud-attention"><div className={s.panelHead}><div><h2 id="cloud-attention">نیازمند توجه</h2><p>سرویس‌های معلق یا ناموفق و سررسیدهای تا ۳۰ روز آینده</p></div></div>
          {loading ? <p className={s.empty} role="status">در حال دریافت سرویس‌ها…</p> : attention.length ? <ul className={s.rows}>{attention.map(row => <li key={row.key}><Link href={row.href}><span><strong dir="auto">{row.label}</strong><small>{row.at ? `سررسید · ${date(row.at)}` : row.status}</small></span><Icon name="arrow" size={16} /></Link></li>)}</ul> : <p className={s.empty}>در حال حاضر موردی نیازمند توجه نیست.</p>}
        </section>
        <section className={s.panel} aria-labelledby="cloud-capacity"><div className={s.panelHead}><div><h2 id="cloud-capacity">ظرفیت تخصیص‌یافته</h2><p>مجموع مشخصات طرح سرورهای فعال؛ میزان مصرف نیست</p></div><span className={s.icon}><Icon name="cpu" size={20} /></span></div>
          {loading ? <p className={s.empty} role="status">در حال دریافت ظرفیت…</p> : allocated.length ? <dl className={s.capacity}><div><dt>پردازنده</dt><dd>{fa(capacity.cpu)} <small>هسته</small></dd></div><div><dt>حافظه</dt><dd>{fa(capacity.ram)} <small>مگابایت</small></dd></div><div><dt>فضای دیسک</dt><dd>{fa(capacity.disk)} <small>گیگابایت</small></dd></div></dl> : <p className={s.empty}>سرور فعالی برای نمایش ظرفیت وجود ندارد.</p>}
        </section>
      </div>
      {!loading && !services?.length && !domains?.length && <div className={s.message}><strong>هنوز سرویس ابری ندارید</strong><span>برای شروع، سرور، میزبانی یا دامنه انتخاب کنید.</span><Link href="/cloud/dashboard/new">انتخاب سرویس</Link></div>}
    </>}
    <div className={s.grid}>
      <section className={s.panel} aria-labelledby="cloud-invoices"><div className={s.panelHead}><div><h2 id="cloud-invoices">صورتحساب‌های اخیر</h2><p>آخرین صورتحساب‌های سرویس‌های ابری</p></div><Link href="/cloud/dashboard/invoices">همه صورتحساب‌ها</Link></div>
        {overviewFailed ? <div className={s.empty} role="alert">دریافت صورتحساب‌ها و فعالیت‌ها انجام نشد. <button type="button" onClick={() => setAttempt(n => n + 1)}>تلاش دوباره</button></div> : !overview ? <p className={s.empty} role="status">در حال دریافت…</p> : overview.recentInvoices.length ? <ul className={s.rows}>{overview.recentInvoices.map(row => <li key={row.orderId}><Link href={`/cloud/dashboard/invoices/${encodeURIComponent(row.number)}`}><span><strong dir="auto">{row.title}</strong><small>{date(row.issuedAt)} · {invoiceStatus[row.status] || row.status}</small></span><bdi className={s.amount}>{formatMoney(BigInt(row.totalMinor), row.currency, 'fa-IR')}</bdi></Link></li>)}</ul> : <p className={s.empty}>{overview.financialHasMore ? 'برای بررسی سوابق قدیمی‌تر، فهرست همهٔ صورتحساب‌ها را باز کنید.' : 'هنوز صورتحساب ابری ثبت نشده است.'}</p>}
      </section>
      <section className={s.panel} aria-labelledby="cloud-activity"><div className={s.panelHead}><div><h2 id="cloud-activity">فعالیت‌های اخیر</h2><p>آخرین عملیات ثبت‌شده روی سرویس‌ها و دامنه‌ها</p></div><span className={s.icon}><Icon name="activity" size={20} /></span></div>
        {overviewFailed ? <p className={s.empty}>فعالیت‌ها در دسترس نیستند.</p> : !overview ? <p className={s.empty} role="status">در حال دریافت…</p> : overview.activity.length ? <ul className={s.rows}>{overview.activity.map(row => <li key={row.id}><Link href={row.href}><span><strong dir="auto">{row.label}</strong><small>{actionKind[row.kind] || 'عملیات سرویس'} · {date(row.at)}</small></span><span className={s.status}>{actionStatus[row.status] || 'ثبت‌شده'}</span></Link></li>)}</ul> : <p className={s.empty}>هنوز فعالیتی ثبت نشده است.</p>}
      </section>
    </div>
  </div>
}
