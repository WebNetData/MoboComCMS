'use client'
import SectionName from '@/components/site/SectionName'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { kindMeta } from '@/modules/hosting/domain/catalog'
import { SERVICE_STATUS, type ServiceStatus } from '@/modules/hosting/domain/services'
import { DOMAIN_STATUS, type DomainStatus } from '@/modules/hosting/domain/domains'
import { day, daysLeft, fa, kindIcon } from './shared'
import './services.css'

type Row = { id: number; label: string; status: string; hostname: string; ipv4: string; cycle: string; nextDueAt: string | null; product: { kind: string; cpuCores: number; ramMb: number; diskGb: number; diskType: string; location: string } }

type DomainRow = { id: number; name: string; display: string; status: string; expiresAt: string | null; autoRenew: boolean }

/** The member's hosting, servers and cloud services, each with its state and a way into its workspace. */
export default function MyServicesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [domains, setDomains] = useState<DomainRow[]>([])
  useEffect(() => {
    let active = true
    fetch('/api/hosting/domains', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => { if (active && data?.domains) setDomains(data.domains) }).catch(() => null)
    return () => { active = false }
  }, [attempt])
  useEffect(() => {
    let active = true
    fetch('/api/hosting/services', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r))).then((data) => { if (active) { setRows(data.services); setFailed(false) } }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attempt])

  return <div className="dt-page hs-page" dir="rtl">
    <header className="dt-head">
      <div><h1><SectionName id="hosting" en="MoboCom Cloud">موبوکام کلاد</SectionName></h1><p>هاست، سرور، سرویس‌های ابری و دامنه‌های شما؛ وضعیت، اطلاعات ورود و تمدید هر کدام. <Link href="/dashboard/order">خرید سرویس تازه</Link></p></div>
      <div className="hs-head-actions"><Link className="btn btn-ghost" href="/dashboard/order?category=domains">دامنهٔ تازه</Link><Link className="btn btn-ghost" href="/dashboard/order?category=hosting">هاست تازه</Link><Link className="btn btn-primary" href="/dashboard/order?category=servers">سرور تازه</Link></div>
    </header>
    {failed ? <div className="dt-empty is-bad" role="alert"><Icon name="server" size={28} /><b>فهرست سرویس‌ها دریافت نشد</b><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" className="btn btn-ghost" onClick={() => { setFailed(false); setAttempt((n) => n + 1) }}>تلاش دوباره</button></div>
      : rows === null ? <div className="hs-grid" aria-busy="true">{[0, 1, 2].map((n) => <div key={n} className="hs-card is-skeleton" />)}</div>
      : !rows.length ? <div className="dt-empty"><Icon name="server" size={30} /><b>هنوز سرویسی ندارید</b><span>هاست سایت یا سرور مجازی و ابری بخرید؛ همه این‌جا کنار هم مدیریت می‌شوند.</span><div className="hs-head-actions"><Link className="btn btn-primary" href="/dashboard/order?category=hosting">دیدن پلن‌های هاست</Link><Link className="btn btn-ghost" href="/dashboard/order?category=servers">دیدن سرورها</Link></div></div>
      : <div className="hs-grid">{rows.map((row) => {
        const status = SERVICE_STATUS[row.status as ServiceStatus]
        const left = daysLeft(row.nextDueAt)
        return <Link key={row.id} href={`/dashboard/services/${row.id}`} className={`hs-card is-${row.status.toLowerCase()}`}>
          <span className="hs-card-icon" aria-hidden="true"><Icon name={kindIcon(row.product.kind)} size={22} /></span>
          <span className="hs-card-main">
            <span className="hs-card-kind">{kindMeta(row.product.kind)?.label}</span>
            <b>{row.label}</b>
            <span className="hs-card-host" dir="ltr">{row.hostname || row.ipv4 || `#${row.id}`}</span>
          </span>
          <span className="hs-card-side">
            <span className={`dt-state ${status?.tone || ''}`}>{status?.label || row.status}</span>
            {row.status === 'ACTIVE' && left !== null && <span className={`hs-due${left <= 7 ? ' is-near' : ''}`}>{left > 0 ? `${fa(left)} روز تا تمدید` : 'سررسید گذشته'}</span>}
            {row.status === 'ACTIVE' && row.nextDueAt && <span className="hs-due-date">{day.format(new Date(row.nextDueAt))}</span>}
          </span>
        </Link>
      })}</div>}
    {domains.length > 0 && <>
      <h2 className="hs-section-title"><Icon name="globe" size={18} />دامنه‌ها</h2>
      <div className="hs-grid">{domains.map((row) => {
        const status = DOMAIN_STATUS[row.status as DomainStatus]
        const left = daysLeft(row.expiresAt)
        return <Link key={row.id} href={`/dashboard/domains/${row.id}`} className={`hs-card is-${row.status.toLowerCase()}`}>
          <span className="hs-card-icon" aria-hidden="true"><Icon name="globe" size={22} /></span>
          <span className="hs-card-main"><span className="hs-card-kind">دامنه{row.autoRenew ? ' · تمدید خودکار' : ''}</span><b dir="ltr">{row.display}</b></span>
          <span className="hs-card-side">
            <span className={`dt-state ${status?.tone || ''}`}>{status?.label || row.status}</span>
            {row.status === 'ACTIVE' && left !== null && <span className={`hs-due${left <= 30 ? ' is-near' : ''}`}>{fa(Math.max(0, left))} روز تا انقضا</span>}
            {row.expiresAt && <span className="hs-due-date">{day.format(new Date(row.expiresAt))}</span>}
          </span>
        </Link>
      })}</div>
    </>}
  </div>
}
