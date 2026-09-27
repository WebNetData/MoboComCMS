'use client'

import Link from 'next/link'
import { useState } from 'react'
import { GamesShell, Notice, fa, faDate, faDay, useJson } from './shared'

type Dashboard = {
  kpis: { published: number; drafts: number; scheduled: number; upcoming30: number; editors: number; views: number; clicks: number; downloads30: number; openReports: number; disabledLinks: number; franchises: number; updates30: number; library: Record<string, number>; libraryTotal: number; libraryRecent: number }
  series: { day: string; downloads: number; library: number }[]
  health: { key: string; label: string; count: number }[]
  worst: { id: number; title: string; cover: string; issues: string[] }[]
  topViewed: { id: number; slug: string; title: string; cover: string; views: number; score: number | null }[]
  upcoming: { id: number; slug: string; title: string; cover: string; releaseDate: string; days: number | null; platforms: string[] }[]
}

const SHELF: [string, string][] = [['PLAYED', 'بازی کرده‌اند'], ['PLAYING', 'در حال بازی'], ['WANT', 'منتظرند'], ['DROPPED', 'رها کرده‌اند']]

/** 30-day downloads bars — one series, hover readout, table toggle (RTL: newest on the left). */
function DownloadsChart({ series }: { series: Dashboard['series'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...series.map((point) => point.downloads))
  const width = 720, height = 180, gap = 2
  const bar = (width - gap * (series.length - 1)) / series.length
  const shown = hover !== null ? series[hover] : null
  const total = series.reduce((sum, point) => sum + point.downloads, 0)
  return <section className="sa-card sa-chart">
    <header className="sa-card-head">
      <h2>دانلود بازی‌ها در ۳۰ روز اخیر</h2>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={table} onClick={() => setTable((open) => !open)}>{table ? 'نمایش نمودار' : 'نمایش جدول'}</button>
    </header>
    {table ? <div className="sa-table-wrap"><table className="data"><thead><tr><th>روز</th><th>دانلود</th><th>افزودن به کتابخانه</th></tr></thead><tbody>{[...series].reverse().map((point) => <tr key={point.day}><td>{faDay(point.day)}</td><td className="num">{fa(point.downloads)}</td><td className="num">{fa(point.library)}</td></tr>)}</tbody></table></div>
      : <div className="sa-chart-body">
        <div className="sa-chart-tip" aria-live="polite">{shown ? <><b>{faDay(shown.day)}</b><span className="num">{fa(shown.downloads)} دانلود</span><small>{fa(shown.library)} افزودن به کتابخانه</small></> : <small>مجموع {fa(total)} دانلود — برای جزئیات روی ستون‌ها بروید</small>}</div>
        <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label="نمودار دانلود روزانه" preserveAspectRatio="none">
          {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={0} x2={width} y1={height - ratio * height} y2={height - ratio * height} className="sa-gridline" />)}
          {series.map((point, index) => {
            const h = point.downloads ? Math.max(3, (point.downloads / max) * height) : 0
            const x = width - (index + 1) * bar - index * gap
            return <g key={point.day} tabIndex={0} role="img" aria-label={`${faDay(point.day)}: ${fa(point.downloads)} دانلود`} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)}>
              <rect x={x} y={0} width={bar} height={height} className="sa-hit" />
              {h > 0 && <path className={`sa-bar${hover === index ? ' is-hover' : ''}`} d={`M${x},${height} v${-(Math.max(h, 4) - 4)} q0,-4 4,-4 h${Math.max(0, bar - 8)} q4,0 4,4 v${Math.max(h, 4) - 4} z`} />}
            </g>
          })}
          <line x1={0} x2={width} y1={height} y2={height} className="sa-axis" />
          {series.length > 0 && <>
            <text x={width} y={height + 18} textAnchor="end" className="sa-tick">{faDay(series[0].day)}</text>
            <text x={0} y={height + 18} textAnchor="start" className="sa-tick">{faDay(series[series.length - 1].day)}</text>
          </>}
        </svg>
        <div className="sa-chart-scale"><small>بیشینه: {fa(max)} دانلود در روز</small></div>
      </div>}
  </section>
}

