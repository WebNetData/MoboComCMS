'use client'

import { use, useEffect, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { cycleMeta, kindMeta } from '@/modules/hosting/domain/catalog'
import { SERVICE_STATUS, type ServiceStatus } from '@/modules/hosting/domain/services'
import { day, daysLeft, fa, kindIcon, moment } from '../shared'
import '../services.css'

type Service = {
  id: number; label: string; status: string; cycle: string; hostname: string; ipv4: string; ipv6: string; panelUrl: string; loginUser: string; hasPassword: boolean
  note: string; startedAt: string | null; nextDueAt: string | null; suspendedAt: string | null; createdAt: string; allowTraffic: boolean; allowUpgrade: boolean
  product: { kind: string; name: string; cpuCores: number; ramMb: number; diskGb: number; diskType: string; trafficGb: number; bandwidthMbps: number; sites: number; mailboxes: number; databases: number; location: string; fulfillment: string }
  actions: { id: number; kind: string; status: string; actor: string; detail: string; createdAt: string }[]
}

const ACTION: Record<string, string> = { PROVISION: 'ساخت روی سامانه', DELIVER: 'تحویل سرویس', NOTE: 'به‌روزرسانی اطلاعات', SUSPEND: 'تعلیق', UNSUSPEND: 'رفع تعلیق', TERMINATE: 'حذف سرویس' }

function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" className="hs-copy" aria-label={`کپی ${label}`} onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1600) }).catch(() => null) }}>
    <Icon name={done ? 'check' : 'copy'} size={16} /><span aria-live="polite">{done ? 'کپی شد' : 'کپی'}</span>
  </button>
}

function Field({ label, value, copy, ltr = true, children }: { label: string; value?: string; copy?: boolean; ltr?: boolean; children?: ReactNode }) {
  return <div className="hs-field"><span className="hs-field-label">{label}</span><span className="hs-field-value">{children || <b dir={ltr ? 'ltr' : undefined}>{value || '—'}</b>}{copy && value && <Copy value={value} label={label} />}</span></div>
}

