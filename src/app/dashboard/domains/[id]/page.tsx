'use client'

import { checkoutDestination, checkoutPath, type CheckoutSurface } from '@/modules/checkout/domain/surface'


import { use, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { startCheckout } from '@/modules/checkout/ui/client'
import { DOMAIN_STATUS, type DomainStatus } from '@/modules/hosting/domain/domains'
import { day, fa, moment } from '../../services/shared'
import '../../services/services.css'

type Domain = {
  id: number; name: string; display: string; status: string; kind: string; years: number; renewMinor: string; expiresAt: string | null; registeredAt: string | null; createdAt: string
  autoRenew: boolean; nameservers: string[]; handle: string; locked: boolean; suffix: string; yearOptions: number[]
  actions: { id: number; kind: string; status: string; actor: string; detail: string; createdAt: string }[]
}
const ACTION: Record<string, string> = { REGISTER: 'ثبت در رجیستری', TRANSFER: 'انتقال', RENEW: 'تمدید', NAMESERVERS: 'تغییر نیم‌سرورها', AUTHCODE: 'کد انتقال', CANCEL: 'لغو', NOTE: 'یادداشت', EXPIRE: 'انقضا' }

/** One domain: status and expiry, renewal, name servers, transfer code and history. */
export default function DomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [domain, setDomain] = useState<Domain | null>(null)
  const [state, setState] = useState<'loading' | 'missing' | 'failed' | 'ready'>('loading')
  const [loads, setLoads] = useState(0)
  const [years, setYears] = useState(1)
  const [ns, setNs] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/hosting/domains/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => {
      if (!active) return
      if (r.status === 404) { setState('missing'); return }
      if (!r.ok) { setState('failed'); return }
      const data = (await r.json()).domain as Domain
      setDomain(data); setYears(data.yearOptions[0] || 1); setNs(data.nameservers.join('\n')); setState('ready')
    }).catch(() => { if (active) setState('failed') })
    return () => { active = false }
  }, [id, loads])

  async function act(body: Record<string, unknown>, done: string, tag: string) {
    setBusy(tag); setMessage(null)
    const response = await fetch(`/api/hosting/domains/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy('')
    if (response?.ok) { setMessage({ tone: 'ok', text: done }); setLoads((n) => n + 1) }
    else setMessage({ tone: 'error', text: String(data?.error || 'انجام نشد') })
  }

  async function renew() {
    if (!domain) return
    setBusy('renew'); setMessage(null)
    try {
      const result = await startCheckout({ surface: 'dashboard', domainRenew: { domainId: domain.id, years } })
      if (!result.ok) { if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(checkoutPath(result.invoiceUrl, 'dashboard')); return } setMessage({ tone: 'error', text: result.message || 'تمدید ثبت نشد' }); return }
      const destination = checkoutDestination(result, 'dashboard')
      if (destination) window.location.assign(destination)
    } catch { setMessage({ tone: 'error', text: 'ارتباط با سرور برقرار نشد' }) } finally { setBusy('') }
  }

  if (state === 'loading') return <div className="dt-page hs-page" dir="rtl" aria-busy="true"><div className="hs-hero is-skeleton" /></div>
  if (state !== 'ready' || !domain) return <div className="dt-page hs-page" dir="rtl"><div className={`dt-empty${state === 'failed' ? ' is-bad' : ''}`} role={state === 'failed' ? 'alert' : undefined}><Icon name="globe" size={28} /><b>{state === 'missing' ? 'این دامنه پیدا نشد' : 'اطلاعات دامنه دریافت نشد'}</b><Link className="btn btn-ghost" href="/dashboard/services">بازگشت به سرویس‌ها</Link></div></div>

  const status = DOMAIN_STATUS[domain.status as DomainStatus]
  const live = domain.status === 'ACTIVE' || domain.status === 'EXPIRED'
  const left = domain.expiresAt ? Math.ceil((new Date(domain.expiresAt).getTime() - Date.now()) / 86_400_000) : null
  const spent = left === null ? 0 : Math.min(100, Math.max(0, Math.round(100 - (left / 365) * 100)))
  const waiting = domain.actions.filter((action) => action.status === 'WAITING')

  return <div className="dt-page hs-page" dir="rtl">
    <nav className="hs-crumb" aria-label="مسیر"><Link href="/dashboard/services">سرویس‌های من</Link><Icon name="chevron" size={14} /><span dir="ltr">{domain.display}</span></nav>
    <section className={`hs-hero is-${domain.status.toLowerCase()}`} aria-label="وضعیت دامنه">
      <span className="hs-hero-icon" aria-hidden="true"><Icon name="globe" size={30} /></span>
      <div className="hs-hero-main">
        <span className="hs-card-kind">{domain.kind === 'TRANSFER' ? 'انتقال دامنه' : 'دامنه'} · .{domain.suffix}</span>
        <h1 dir="ltr">{domain.display}</h1>
        {domain.handle && <p className="hs-hero-host" dir="ltr">{domain.handle}</p>}
        <span className={`dt-state ${status?.tone || ''}`}><span className="hs-pulse" aria-hidden="true" />{status?.label || domain.status}</span>
      </div>
      {live && left !== null && <div className="hs-term" style={{ ['--p' as string]: `${spent}%` }}>
        <div className="hs-ring" role="img" aria-label={left > 0 ? `${fa(left)} روز تا انقضا` : 'منقضی'}><b className="num">{fa(Math.max(0, left))}</b><span>روز مانده</span></div>
        <small>انقضا: {domain.expiresAt ? day.format(new Date(domain.expiresAt)) : '—'}</small>
      </div>}
    </section>

    {domain.status === 'PENDING' && <section className="hs-panel hs-steps" aria-label="مراحل ثبت"><h2>در حال {domain.kind === 'TRANSFER' ? 'انتقال' : 'ثبت'}</h2><ol>
      <li className="is-done"><Icon name="check" size={16} />پرداخت تأیید شد</li>
      <li className="is-now"><Icon name="clock" size={16} />{domain.kind === 'TRANSFER' ? 'انتقال از ثبت‌کنندهٔ قبلی' : 'ثبت در رجیستری'}</li>
      <li><Icon name="globe" size={16} />فعال شدن دامنه</li>
    </ol><p>اگر دامنه ثبت نشود، مبلغ کامل به کیف پول شما برمی‌گردد.</p></section>}
    {domain.status === 'EXPIRED' && <div className="hs-alert" role="status"><Icon name="clock" size={18} />این دامنه منقضی شده است. هرچه زودتر تمدید کنید تا از دست نرود.</div>}
    {message && <p className={`hs-msg is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <div className="hs-layout">
      {live && <section className="hs-panel hs-renew" aria-labelledby="dx-renew">
        <h2 id="dx-renew"><Icon name="clock" size={18} />تمدید</h2>
        <fieldset className="hs-years"><legend className="sr-only">مدت تمدید</legend><div>{domain.yearOptions.map((y) => <label key={y} className={years === y ? 'is-on' : ''}><input type="radio" name="years" checked={years === y} onChange={() => setYears(y)} /><b>{fa(y)} سال</b><span className="num">{fa(Number(domain.renewMinor) * y)} تومان</span></label>)}</div></fieldset>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void renew()}>{busy === 'renew' ? 'در حال ثبت…' : `تمدید ${fa(years)} ساله`}</button>
        <label className="hs-switch">
          <input type="checkbox" role="switch" checked={domain.autoRenew} disabled={!!busy} onChange={(event) => { const on = event.target.checked; setDomain({ ...domain, autoRenew: on }); void act({ action: 'auto-renew', on }, on ? 'تمدید خودکار روشن شد.' : 'تمدید خودکار خاموش شد.', 'auto') }} />
          <span className="hs-switch-track" aria-hidden="true" />
          <span>تمدید خودکار از کیف پول<small>سه روز پیش از انقضا، یک‌ساله.</small></span>
        </label>
      </section>}

      {live && <section className="hs-panel" aria-labelledby="dx-ns">
        <h2 id="dx-ns"><Icon name="server" size={18} />نیم‌سرورها</h2>
        <label className="hs-field"><span className="hs-field-label">هر نیم‌سرور در یک خط (۲ تا ۶ مورد)</span><textarea className="input" dir="ltr" rows={4} spellCheck={false} value={ns} placeholder={'ns1.example.com\nns2.example.com'} onChange={(event) => setNs(event.target.value)} /></label>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void act({ action: 'nameservers', nameservers: ns }, 'درخواست تغییر نیم‌سرورها ثبت شد.', 'ns')}>{busy === 'ns' ? '…' : 'ذخیرهٔ نیم‌سرورها'}</button>
        {waiting.some((action) => action.kind === 'NAMESERVERS') && <p className="hs-renew-due">تغییر نیم‌سرورها در صف اعمال است.</p>}
      </section>}

      {live && <section className="hs-panel" aria-labelledby="dx-transfer">
        <h2 id="dx-transfer"><Icon name="key" size={18} />انتقال به جای دیگر</h2>
        <p className="hs-renew-due">برای بردن دامنه به ثبت‌کنندهٔ دیگر، کد انتقال لازم است. پس از بررسی، کد برای شما فرستاده می‌شود.</p>
        <button type="button" className="btn btn-ghost" disabled={!!busy || waiting.some((action) => action.kind === 'AUTHCODE')} onClick={() => void act({ action: 'authcode' }, 'درخواست کد انتقال ثبت شد.', 'auth')}>{waiting.some((action) => action.kind === 'AUTHCODE') ? 'درخواست در حال بررسی' : 'درخواست کد انتقال'}</button>
      </section>}

      <section className="hs-panel hs-history" aria-labelledby="dx-history">
        <h2 id="dx-history"><Icon name="activity" size={18} />رویدادها</h2>
        <ol>
          {domain.actions.map((action) => <li key={action.id} className={`is-${action.status.toLowerCase()}`}>
            <span className="hs-dot" aria-hidden="true" />
            <b>{ACTION[action.kind] || action.kind}{action.status === 'WAITING' ? ' (در انتظار)' : action.status === 'FAILED' ? ' (ناموفق)' : ''}</b>
            {action.detail && <span>{action.detail}</span>}
            <time dateTime={action.createdAt}>{moment.format(new Date(action.createdAt))}</time>
          </li>)}
          <li className="is-done"><span className="hs-dot" aria-hidden="true" /><b>ثبت سفارش</b><time dateTime={domain.createdAt}>{moment.format(new Date(domain.createdAt))}</time></li>
        </ol>
      </section>
    </div>
  </div>
}
