'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { kindMeta } from '@/modules/hosting/domain/catalog'
import { SERVICE_STATUS, type ServiceStatus } from '@/modules/hosting/domain/services'
import { DOMAIN_STATUS, type DomainStatus } from '@/modules/hosting/domain/domains'
import { REGION_LABEL, regionOf } from '@/modules/hosting/domain/locations'
import { day, daysLeft, fa, kindIcon } from '../services/shared'

export type CloudService = { id: number; label: string; status: string; hostname: string; ipv4: string; cycle: string; nextDueAt: string | null; product: { kind: string; cpuCores: number; ramMb: number; diskGb: number; diskType: string; location?: string } }
export type CloudDomain = { id: number; name: string; display: string; status: string; expiresAt: string | null; autoRenew: boolean }

/** The member's services and domains from the existing APIs, loaded once per page. */
export function useCloudData() {
  const [services, setServices] = useState<CloudService[] | null>(null), [domains, setDomains] = useState<CloudDomain[] | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(false)
    Promise.all([
      fetch('/api/hosting/services', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch('/api/hosting/domains', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { domains: [] })).catch(() => ({ domains: [] })),
    ]).then(([s, d]) => { if (live) { setServices(s.services || []); setDomains(d.domains || []) } }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [attempt])
  return { services, domains, failed, retry: () => setAttempt((n) => n + 1) }
}

export const isServer = (kind: string) => kindMeta(kind)?.group === 'servers'

export function ServiceCard({ row }: { row: CloudService }) {
  const status = SERVICE_STATUS[row.status as ServiceStatus], left = daysLeft(row.nextDueAt), region = regionOf(row.product.location || '')
  return <Link href={`/dashboard/services/${row.id}`} className={`hs-card is-${row.status.toLowerCase()}`}>
    <span className="hs-card-icon" aria-hidden="true"><Icon name={kindIcon(row.product.kind)} size={22} /></span>
    <span className="hs-card-main">
      <span className="hs-card-kind">{kindMeta(row.product.kind)?.label}{region ? ` · ${REGION_LABEL[region]}` : ''}</span>
      <b>{row.label}</b>
      <span className="hs-card-host" dir="ltr">{row.hostname || row.ipv4 || `#${row.id}`}</span>
      {isServer(row.product.kind) && row.product.cpuCores > 0 && <span className="cl-specs">{fa(row.product.cpuCores)} هسته · {fa(Math.round(row.product.ramMb / 1024) || 0)} گیگ رم · {fa(row.product.diskGb)} گیگ {row.product.diskType}</span>}
    </span>
    <span className="hs-card-side">
      <span className={`dt-state ${status?.tone || ''}`}>{status?.label || row.status}</span>
      {row.status === 'ACTIVE' && left !== null && <span className={`hs-due${left <= 7 ? ' is-near' : ''}`}>{left > 0 ? `${fa(left)} روز تا تمدید` : 'سررسید گذشته'}</span>}
      {row.status === 'ACTIVE' && row.nextDueAt && <span className="hs-due-date">{day.format(new Date(row.nextDueAt))}</span>}
    </span>
  </Link>
}

export function DomainCard({ row }: { row: CloudDomain }) {
  const status = DOMAIN_STATUS[row.status as DomainStatus], left = daysLeft(row.expiresAt)
  return <Link href={`/dashboard/domains/${row.id}`} className={`hs-card is-${row.status.toLowerCase()}`}>
    <span className="hs-card-icon" aria-hidden="true"><Icon name="globe" size={22} /></span>
    <span className="hs-card-main"><span className="hs-card-kind">دامنه{row.autoRenew ? ' · تمدید خودکار' : ''}</span><b dir="ltr">{row.display}</b></span>
    <span className="hs-card-side">
      <span className={`dt-state ${status?.tone || ''}`}>{status?.label || row.status}</span>
      {row.status === 'ACTIVE' && left !== null && <span className={`hs-due${left <= 30 ? ' is-near' : ''}`}>{fa(Math.max(0, left))} روز تا انقضا</span>}
      {row.expiresAt && <span className="hs-due-date">{day.format(new Date(row.expiresAt))}</span>}
    </span>
  </Link>
}

/** Heading, create button and list for one family (servers, hosting or domains). */
export function CloudList({ kind }: { kind: 'servers' | 'hosting' | 'domains' }) {
  const { services, domains, failed, retry } = useCloudData()
  const meta = {
    servers: { title: 'سرورهای من', text: 'سرورهای مجازی، ابری و اختصاصی شما در ایران و خارج.', icon: 'server', create: '/dashboard/cloud/new?type=server', cta: 'ساخت سرور' },
    hosting: { title: 'هاست‌های من', text: 'هاست‌های سایت شما با اطلاعات ورود به کنترل‌پنل و تمدید.', icon: 'layers', create: '/dashboard/cloud/new?type=hosting', cta: 'خرید هاست' },
    domains: { title: 'دامنه‌های من', text: 'انقضا، تمدید، نیم‌سرورها و کد انتقال هر دامنه.', icon: 'globe', create: '/dashboard/cloud/new?type=domain', cta: 'ثبت دامنه' },
  }[kind]
  const rows = kind === 'domains' ? null : services?.filter((row) => (kind === 'servers') === isServer(row.product.kind)) || null
  const loading = kind === 'domains' ? domains === null && !failed : services === null && !failed
  const empty = kind === 'domains' ? domains?.length === 0 : rows?.length === 0
  return <div className="dt-page hs-page cl-page" dir="rtl">
    <header className="dt-head cl-head">
      <div><span className="cl-head-icon" aria-hidden="true"><Icon name={meta.icon} size={22} /></span><h1>{meta.title}</h1><p>{meta.text}</p></div>
      <div className="hs-head-actions"><Link className="btn btn-primary" href={meta.create}><Icon name="plus" size={16} />{meta.cta}</Link></div>
    </header>
    {failed ? <div className="dt-empty is-bad" role="alert"><Icon name={meta.icon} size={28} /><b>فهرست دریافت نشد</b><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" className="btn btn-ghost" onClick={retry}>تلاش دوباره</button></div>
      : loading ? <div className="hs-grid" aria-busy="true">{[0, 1, 2].map((n) => <div key={n} className="hs-card is-skeleton" />)}</div>
      : empty ? <div className="dt-empty cl-empty"><Icon name={meta.icon} size={30} /><b>هنوز موردی ندارید</b><span>چند دقیقه بعد از پرداخت، سرویس این‌جا ظاهر می‌شود.</span><Link className="btn btn-primary" href={meta.create}>{meta.cta}</Link></div>
      : <div className="hs-grid">{kind === 'domains' ? domains!.map((row) => <DomainCard key={row.id} row={row} />) : rows!.map((row) => <ServiceCard key={row.id} row={row} />)}</div>}
  </div>
}
