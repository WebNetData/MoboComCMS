'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { isServer, useCloudData, type CloudService } from '@/app/dashboard/cloud/CloudServices'
import { day, daysLeft, fa } from '@/app/dashboard/services/shared'
import { SERVICE_STATUS, type ServiceStatus } from '@/modules/hosting/domain/services'
import { DOMAIN_STATUS, type DomainStatus } from '@/modules/hosting/domain/domains'
import { kindMeta } from '@/modules/hosting/domain/catalog'
import type { CloudWorkspaceOverview } from '@/modules/hosting/domain/workspace'
import { formatMoney } from '@/shared/money'
import s from './cloud-overview.module.css'

const base = '/cloud/dashboard'
const invoiceStatus: Record<string, string> = { PAID: 'پرداخت‌شده', UNPAID: 'پرداخت‌نشده', PENDING: 'در انتظار پرداخت', VOID: 'باطل‌شده', CANCELLED: 'لغوشده', OVERDUE: 'سررسید گذشته' }
const actionKind: Record<string, string> = { REGISTER: 'ثبت دامنه', TRANSFER: 'انتقال دامنه', RENEW: 'تمدید', NAMESERVERS: 'تغییر نیم‌سرورها', AUTHCODE: 'درخواست کد انتقال', EXPIRE: 'انقضا', TRAFFIC: 'افزایش ترافیک', UPGRADE: 'ارتقای سرویس', SUSPEND: 'تعلیق سرویس', UNSUSPEND: 'فعال‌سازی سرویس', TERMINATE: 'پایان سرویس', CANCEL: 'لغو', NOTE: 'یادداشت' }
const actionStatus: Record<string, string> = { WAITING: 'در انتظار', PENDING: 'در انتظار', RUNNING: 'در حال انجام', PROCESSING: 'در حال انجام', SUCCESS: 'انجام‌شده', COMPLETED: 'انجام‌شده', DONE: 'انجام‌شده', FAILED: 'ناموفق', CANCELLED: 'لغوشده' }

const date = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'تاریخ نامشخص' : day.format(parsed)
}

function OverviewBanner() {
  return <header className={s.hero}>
    <div className={s.heroCopy}>
      <p className={s.heroLabel}><Icon name="cloud" size={17} /> ابر موبوکام</p>
      <h1>پیشخوان ابری شما</h1>
      <p className={s.heroDescription}>سرویس‌ها و دامنه‌هایتان را مدیریت کنید و سررسیدها را در یک نگاه ببینید.</p>
      <div className={s.heroActions}>
        <Link className={s.primary} href={base + '/new'}><Icon name="plus" size={18} /> ساخت سرویس</Link>
        <Link className={s.secondary} href={base + '/wallet'}><Icon name="wallet" size={17} /> کیف پول</Link>
      </div>
    </div>
    <div className={s.heroArt} aria-hidden="true">
      <div className={s.gridPlane} />
      <div className={s.orbit} />
      <div className={s.rack}><i /><i /><i /><i /></div>
      <div className={s.satellite}><Icon name="globe" size={26} /></div>
      <div className={s.nodeLight} />
    </div>
  </header>
}

function Empty({ icon, children }: { icon: string; children: string }) {
  return <p className={s.empty}><Icon name={icon} size={19} />{children}</p>
}

async function overviewPayload(response: Response): Promise<CloudWorkspaceOverview> {
  if (!response.ok) throw new Error('Overview unavailable')
  const data: CloudWorkspaceOverview = await response.json()
  if (!Array.isArray(data.recentInvoices) || !Array.isArray(data.activity)) throw new Error('Invalid overview')
  return data
}

