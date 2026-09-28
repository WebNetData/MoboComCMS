'use client'

import Link from '@/components/AppLink'
import { DailyBars } from '../cms/SectionAdmin'
import { Notice, SoftwareShell, fa, faDate, useJson } from './shared'

type Card = { id: number; slug: string; title: string; icon: string; version: string; views: number; downloads: number }
type Dashboard = {
  kpis: { published: number; drafts: number; scheduled: number; views: number; downloads: number; downloads30: number; clicks: number; openReports: number; disabledLinks: number; updated7: number; stale: number; vip: number; featured: number; staleDays: number }
  series: { day: string; downloads: number }[]
  health: { key: string; label: string; count: number }[]
  worst: { id: number; title: string; icon: string; version: string; issues: string[] }[]
  needsUpdate: (Card & { since: string; days: number })[]
  topDownloaded: Card[]
  platforms: { name: string; count: number }[]
  licenses: { name: string; count: number }[]
}

function Share({ rows }: { rows: { name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return rows.length ? <ul className="sx-bars">{rows.map((row) => <li key={row.name}><span dir="auto">{row.name}</span><span className="sx-bar" aria-hidden="true"><i style={{ width: `${(row.count / max) * 100}%` }} /></span><b className="num">{fa(row.count)}</b></li>)}</ul> : <p className="sa-hint">داده‌ای ثبت نشده است.</p>
}

/** Software dashboard: downloads, broken links, outdated versions and incomplete pages. */
export default function SoftwareDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/software/dashboard')
  const k = data?.kpis
  return <SoftwareShell title="مدیریت نرم‌افزار" actions={<><Link href="/admin/software/titles" className="btn btn-primary">+ افزودن نرم‌افزار</Link><a href="/software" target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهدهٔ بخش</a></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data || !k ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>نرم‌افزارهای منتشرشده</span><b className="num">{fa(k.published)}</b><small className="sa-sub">{fa(k.updated7)} به‌روزرسانی در ۷ روز</small></div>
        <div className="sa-kpi"><span>دانلود کل</span><b className="num">{fa(k.downloads)}</b><small className="sa-sub">{fa(k.clicks)} کلیک روی لینک‌ها</small></div>
        <div className="sa-kpi"><span>دانلود ۳۰ روز</span><b className="num">{fa(k.downloads30)}</b><small className="sa-sub">{fa(k.vip)} نرم‌افزار ویژهٔ VIP</small></div>
        <div className="sa-kpi"><span>بازدید کل</span><b className="num">{fa(k.views)}</b><small className="sa-sub">{fa(k.featured)} پیشنهاد ویژه</small></div>
      </div>
      <div className="sa-queue">
        <Link href="/admin/downloads" className={`sa-queue-item${k.openReports ? ' is-warn' : ''}`}><b className="num">{fa(k.openReports)}</b><span>گزارش لینک خراب</span></Link>
        <Link href="/admin/downloads" className={`sa-queue-item${k.disabledLinks ? ' is-warn' : ''}`}><b className="num">{fa(k.disabledLinks)}</b><span>لینک غیرفعال</span></Link>
        <a href="#needs-update" className={`sa-queue-item${k.stale ? ' is-hot' : ''}`}><b className="num">{fa(k.stale)}</b><span>نسخهٔ قدیمی‌تر از {fa(k.staleDays)} روز</span></a>
        <Link href="/admin/software/titles" className="sa-queue-item"><b className="num">{fa(k.drafts)}</b><span>پیش‌نویس</span></Link>
        <Link href="/admin/software/titles" className="sa-queue-item"><b className="num">{fa(k.scheduled)}</b><span>زمان‌بندی‌شده</span></Link>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <DailyBars title="دانلود نرم‌افزار در ۳۰ روز اخیر" unit="دانلود" series={data.series.map((point) => ({ day: point.day, value: point.downloads }))} />
          <section className="sa-card">
            <header className="sa-card-head"><h2>سلامت صفحه‌ها</h2><small>نرم‌افزارهایی که چیزی کم دارند</small></header>
            {data.health.length ? <>
              <div className="ga-health">{data.health.map((row) => <span key={row.key} className="ga-health-chip">{row.label}<b className="num">{fa(row.count)}</b></span>)}</div>
              {data.worst.length > 0 && <ul className="sa-rows">{data.worst.map((row) => <li key={row.id}><Link href="/admin/software/titles">{row.icon ? <img src={row.icon} alt="" className="ga-thumb" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{row.title} <bdi dir="ltr">{row.version}</bdi></b><small>{row.issues.map((issue) => data.health.find((h) => h.key === issue)?.label || issue).join('، ')}</small></span><span className="sa-link">تکمیل</span></Link></li>)}</ul>}
            </> : <p className="sa-hint">همهٔ صفحه‌های نرم‌افزار کامل هستند.</p>}
          </section>
          <section className="sa-card" id="needs-update">
            <header className="sa-card-head"><h2>نیاز به به‌روزرسانی</h2><Link href="/admin/software/settings" className="sa-link">تغییر بازه</Link></header>
            {data.needsUpdate.length ? <ul className="sa-rank">{data.needsUpdate.map((row) => <li key={row.id}>{row.icon ? <img src={row.icon} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{row.title} <bdi dir="ltr">{row.version}</bdi></b><small>نسخهٔ {faDate(row.since)}</small></span><span className="sa-state is-warn num">{fa(row.days)} روز</span></li>)}</ul> : <p className="sa-hint">همهٔ نسخه‌ها تازه هستند.</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>پردانلودترین‌ها</h2></header>
            {data.topDownloaded.length ? <ul className="sa-rank">{data.topDownloaded.map((row) => <li key={row.id}>{row.icon ? <img src={row.icon} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><a href={`/software/${row.slug}`} target="_blank" rel="noreferrer"><b>{row.title}</b></a><small className="num">{fa(row.downloads)} دانلود · {fa(row.views)} بازدید</small></span></li>)}</ul> : <p className="sa-hint">هنوز نرم‌افزاری منتشر نشده است.</p>}
          </section>
          <section className="sa-card"><header className="sa-card-head"><h2>پلتفرم‌ها</h2><Link href="/admin/taxonomy?tax=software" className="sa-link">دسته‌بندی‌ها</Link></header><Share rows={data.platforms} /></section>
          <section className="sa-card"><header className="sa-card-head"><h2>نوع مجوز</h2></header><Share rows={data.licenses} /></section>
        </div>
      </div>
    </>}
  </SoftwareShell>
}