export default function GamesDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/games/dashboard')
  const k = data?.kpis
  return <GamesShell title="مدیریت بازی‌ها" actions={<><Link href="/admin/games/new" className="btn btn-primary">+ افزودن بازی</Link><a href="/games" target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهدهٔ بخش بازی</a></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>بازی‌های منتشرشده</span><b className="num">{fa(k!.published)}</b><small className="sa-sub">{fa(k!.drafts)} پیش‌نویس · {fa(k!.scheduled)} زمان‌بندی‌شده</small></div>
        <div className="sa-kpi"><span>بازدید کل</span><b className="num">{fa(k!.views)}</b><small className="sa-sub">{fa(k!.clicks)} کلیک روی لینک‌ها</small></div>
        <div className="sa-kpi"><span>دانلود ۳۰ روز</span><b className="num">{fa(k!.downloads30)}</b><small className="sa-sub">{fa(k!.updates30)} آپدیت/DLC تازه</small></div>
        <div className="sa-kpi"><span>کتابخانهٔ کاربران</span><b className="num">{fa(k!.libraryTotal)}</b><small className="sa-sub">{fa(k!.libraryRecent)} تغییر در ۳۰ روز</small></div>
      </div>
      <div className="sa-queue">
        <Link href="/admin/games/releases" className={`sa-queue-item${k!.upcoming30 ? ' is-hot' : ''}`}><b className="num">{fa(k!.upcoming30)}</b><span>انتشار در ۳۰ روز آینده</span></Link>
        <Link href="/admin/downloads" className={`sa-queue-item${k!.openReports ? ' is-warn' : ''}`}><b className="num">{fa(k!.openReports)}</b><span>گزارش لینک خراب</span></Link>
        <Link href="/admin/games/titles?issue=any" className={`sa-queue-item${data.worst.length ? ' is-warn' : ''}`}><b className="num">{fa(data.health.reduce((sum, row) => sum + row.count, 0))}</b><span>کمبود محتوا</span></Link>
        <Link href="/admin/games/titles?status=editors" className="sa-queue-item"><b className="num">{fa(k!.editors)}</b><span>انتخاب سردبیر</span></Link>
        <Link href="/admin/games/franchises" className="sa-queue-item"><b className="num">{fa(k!.franchises)}</b><span>مجموعه</span></Link>
        <Link href="/admin/games/titles?status=draft" className="sa-queue-item"><b className="num">{fa(k!.drafts)}</b><span>پیش‌نویس</span></Link>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <DownloadsChart series={data.series} />
          <section className="sa-card">
            <header className="sa-card-head"><h2>سلامت محتوا</h2><small>صفحه‌هایی که چیزی کم دارند</small></header>
            {data.health.length ? <>
              <div className="ga-health">{data.health.map((row) => <Link key={row.key} href={`/admin/games/titles?issue=${row.key}`} className="ga-health-chip">{row.label}<b className="num">{fa(row.count)}</b></Link>)}</div>
              <ul className="sa-rows">{data.worst.map((game) => <li key={game.id}><Link href={`/admin/games/${game.id}`}>{game.cover ? <img src={game.cover} alt="" className="ga-thumb" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{game.title}</b><small>{game.issues.map((issue) => data.health.find((row) => row.key === issue)?.label || issue).join('، ')}</small></span><span className="sa-link">تکمیل</span></Link></li>)}</ul>
            </> : <p className="sa-hint">همهٔ صفحه‌های بازی کامل هستند. 👌</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>انتشارهای پیش رو</h2><Link href="/admin/games/releases" className="sa-link">تقویم</Link></header>
            {data.upcoming.length ? <ul className="sa-rank">{data.upcoming.map((game) => <li key={game.id}>{game.cover ? <img src={game.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><Link href={`/admin/games/${game.id}`}><b>{game.title}</b></Link><small>{faDate(game.releaseDate)} · {game.platforms.slice(0, 3).join('، ')}</small></span><span className="sa-state is-info num">{fa(game.days || 0)} روز</span></li>)}</ul> : <p className="sa-hint">بازی در راهی ثبت نشده است.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>پربازدیدترین‌ها</h2></header>
            <ul className="sa-rank">{data.topViewed.map((game) => <li key={game.id}>{game.cover ? <img src={game.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><Link href={`/admin/games/${game.id}`}><b>{game.title}</b></Link><small className="num">{fa(game.views)} بازدید{game.score !== null ? ` · نمره ${fa(game.score)}` : ''}</small></span></li>)}</ul>
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>کتابخانهٔ کاربران</h2></header>
            <dl className="sa-mini">{SHELF.map(([key, label]) => <div key={key} className="ga-contents"><dt>{label}</dt><dd className="num">{fa(k!.library[key] || 0)}</dd></div>)}</dl>
          </section>
        </div>
      </div>
    </>}
  </GamesShell>
}