/** One service: its state, how to reach it, what it has, and what has happened to it. */
export default function ServiceWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [service, setService] = useState<Service | null>(null)
  const [state, setState] = useState<'loading' | 'missing' | 'failed' | 'ready'>('loading')
  const [password, setPassword] = useState('')
  const [revealError, setRevealError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/hosting/services/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => {
      if (!active) return
      if (r.status === 404) { setState('missing'); return }
      if (!r.ok) { setState('failed'); return }
      setService((await r.json()).service); setState('ready')
    }).catch(() => { if (active) setState('failed') })
    return () => { active = false }
  }, [id])

  async function reveal() {
    setBusy(true); setRevealError('')
    const response = await fetch(`/api/hosting/services/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reveal' }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok && data?.password) setPassword(String(data.password))
    else setRevealError(String(data?.error || 'رمز دریافت نشد'))
  }

  if (state === 'loading') return <div className="dt-page hs-page" dir="rtl" aria-busy="true"><div className="hs-hero is-skeleton" /></div>
  if (state !== 'ready' || !service) return <div className="dt-page hs-page" dir="rtl"><div className={`dt-empty${state === 'failed' ? ' is-bad' : ''}`} role={state === 'failed' ? 'alert' : undefined}><Icon name="server" size={28} /><b>{state === 'missing' ? 'این سرویس پیدا نشد' : 'اطلاعات سرویس دریافت نشد'}</b><span>{state === 'missing' ? 'ممکن است نشانی اشتباه باشد یا سرویس متعلق به حساب دیگری باشد.' : 'اتصال را بررسی کنید و صفحه را تازه کنید.'}</span><Link className="btn btn-ghost" href="/dashboard/services">بازگشت به سرویس‌ها</Link></div></div>

  const status = SERVICE_STATUS[service.status as ServiceStatus]
  const server = kindMeta(service.product.kind)?.group === 'servers'
  const left = daysLeft(service.nextDueAt)
  const months = cycleMeta(service.cycle)?.months || 1
  const spent = left === null ? 0 : Math.min(100, Math.max(0, Math.round(100 - (left / (months * 30.4)) * 100)))
  const waiting = ['PENDING', 'PROVISIONING', 'FAILED'].includes(service.status)
  const usable = service.status === 'ACTIVE' || service.status === 'SUSPENDED'
  const specs = (server
    ? [['cpu', 'پردازنده', service.product.cpuCores ? `${fa(service.product.cpuCores)} هسته` : ''], ['layers', 'رم', service.product.ramMb ? (service.product.ramMb >= 1024 ? `${fa(service.product.ramMb / 1024)} گیگابایت` : `${fa(service.product.ramMb)} مگابایت`) : ''], ['database', 'دیسک', service.product.diskGb ? `${fa(service.product.diskGb)} گیگابایت ${service.product.diskType}` : ''], ['activity', 'ترافیک ماهانه', service.product.trafficGb ? `${fa(service.product.trafficGb)} گیگابایت` : 'نامحدود'], ['bolt', 'پورت', service.product.bandwidthMbps ? `${fa(service.product.bandwidthMbps)} Mbps` : '']]
    : [['database', 'فضا', service.product.diskGb ? `${fa(service.product.diskGb)} گیگابایت ${service.product.diskType}` : ''], ['activity', 'ترافیک ماهانه', service.product.trafficGb ? `${fa(service.product.trafficGb)} گیگابایت` : 'نامحدود'], ['globe', 'سایت', service.product.sites ? fa(service.product.sites) : 'نامحدود'], ['mail', 'ایمیل', service.product.mailboxes ? fa(service.product.mailboxes) : ''], ['layers', 'پایگاه داده', service.product.databases ? fa(service.product.databases) : '']]
  ).filter(([, , value]) => value) as [string, string, string][]

  return <div className="dt-page hs-page" dir="rtl">
    <nav className="hs-crumb" aria-label="مسیر"><Link href="/dashboard/services">سرویس‌های من</Link><Icon name="chevron" size={14} /><span>{service.label}</span></nav>

    <section className={`hs-hero is-${service.status.toLowerCase()}`} aria-label="وضعیت سرویس">
      <span className="hs-hero-icon" aria-hidden="true"><Icon name={kindIcon(service.product.kind)} size={30} /></span>
      <div className="hs-hero-main">
        <span className="hs-card-kind">{kindMeta(service.product.kind)?.label} · {cycleMeta(service.cycle)?.label}</span>
        <h1>{service.label}</h1>
        <p dir="ltr" className="hs-hero-host">{service.hostname || service.ipv4 || `#${service.id}`}</p>
        <span className={`dt-state ${status?.tone || ''}`}><span className="hs-pulse" aria-hidden="true" />{status?.label || service.status}</span>
      </div>
      {service.status === 'ACTIVE' && left !== null && <div className="hs-term" style={{ ['--p' as string]: `${spent}%` }}>
        <div className="hs-ring" role="img" aria-label={`${fa(Math.max(0, left))} روز تا تمدید`}><b className="num">{fa(Math.max(0, left))}</b><span>روز مانده</span></div>
        <small>تمدید: {service.nextDueAt ? day.format(new Date(service.nextDueAt)) : '—'}</small>
      </div>}
    </section>

    {waiting && <section className="hs-panel hs-steps" aria-label="مراحل تحویل">
      <h2>در حال آماده‌سازی</h2>
      <ol>
        <li className="is-done"><Icon name="check" size={16} />پرداخت تأیید شد</li>
        <li className="is-now"><Icon name="clock" size={16} />{service.product.fulfillment === 'DRIVER' ? 'ساخت سرویس روی سرور' : 'آماده‌سازی توسط کارشناس'}</li>
        <li><Icon name="key" size={16} />تحویل اطلاعات ورود</li>
      </ol>
      <p>اطلاعات ورود همین‌جا نمایش داده می‌شود و اعلان آن برایتان فرستاده می‌شود.</p>
    </section>}

    {service.status === 'SUSPENDED' && <div className="hs-alert" role="status"><Icon name="lock" size={18} />این سرویس معلق است. برای رفع تعلیق فاکتور باز را پرداخت کنید یا با پشتیبانی تماس بگیرید.</div>}

    <div className="hs-layout">
      {usable && <section className="hs-panel" aria-labelledby="hs-login">
        <h2 id="hs-login"><Icon name="key" size={18} />اطلاعات ورود</h2>
        {service.ipv4 && <Field label="آی‌پی" value={service.ipv4} copy />}
        {service.ipv6 && <Field label="IPv6" value={service.ipv6} copy />}
        {service.loginUser && <Field label="نام کاربری" value={service.loginUser} copy />}
        {service.hasPassword && <Field label="رمز">
          {password ? <><b dir="ltr" className="hs-secret">{password}</b><Copy value={password} label="رمز" /><button type="button" className="hs-copy" onClick={() => setPassword('')}><Icon name="eye-off" size={16} />پنهان</button></>
            : <><b className="hs-secret" aria-label="رمز پنهان است">••••••••••</b><button type="button" className="hs-copy" disabled={busy} onClick={() => void reveal()}><Icon name="eye" size={16} />نمایش</button></>}
        </Field>}
        {revealError && <p className="hs-error" role="alert">{revealError}</p>}
        {service.panelUrl && <a className="btn btn-primary hs-panel-link" href={service.panelUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} />{server ? 'ورود به پنل سرور' : 'ورود به کنترل‌پنل'}</a>}
        {service.note && <div className="hs-note"><b>یادداشت کارشناس</b><p>{service.note}</p></div>}
      </section>}

      <section className="hs-panel" aria-labelledby="hs-specs">
        <h2 id="hs-specs"><Icon name="layers" size={18} />مشخصات</h2>
        <ul className="hs-specs">{specs.map(([icon, label, value]) => <li key={label}><Icon name={icon} size={16} /><span>{label}</span><b>{value}</b></li>)}</ul>
        {service.product.location && <p className="hs-location"><Icon name="pin" size={14} />{service.product.location}</p>}
        <div className="hs-more">
          {(service.allowUpgrade || service.allowTraffic) && usable && <Link className="btn btn-ghost" href="/dashboard/tickets">{service.allowUpgrade && service.allowTraffic ? 'درخواست ارتقا یا ترافیک' : service.allowUpgrade ? 'درخواست ارتقا' : 'درخواست ترافیک اضافه'}</Link>}
          <Link className="btn btn-ghost" href="/dashboard/tickets"><Icon name="lifebuoy" size={16} />پشتیبانی این سرویس</Link>
          <Link className="btn btn-ghost" href="/dashboard/invoices">فاکتورها</Link>
        </div>
      </section>

      <section className="hs-panel hs-history" aria-labelledby="hs-history">
        <h2 id="hs-history"><Icon name="activity" size={18} />رویدادها</h2>
        <ol>
          {service.actions.map((action) => <li key={action.id} className={`is-${action.status.toLowerCase()}`}>
            <span className="hs-dot" aria-hidden="true" />
            <b>{ACTION[action.kind] || action.kind}{action.status === 'WAITING' ? ' (در انتظار)' : action.status === 'FAILED' ? ' (ناموفق)' : ''}</b>
            {action.detail && <span>{action.detail}</span>}
            <time dateTime={action.createdAt}>{moment.format(new Date(action.createdAt))}</time>
          </li>)}
          <li className="is-done"><span className="hs-dot" aria-hidden="true" /><b>ثبت سفارش</b><time dateTime={service.createdAt}>{moment.format(new Date(service.createdAt))}</time></li>
        </ol>
      </section>
    </div>
  </div>
}