function useOverview() {
  const [overview, setOverview] = useState<CloudWorkspaceOverview | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/hosting/workspace?view=overview', { cache: 'no-store', signal: controller.signal })
      .then(overviewPayload)
      .then(data => {
        if (!controller.signal.aborted) setOverview(data)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [attempt])
  return { overview, failed, retry: () => { setFailed(false); setAttempt(value => value + 1) } }
}

function Invoices({ overview, failed, retry }: ReturnType<typeof useOverview>) {
  return <section className={s.panel} aria-labelledby="cloud-invoices">
      <div className={s.panelHead}><h2 id="cloud-invoices"><Icon name="receipt" size={19} />صورتحساب‌های اخیر</h2><Link href={base + '/invoices'}>همهٔ صورتحساب‌ها<Icon name="arrow" size={15} /></Link></div>
      {failed ? <div className={s.error} role="alert">دریافت صورتحساب‌ها انجام نشد.<button type="button" onClick={retry}>تلاش دوباره</button></div>
        : !overview ? <p className={s.empty} role="status">در حال دریافت صورتحساب‌ها…</p>
        : overview.recentInvoices.length ? <ul className={s.rows}>{overview.recentInvoices.map(row =>
          <li key={row.orderId}><Link href={base + '/invoices/' + encodeURIComponent(row.number)}>
            <span className={s.rowText}><strong><bdi>{row.title}</bdi></strong><small>{date(row.issuedAt)} · {invoiceStatus[row.status] || row.status}</small></span>
            <bdi className={s.amount}>{formatMoney(BigInt(row.totalMinor), row.currency, 'fa-IR')}</bdi>
          </Link></li>
        )}</ul> : <Empty icon="receipt">{overview.financialHasMore ? 'سوابق قدیمی‌تر را در فهرست صورتحساب‌ها ببینید.' : 'هنوز صورتحساب ابری ثبت نشده است.'}</Empty>}
  </section>
}

function Activity({ overview, failed }: Pick<ReturnType<typeof useOverview>, 'overview' | 'failed'>) {
  return <section className={s.panel} aria-labelledby="cloud-activity">
      <div className={s.panelHead}><h2 id="cloud-activity"><Icon name="activity" size={19} />فعالیت‌های اخیر</h2></div>
      {failed ? <Empty icon="activity">فعالیت‌ها در دسترس نیستند.</Empty>
        : !overview ? <p className={s.empty} role="status">در حال دریافت فعالیت‌ها…</p>
        : overview.activity.length ? <ul className={s.rows}>{overview.activity.map(row =>
          <li key={row.id}><Link href={row.href}>
            <span className={s.rowText}><strong><bdi>{row.label}</bdi></strong><small>{actionKind[row.kind] || 'عملیات سرویس'} · {date(row.at)}</small></span>
            <span className={s.badge}>{actionStatus[row.status] || 'ثبت‌شده'}</span>
          </Link></li>
        )}</ul> : <Empty icon="activity">هنوز فعالیتی ثبت نشده است.</Empty>}
  </section>
}

function Capacity({ loading, hasServers, capacity }: { loading: boolean; hasServers: boolean; capacity: { cpu: number; ram: number; disk: number } }) {
  return <section className={s.panel} aria-labelledby="cloud-capacity">
    <div className={s.panelHead}><h2 id="cloud-capacity"><Icon name="cpu" size={19} />ظرفیت تخصیص‌یافته</h2></div>
    {loading ? <p className={s.empty} role="status">در حال دریافت ظرفیت…</p> : hasServers ? <>
      <p className={s.caption}>ظرفیت طرح‌های فعال، بر اساس مشخصات سرورها</p>
      <dl className={s.capacity}>{[
        { value: capacity.cpu, unit: 'هسته', label: 'پردازنده' },
        { value: capacity.ram, unit: 'مگابایت', label: 'حافظه' },
        { value: capacity.disk, unit: 'گیگابایت', label: 'دیسک' },
      ].map(({ value, unit, label }) => <div key={label}><dt>{label}</dt><dd>{fa(value)}<small>{unit}</small></dd></div>)}</dl>
    </> : <Empty icon="cpu">هنوز ظرفیتی به سرور فعال اختصاص نیافته است.</Empty>}
  </section>
}

function Inventory({ loading, services }: { loading: boolean; services: CloudService[] }) {
  return <section className={s.panel} aria-labelledby="cloud-services">
    <div className={s.panelHead}><h2 id="cloud-services"><Icon name="layers" size={19} />سرویس‌های من</h2><Link href={base + '/services'}>همهٔ سرویس‌ها<Icon name="arrow" size={15} /></Link></div>
    {loading ? <p className={s.empty} role="status">در حال دریافت سرویس‌ها…</p> : services.length ?
      <ul className={s.rows}>{services.slice(0, 5).map(row => <li key={row.id}><Link href={base + '/services/' + row.id}>
        <span className={s.icon}><Icon name={isServer(row.product.kind) ? 'server' : 'database'} size={18} /></span>
        <span className={s.rowText}><strong><bdi>{row.label}</bdi></strong><small>{kindMeta(row.product.kind)?.label || 'سرویس ابری'}{row.hostname && <> · <bdi dir="ltr">{row.hostname}</bdi></>}</small></span>
        <span className={s.badge} data-active={row.status === 'ACTIVE' || undefined}>{SERVICE_STATUS[row.status as ServiceStatus]?.label ?? row.status}</span>
      </Link></li>)}</ul> :
      <div className={s.start}><Empty icon="server">هنوز سرور یا میزبانی ندارید.</Empty><Link href={base + '/new'}>انتخاب سرویس<Icon name="arrow" size={15} /></Link></div>}
  </section>
}

type AttentionItem = { key: string; href: string; label: string; status: string; at: string | null }

function Attention({ loading, items }: { loading: boolean; items: AttentionItem[] }) {
  return <section className={s.panel} aria-labelledby="cloud-attention">
    <div className={s.panelHead}><h2 id="cloud-attention"><Icon name="clock" size={19} />نیازمند توجه</h2>{items.length > 0 && <span className={s.badge} data-attention>{fa(items.length)} مورد</span>}</div>
    {loading ? <p className={s.empty} role="status">در حال بررسی سررسیدها…</p> : items.length ?
      <ul className={s.rows}>{items.slice(0, 6).map(row => <li key={row.key}><Link href={row.href}>
        <span className={s.rowText}><strong><bdi>{row.label}</bdi></strong><small>{row.at ? 'سررسید ' + date(row.at) : row.status}</small></span><Icon name="arrow" size={16} />
      </Link></li>)}</ul> : <Empty icon="check">سررسید نزدیک یا سرویس نیازمند رسیدگی ندارید.</Empty>}
  </section>
}

export default function CloudOverview() {
  const { services, domains, failed, retry } = useCloudData()
  const history = useOverview()
  const loading = !failed && (services === null || domains === null)
  const servers = (services ?? []).filter(row => isServer(row.product.kind))
  const hosted = (services ?? []).filter(row => !isServer(row.product.kind))
  const allocated = servers.filter(row => row.status === 'ACTIVE')
  const cards = [
    { label: 'سرورها', icon: 'server', path: 'servers', rows: servers, active: allocated.length },
    { label: 'میزبانی', icon: 'database', path: 'hosting', rows: hosted, active: hosted.filter(row => row.status === 'ACTIVE').length },
    { label: 'دامنه‌ها', icon: 'globe', path: 'domains', rows: domains ?? [], active: domains?.filter(row => row.status === 'ACTIVE').length ?? 0 },
  ]
  const capacity = allocated.reduce((sum, row) => ({
    cpu: sum.cpu + row.product.cpuCores, ram: sum.ram + row.product.ramMb, disk: sum.disk + row.product.diskGb,
  }), { cpu: 0, ram: 0, disk: 0 })
  const attention = [
    ...(services ?? []).filter(row => ['FAILED', 'SUSPENDED'].includes(row.status) || (row.status === 'ACTIVE' && (daysLeft(row.nextDueAt) ?? Infinity) <= 30))
      .map(row => ({ key: 's' + row.id, href: base + '/services/' + row.id, label: row.label, status: SERVICE_STATUS[row.status as ServiceStatus]?.label ?? row.status, at: row.status === 'ACTIVE' ? row.nextDueAt : null })),
    ...(domains ?? []).filter(row => row.status === 'EXPIRED' || (row.status === 'ACTIVE' && (daysLeft(row.expiresAt) ?? Infinity) <= 30))
      .map(row => ({ key: 'd' + row.id, href: base + '/domains/' + row.id, label: row.display, status: DOMAIN_STATUS[row.status as DomainStatus]?.label ?? row.status, at: row.status === 'ACTIVE' ? row.expiresAt : null })),
  ].sort((a, b) => (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0))

  return <div className={s.page} dir="rtl">
    <OverviewBanner />
    {failed ? <div className={s.error} role="alert">اطلاعات سرویس‌ها دریافت نشد.<button type="button" onClick={retry}>تلاش دوباره</button></div> : <>
      <section aria-label="خلاصهٔ منابع ابری" className={s.stats} aria-busy={loading}>
        {cards.map(card => <Link className={s.stat} href={base + '/' + card.path} key={card.path} data-resource={card.path}>
          <span className={s.statHead}><span className={s.icon}><Icon name={card.icon} size={20} /></span><Icon name="arrow" size={17} /></span>
          <span className={s.statValue}><span>{card.label}</span><strong>{loading ? '…' : fa(card.rows.length)}</strong></span>
          {!loading && <span className={s.statFoot}><span className={s.dot} />{fa(card.active)} فعال</span>}
        </Link>)}
      </section>
      <div className={s.operations}>
        <Inventory loading={loading} services={services ?? []} />
        <Attention loading={loading} items={attention} />
      </div>
    </>}
    <div className={s.history}>
      {!failed && <Capacity loading={loading} hasServers={allocated.length > 0} capacity={capacity} />}
      <Invoices {...history} />
      <Activity overview={history.overview} failed={history.failed} />
    </div>
  </div>
}
