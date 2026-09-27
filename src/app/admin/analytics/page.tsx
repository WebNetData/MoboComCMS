'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Top = { value: string; count: number }
type Point = { day: string; visitors: number; views: number; signups: number; sales: number; downloads: number }
type Data = {
  days: number
  summary: { visitors: number; views: number; pagesPerVisit: number; visitorsChange: number | null; viewsChange: number | null; sales: number; salesChange: number | null; revenue: string[]; signups: number; signupsChange: number | null; downloads: number; downloadsChange: number | null; reviews: number; favorites: number; pushSubscribers: number }
  series: Point[]; pages: { path: string; title: string; views: number }[]
  sources: Top[]; devices: Top[]; browsers: Top[]; os: Top[]; landing: Top[]; searches: Top[]; emptySearches: Top[]
}
type Metric = 'visitors' | 'views' | 'sales' | 'signups' | 'downloads'

const fa = (n: number) => n.toLocaleString('fa-IR')
const DEVICE: Record<string, string> = { mobile: '📱 موبایل', desktop: '🖥 دسکتاپ', tablet: '📟 تبلت' }
const METRICS: { key: Metric; label: string }[] = [{ key: 'visitors', label: 'بازدیدکننده' }, { key: 'views', label: 'بازدید صفحه' }, { key: 'sales', label: 'فروش' }, { key: 'signups', label: 'ثبت‌نام' }, { key: 'downloads', label: 'دانلود' }]

function Change({ value }: { value: number | null }) {
  if (value === null) return null
  return <small className={`an-change ${value >= 0 ? 'is-up' : 'is-down'}`}>{value >= 0 ? '▲' : '▼'} {fa(Math.abs(value))}٪</small>
}

function TopList({ title, rows, render }: { title: string; rows: Top[]; render?: (value: string) => React.ReactNode }) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <section className="card an-list">
      <h3>{title}</h3>
      {rows.length ? <ol>{rows.map((row) => <li key={row.value}><span className="an-fill" style={{ width: `${(row.count / max) * 100}%` }} aria-hidden="true" /><span className="an-label" dir="auto">{render ? render(row.value) : row.value}</span><b>{fa(row.count)}</b></li>)}</ol> : <p className="muted">هنوز داده‌ای نیست.</p>}
    </section>
  )
}

/** Self-hosted analytics: traffic, sources, devices, searches and sales. */
export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<Metric>('visitors')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/analytics?days=${days}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setData(body)
    else setError(body?.error || 'دریافت آمار ناموفق بود')
  }, [days])
  useEffect(() => { void load() }, [load])

  const max = data ? Math.max(1, ...data.series.map((point) => point[metric])) : 1
  const s = data?.summary

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">ANALYTICS</span><h1>آمار سایت</h1>
      <p>آمار بدون کوکی و بدون سرویس خارجی: IP ذخیره نمی‌شود و بازدیدکننده‌ها فقط با یک شناسهٔ روزانهٔ رمزشده شمرده می‌شوند.</p></div>
      <div className="tb-tabs" role="tablist" aria-label="بازه">{[7, 30, 90].map((n) => <button key={n} type="button" role="tab" aria-selected={days === n} className={days === n ? 'is-active' : ''} onClick={() => setDays(n)}>{fa(n)} روز</button>)}</div>
    </header>
    {error && <div className="xm-notice is-error" role="alert">{error}</div>}
    {!data && !error && <div className="tb-empty">در حال بارگذاری…</div>}
    {data && s && <>
      <div className="an-kpis">
        <div className="card"><span>بازدیدکنندهٔ یکتا</span><strong>{fa(s.visitors)}</strong><Change value={s.visitorsChange} /></div>
        <div className="card"><span>بازدید صفحه</span><strong>{fa(s.views)}</strong><Change value={s.viewsChange} /><small className="muted">{s.pagesPerVisit.toLocaleString('fa-IR')} صفحه در هر بازدید</small></div>
        <div className="card"><span>فروش (فاکتور پرداخت‌شده)</span><strong>{fa(s.sales)}</strong><Change value={s.salesChange} />{s.revenue.map((line) => <small key={line} className="muted">{line}</small>)}</div>
        <div className="card"><span>ثبت‌نام</span><strong>{fa(s.signups)}</strong><Change value={s.signupsChange} /></div>
        <div className="card"><span>دانلود</span><strong>{fa(s.downloads)}</strong><Change value={s.downloadsChange} /></div>
        <div className="card"><span>مشارکت</span><strong>{fa(s.reviews + s.favorites)}</strong><small className="muted">{fa(s.reviews)} امتیاز · {fa(s.favorites)} علاقه‌مندی · {fa(s.pushSubscribers)} مشترک اعلان</small></div>
      </div>
      <section className="card an-chart-card">
        <div className="an-metrics" role="tablist" aria-label="شاخص نمودار">{METRICS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={metric === item.key} className={metric === item.key ? 'is-active' : ''} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div>
        <div className="an-chart" role="img" aria-label={`نمودار روزانهٔ ${METRICS.find((m) => m.key === metric)?.label}`}>
          {data.series.map((point) => <div key={point.day} className="an-bar" title={`${new Date(point.day).toLocaleDateString('fa-IR')}: ${fa(point[metric])}`}><span style={{ height: `${(point[metric] / max) * 100}%` }} />{data.series.length <= 31 && <small>{new Date(point.day).toLocaleDateString('fa-IR', { day: 'numeric' })}</small>}</div>)}
        </div>
      </section>
      <div className="an-grid">
        <section className="card an-list an-pages">
          <h3>پربازدیدترین صفحه‌ها</h3>
          {data.pages.length ? <ol>{data.pages.map((page) => <li key={page.path}><span className="an-fill" style={{ width: `${(page.views / Math.max(1, data.pages[0].views)) * 100}%` }} aria-hidden="true" /><Link href={page.path} target="_blank" className="an-label">{page.title || <span dir="ltr">{page.path}</span>}</Link><b>{fa(page.views)}</b></li>)}</ol> : <p className="muted">هنوز داده‌ای نیست.</p>}
        </section>
        <TopList title="منبع ورود" rows={data.sources} />
        <TopList title="دستگاه" rows={data.devices} render={(value) => DEVICE[value] || value} />
        <TopList title="مرورگر" rows={data.browsers} />
        <TopList title="سیستم‌عامل" rows={data.os} />
        <TopList title="صفحهٔ ورود" rows={data.landing} render={(value) => <span dir="ltr">{value}</span>} />
        <TopList title="جست‌وجوهای پرتکرار" rows={data.searches} render={(value) => <Link href={`/search?q=${encodeURIComponent(value)}`} target="_blank">{value}</Link>} />
        <section className="card an-list is-warn">
          <h3>جست‌وجوهای بی‌نتیجه <small className="muted">— محتوایی که کاربران می‌خواهند و ندارید</small></h3>
          {data.emptySearches.length ? <ol>{data.emptySearches.map((row) => <li key={row.value}><span className="an-label">{row.value}</span><b>{fa(row.count)}</b></li>)}</ol> : <p className="muted">همهٔ جست‌وجوها نتیجه داشته‌اند ✓</p>}
        </section>
      </div>
    </>}
  </div>
}
