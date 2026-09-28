import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'
import { publicTracking } from '@/modules/shipping/server/carriers'
import { SHIPMENT_STATUSES } from '@/modules/shipping/domain/carriers'

const when = (value: Date | string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(value))
const STEPS = [
  { status: 'READY', label: 'صدور بارنامه' }, { status: 'PICKED_UP', label: 'تحویل به مرسوله‌رسان' }, { status: 'IN_TRANSIT', label: 'در مسیر' },
  { status: 'OUT_FOR_DELIVERY', label: 'در حال توزیع' }, { status: 'DELIVERED', label: 'تحویل شد' },
]

/** /track and /track/:code — public parcel tracking by waybill or carrier code. */
export async function TrackView({ code }: { code?: string }) {
  const [theme, found] = await Promise.all([getServerTheme(), code ? publicTracking(code) : Promise.resolve(null)])
  const reached = found ? SHIPMENT_STATUSES.indexOf(found.status as (typeof SHIPMENT_STATUSES)[number]) : -1
  return <>
    <SiteHeader theme={theme} />
    <main className="container tk-page" dir="rtl">
      <header className="tk-head">
        <h1>رهگیری مرسوله</h1>
        <p>شمارهٔ بارنامه (مثل MC۱۴۰۵…) یا کد رهگیری شرکت حمل را وارد کنید.</p>
        <form action="/track" method="get" className="tk-form" role="search">
          <input name="code" defaultValue={code || ''} className="input" dir="ltr" aria-label="کد رهگیری" placeholder="MC…" required minLength={6} maxLength={40} />
          <button className="btn btn-primary">رهگیری</button>
        </form>
      </header>
      {code && !found && <p className="tk-empty" role="status">مرسوله‌ای با این کد پیدا نشد. کد را دوباره بررسی کنید؛ کد رهگیری معمولاً چند ساعت پس از ارسال فعال می‌شود.</p>}
      {found && <section className="tk-card" aria-label="وضعیت مرسوله">
        <div className="tk-top">
          <div><small>بارنامه</small><b dir="ltr">{found.waybill}</b></div>
          <div><small>شرکت حمل</small><b>{found.carrierName}</b></div>
          <div><small>مسیر</small><b>{found.from || '—'} ← {found.to || '—'}</b></div>
          <div><small>وضعیت</small><b className={`tk-status is-${found.status.toLowerCase()}`}>{found.statusLabel}</b></div>
        </div>
        {found.status !== 'CANCELLED' && found.status !== 'RETURNED' && <ol className="tk-steps">{STEPS.map((step, index) => {
          const at = SHIPMENT_STATUSES.indexOf(step.status as (typeof SHIPMENT_STATUSES)[number])
          const state = found.status === 'DELIVERED' || at < reached ? 'is-done' : at === reached ? 'is-current' : ''
          return <li key={step.status} className={state}><span>{(index + 1).toLocaleString('fa-IR')}</span>{step.label}</li>
        })}</ol>}
        {found.trackingCode && <p className="tk-carrier">کد رهگیری {found.carrierName}: <b dir="ltr">{found.trackingCode}</b>{found.trackingUrl && <> — <a href={found.trackingUrl} target="_blank" rel="noopener noreferrer">پیگیری در سایت {found.carrierName} ↗</a></>}</p>}
        <ol className="tk-timeline">{[...found.events].reverse().map((event) => <li key={event.id}>
          <b>{event.label}</b><time>{when(event.createdAt)}</time>{event.location && <span>{event.location}</span>}{event.note && <p>{event.note}</p>}
        </li>)}</ol>
        <p className="tk-hint">جزئیات کامل سفارش در <Link href="/dashboard/orders">سفارش‌های من</Link> قابل مشاهده است.</p>
      </section>}
    </main>
    <SiteFooter />
  </>
}
