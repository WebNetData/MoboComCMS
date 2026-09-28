'use client'

import Link from '@/components/AppLink'
import { DailyBars } from '../cms/SectionAdmin'
import { CinemaShell, Notice, fa, faDate, useJson } from './shared'

type Dashboard = {
  kpis: { movies: number; series: number; episodes: number; drafts: number; scheduled: number; views: number; clicks: number; downloads30: number; openReports: number; disabledLinks: number; vip: number; dubbed: number; subtitled: number; featured: number; ongoing: number }
  series: { day: string; downloads: number }[]
  health: { key: string; label: string; count: number }[]
  worst: { id: number; title: string; poster: string; kind: string; issues: string[] }[]
  topViewed: { id: number; slug: string; title: string; poster: string; kind: string; views: number; imdb: number | null }[]
  ongoing: { id: number; slug: string; title: string; poster: string; seasons: number; episodes: number; last: { season: number; episode: number; airDate: string | null } | null }[]
  genres: { name: string; count: number }[]
}

const kindLabel = (kind: string) => (kind === 'SERIES' ? 'سریال' : 'فیلم')

/** Film & series dashboard: catalogue size, traffic, link problems and gaps to fill. */
export default function CinemaDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/cinema/dashboard')
  const k = data?.kpis
  const maxGenre = Math.max(1, ...(data?.genres || []).map((genre) => genre.count))
  return <CinemaShell title="مدیریت فیلم و سریال" actions={<><Link href="/admin/cinema/titles" className="btn btn-primary">+ افزودن فیلم یا سریال</Link><a href="/cinema" target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهدهٔ بخش</a></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data || !k ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>فیلم‌های منتشرشده</span><b className="num">{fa(k.movies)}</b><small className="sa-sub">{fa(k.dubbed)} دوبله · {fa(k.subtitled)} زیرنویس</small></div>
        <div className="sa-kpi"><span>سریال‌ها</span><b className="num">{fa(k.series)}</b><small className="sa-sub">{fa(k.episodes)} قسمت · {fa(k.ongoing)} در حال پخش</small></div>
        <div className="sa-kpi"><span>بازدید کل</span><b className="num">{fa(k.views)}</b><small className="sa-sub">{fa(k.clicks)} کلیک روی لینک‌ها</small></div>
        <div className="sa-kpi"><span>دانلود ۳۰ روز</span><b className="num">{fa(k.downloads30)}</b><small className="sa-sub">{fa(k.vip)} عنوان ویژهٔ VIP</small></div>
      </div>
      <div className="sa-queue">
        <Link href="/admin/downloads" className={`sa-queue-item${k.openReports ? ' is-warn' : ''}`}><b className="num">{fa(k.openReports)}</b><span>گزارش لینک خراب</span></Link>
        <Link href="/admin/downloads" className={`sa-queue-item${k.disabledLinks ? ' is-warn' : ''}`}><b className="num">{fa(k.disabledLinks)}</b><span>لینک غیرفعال</span></Link>
        <Link href="/admin/cinema/titles" className="sa-queue-item"><b className="num">{fa(k.drafts)}</b><span>پیش‌نویس</span></Link>
        <Link href="/admin/cinema/titles" className={`sa-queue-item${k.scheduled ? ' is-hot' : ''}`}><b className="num">{fa(k.scheduled)}</b><span>زمان‌بندی‌شده</span></Link>
        <Link href="/admin/cinema/settings" className="sa-queue-item"><b className="num">{fa(k.featured)}</b><span>عنوان ویژه</span></Link>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <DailyBars title="دانلود فیلم و سریال در ۳۰ روز اخیر" unit="دانلود" series={data.series.map((point) => ({ day: point.day, value: point.downloads }))} />
          <section className="sa-card">
            <header className="sa-card-head"><h2>سلامت محتوا</h2><small>صفحه‌هایی که چیزی کم دارند</small></header>
            {data.health.length ? <>
              <div className="ga-health">{data.health.map((row) => <span key={row.key} className="ga-health-chip">{row.label}<b className="num">{fa(row.count)}</b></span>)}</div>
              {data.worst.length > 0 && <ul className="sa-rows">{data.worst.map((title) => <li key={title.id}><Link href="/admin/cinema/titles">{title.poster ? <img src={title.poster} alt="" className="ga-thumb" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{title.title}</b><small>{kindLabel(title.kind)} · {title.issues.map((issue) => data.health.find((row) => row.key === issue)?.label || issue).join('، ')}</small></span><span className="sa-link">تکمیل</span></Link></li>)}</ul>}
            </> : <p className="sa-hint">همهٔ صفحه‌های فیلم و سریال کامل هستند.</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>سریال‌های در حال پخش</h2></header>
            {data.ongoing.length ? <ul className="sa-rank">{data.ongoing.map((row) => <li key={row.id}>{row.poster ? <img src={row.poster} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{row.title}</b><small>{row.last ? `آخرین: فصل ${fa(row.last.season)} قسمت ${fa(row.last.episode)}${row.last.airDate ? ` · ${faDate(row.last.airDate)}` : ''}` : 'هنوز قسمتی ثبت نشده'}</small></span><span className="sa-state is-info num">{fa(row.episodes)} قسمت</span></li>)}</ul> : <p className="sa-hint">سریالی با وضعیت «در حال پخش» ثبت نشده است.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>پربازدیدترین‌ها</h2></header>
            {data.topViewed.length ? <ul className="sa-rank">{data.topViewed.map((title) => <li key={title.id}>{title.poster ? <img src={title.poster} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><a href={`/cinema/${title.slug}`} target="_blank" rel="noreferrer"><b>{title.title}</b></a><small className="num">{kindLabel(title.kind)} · {fa(title.views)} بازدید{title.imdb !== null ? ` · IMDb ${title.imdb.toLocaleString('fa-IR')}` : ''}</small></span></li>)}</ul> : <p className="sa-hint">هنوز عنوانی منتشر نشده است.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>ژانرها</h2><Link href="/admin/taxonomy?tax=cinema" className="sa-link">دسته‌بندی‌ها</Link></header>
            {data.genres.length ? <ul className="sx-bars">{data.genres.map((genre) => <li key={genre.name}><span>{genre.name}</span><span className="sx-bar" aria-hidden="true"><i style={{ width: `${(genre.count / maxGenre) * 100}%` }} /></span><b className="num">{fa(genre.count)}</b></li>)}</ul> : <p className="sa-hint">ژانری ثبت نشده است.</p>}
          </section>
        </div>
      </div>
    </>}
  </CinemaShell>
}
