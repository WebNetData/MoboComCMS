'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { AdsShell, Notice, StatusChip, Trend, fa, faDate, send, useJson, type Day } from './shared'

type Overview = {
  days: number
  kpis: { impressions: number; clicks: number; ctr: number; active: number; pending: number; revenue: string }
  series: Day[]
  topCampaigns: { id: number; name: string; status: string; impressions: number; clicks: number; ctr: number }[]
  placements: { key: string; impressions: number; clicks: number; ctr: number; requests: number; fillRate: number | null }[]
  pending: { id: number; name: string; advertiser: string; createdAt: string; paid: string }[]
  placementList: { key: string; name: string }[]
}

export default function AdsOverviewPage() {
  const [days, setDays] = useState(30)
  const { data, error, reload } = useJson<Overview>(`/api/admin/ads?view=overview&days=${days}`)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (error) return <AdsShell title="تبلیغات"><Notice tone="error">{error}</Notice></AdsShell>
  if (!data) return <AdsShell title="تبلیغات"><div className="sa-skeleton" aria-busy="true" /></AdsShell>
  const names = new Map(data.placementList.map((row) => [row.key, row.name]))
  const maxImp = Math.max(1, ...data.placements.map((row) => row.impressions))

  async function decide(id: number, status: 'ACTIVE' | 'REJECTED') {
    let reason = ''
    if (status === 'REJECTED') { reason = window.prompt('دلیل رد (برای تبلیغ‌دهنده نمایش داده می‌شود و مبلغ به کیف پولش برمی‌گردد):') || ''; if (!reason.trim()) return }
    const result = await send('/api/admin/ads', 'POST', { op: 'campaign.status', id, status, reason })
    setNotice(result.ok ? { tone: 'ok', text: status === 'ACTIVE' ? 'کمپین تأیید و فعال شد.' : 'کمپین رد شد و وجه برگشت.' } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
  }

  return <AdsShell title="داشبورد تبلیغات" actions={<div className="ad-range" role="group" aria-label="بازهٔ گزارش">{[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{fa(n)} روز</button>)}</div>}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="sa-kpis">
      <div className="sa-kpi"><small>نمایش</small><b className="num">{fa(data.kpis.impressions)}</b></div>
      <div className="sa-kpi"><small>کلیک</small><b className="num">{fa(data.kpis.clicks)}</b><span className="sa-sub">نرخ کلیک {data.kpis.ctr.toLocaleString('fa-IR')}٪</span></div>
      <div className="sa-kpi"><small>کمپین فعال</small><b className="num">{fa(data.kpis.active)}</b><span className="sa-sub">{fa(data.kpis.pending)} منتظر بررسی</span></div>
      <div className="sa-kpi"><small>درآمد فروش بسته</small><b className="num">{data.kpis.revenue}</b><span className="sa-sub">در {fa(data.days)} روز اخیر</span></div>
    </div>

    {data.pending.length > 0 && <section className="sa-card">
      <header className="sa-card-head"><h2>منتظر بررسی شما</h2><Link href="/admin/ads/campaigns?status=PENDING" className="sa-link">همه</Link></header>
      <ul className="ad-pending">{data.pending.map((row) => <li key={row.id}>
        <div><Link href={`/admin/ads/campaigns/${row.id}`} className="sa-link"><b>{row.name}</b></Link><small className="sa-sub">{row.advertiser || '—'} · {faDate(row.createdAt, true)}{row.paid ? ` · پرداخت‌شده ${row.paid}` : ''}</small></div>
        <div className="sa-row-actions"><button type="button" className="btn btn-primary btn-sm" onClick={() => void decide(row.id, 'ACTIVE')}>تأیید و فعال‌سازی</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void decide(row.id, 'REJECTED')}>رد</button></div>
      </li>)}</ul>
    </section>}

    <div className="ad-charts">
      <Trend title="نمایش روزانه" data={data.series} field="impressions" unit="نمایش" />
      <Trend title="کلیک روزانه" data={data.series} field="clicks" unit="کلیک" />
    </div>

    <div className="ad-grid2">
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>پربازده‌ترین کمپین‌ها</h2><Link href="/admin/ads/campaigns" className="sa-link">همهٔ کمپین‌ها</Link></header>
        <table className="data sa-table"><thead><tr><th>کمپین</th><th>نمایش</th><th>کلیک</th><th>نرخ کلیک</th></tr></thead><tbody>
          {data.topCampaigns.map((row) => <tr key={row.id}><td><Link href={`/admin/ads/campaigns/${row.id}`} className="sa-link">{row.name}</Link> <StatusChip status={row.status} /></td><td className="num">{fa(row.impressions)}</td><td className="num">{fa(row.clicks)}</td><td className="num">{row.ctr.toLocaleString('fa-IR')}٪</td></tr>)}
          {!data.topCampaigns.length && <tr><td colSpan={4} className="sa-empty">هنوز نمایشی ثبت نشده است. یک کمپین بسازید و فعال کنید.</td></tr>}
        </tbody></table>
      </section>
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>عملکرد جایگاه‌ها</h2><Link href="/admin/ads/placements" className="sa-link">مدیریت</Link></header>
        <table className="data sa-table"><thead><tr><th>جایگاه</th><th>نمایش</th><th>نرخ کلیک</th><th>پر شدن</th></tr></thead><tbody>
          {data.placements.map((row) => <tr key={row.key}><td>{names.get(row.key) || row.key}<div className="ad-bar" aria-hidden="true"><i style={{ width: `${Math.round((row.impressions / maxImp) * 100)}%` }} /></div></td><td className="num">{fa(row.impressions)}</td><td className="num">{row.ctr.toLocaleString('fa-IR')}٪</td><td className="num" title="درصد درخواست‌هایی که تبلیغی برایشان پیدا شد">{row.fillRate === null ? '—' : `${fa(row.fillRate)}٪`}</td></tr>)}
          {!data.placements.length && <tr><td colSpan={4} className="sa-empty">آماری نیست.</td></tr>}
        </tbody></table>
      </section>
    </div>
    <p className="sa-hint">نمایش زمانی شمرده می‌شود که بنر دست‌کم نصفش یک ثانیه روی صفحه دیده شده باشد؛ ربات‌ها و کلیک تکراری یک بازدیدکننده در بازهٔ تنظیم‌شده شمرده نمی‌شوند. «پر شدن» نشان می‌دهد چند درصد درخواست‌های هر جایگاه تبلیغی پیدا کرده‌اند؛ عدد پایین یعنی جایگاه خالی می‌ماند و می‌توان آن را فروخت.</p>
  </AdsShell>
}
