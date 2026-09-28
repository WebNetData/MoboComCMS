'use client'

import Link from '@/components/AppLink'
import { DailyBars } from '../cms/SectionAdmin'
import { Notice, VipShell, fa, faDate, useJson } from './shared'

type Dashboard = {
  kpis: { active: number; joined30: number; renewed30: number; expiring7: number; lapsed30: number; plans: number; orders30: number }
  revenue: { currency: string; amount: number }[]
  series: { day: string; value: number }[]
  sources: { source: string; count: number }[]
  plans: { name: string; count: number }[]
  expiring: { userId: number; email: string; name: string; endsAt: string; days: number }[]
}

const SOURCE: Record<string, string> = { PURCHASE: 'خرید', GIFT: 'هدیهٔ خرید', ADMIN: 'مدیر' }
const CURRENCY: Record<string, string> = { IRT: 'تومان', IRR: 'ریال', USD: 'دلار' }

/** VIP dashboard: members, joins, renewals, revenue, expiring soon and lapsed. */
export default function VipDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/membership/dashboard')
  const k = data?.kpis
  const maxPlan = Math.max(1, ...(data?.plans || []).map((row) => row.count))
  const maxSource = Math.max(1, ...(data?.sources || []).map((row) => row.count))
  return <VipShell title="مدیریت اشتراک ویژه" actions={<><Link href="/admin/vip/members" className="btn btn-primary">اعطا یا تمدید دستی</Link><a href="/vip" target="_blank" rel="noreferrer" className="btn btn-ghost">صفحهٔ VIP</a></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data || !k ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>اعضای فعال</span><b className="num">{fa(k.active)}</b><small className="sa-sub">{fa(k.plans)} پلن فعال</small></div>
        <div className="sa-kpi"><span>عضو تازه در ۳۰ روز</span><b className="num">{fa(k.joined30)}</b><small className="sa-sub">{fa(k.renewed30)} تمدید با خرید</small></div>
        <div className="sa-kpi"><span>درآمد ۳۰ روز</span><b className="num">{data.revenue.length ? data.revenue.map((row) => `${fa(Math.round(row.amount))} ${CURRENCY[row.currency] || row.currency}`).join(' · ') : '۰'}</b><small className="sa-sub">{fa(k.orders30)} سفارش پرداخت‌شده</small></div>
        <div className="sa-kpi"><span>ریزش ۳۰ روز</span><b className="num">{fa(k.lapsed30)}</b><small className="sa-sub">اشتراکشان تمام شد و تمدید نکردند</small></div>
      </div>
      <div className="sa-queue">
        <a href="#expiring" className={`sa-queue-item${k.expiring7 ? ' is-hot' : ''}`}><b className="num">{fa(k.expiring7)}</b><span>پایان اشتراک در ۷ روز</span></a>
        <Link href="/admin/vip/members" className="sa-queue-item"><b className="num">{fa(k.active)}</b><span>مدیریت اعضا</span></Link>
        <Link href="/admin/vip/plans" className="sa-queue-item"><b className="num">{fa(k.plans)}</b><span>پلن‌ها</span></Link>
        <Link href="/admin/vip/perks" className="sa-queue-item"><b className="num">✦</b><span>مزایا در هر بخش</span></Link>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <DailyBars title="اشتراک‌های تازه (خرید، هدیه و دستی) در ۳۰ روز اخیر" unit="اشتراک" series={data.series} />
          <section className="sa-card" id="expiring">
            <header className="sa-card-head"><h2>به‌زودی تمام می‌شوند</h2><small>برای یادآوری تمدید</small></header>
            {data.expiring.length ? <ul className="sa-rank">{data.expiring.map((row) => <li key={row.userId}><span className="sa-grow"><b>{row.name || row.email}</b><small dir="ltr">{row.email}</small></span><small>{faDate(row.endsAt)}</small><span className={`sa-state ${row.days <= 2 ? 'is-bad' : 'is-warn'} num`}>{fa(row.days)} روز</span></li>)}</ul> : <p className="sa-hint">در هفتهٔ پیش رو اشتراکی تمام نمی‌شود.</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>اعضای فعال هر پلن</h2></header>
            {data.plans.length ? <ul className="sx-bars">{data.plans.map((row) => <li key={row.name}><span>{row.name}</span><span className="sx-bar" aria-hidden="true"><i style={{ width: `${(row.count / maxPlan) * 100}%` }} /></span><b className="num">{fa(row.count)}</b></li>)}</ul> : <p className="sa-hint">هنوز عضوی با خرید پلن فعال نیست.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>روش عضویت (۳۰ روز)</h2></header>
            {data.sources.length ? <ul className="sx-bars">{data.sources.map((row) => <li key={row.source}><span>{SOURCE[row.source] || row.source}</span><span className="sx-bar" aria-hidden="true"><i style={{ width: `${(row.count / maxSource) * 100}%` }} /></span><b className="num">{fa(row.count)}</b></li>)}</ul> : <p className="sa-hint">در ۳۰ روز اخیر اشتراک تازه‌ای ثبت نشده است.</p>}
          </section>
        </div>
      </div>
    </>}
  </VipShell>
}
