'use client'

import Link from '@/components/AppLink'
import { useState } from 'react'
import { CommunityShell, Notice, Who, fa, faDate, faDay, useJson, type Person } from './shared'

type Dashboard = {
  days: string[]; series: { posts: number[]; comments: number[]; follows: number[] }
  kpis: { posts: number; comments: number; likes: number; follows: number; activeMembers: number; openReports: number; profiles: number; verified: number; hidden: number }
  tags: { tag: string; count: number }[]; topMembers: (Person & { followers: number })[]
  topPosts: { id: number; text: string; likes: number; comments: number; author: Person | null; createdAt: string }[]
}

/** Posts per day (one series), hover readout and a table toggle. */
function Chart({ days, values, label }: { days: string[]; values: number[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...values)
  const w = 720, h = 160, gap = 2
  const bar = (w - gap * (values.length - 1)) / values.length
  return <section className="sa-card sa-chart">
    <header className="sa-card-head"><h2>{label} در ۳۰ روز اخیر</h2><button type="button" className="btn btn-ghost btn-sm" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'نمایش نمودار' : 'نمایش جدول'}</button></header>
    {table ? <div className="sa-table-wrap"><table className="data"><thead><tr><th>روز</th><th>{label}</th></tr></thead><tbody>{days.map((d, i) => [d, values[i]] as const).reverse().map(([d, v]) => <tr key={d}><td>{faDay(d)}</td><td className="num">{fa(v)}</td></tr>)}</tbody></table></div>
      : <div className="sa-chart-body">
        <div className="sa-chart-tip" aria-live="polite">{hover !== null ? <><b>{faDay(days[hover])}</b><span className="num">{fa(values[hover])} {label}</span></> : <small>مجموع {fa(values.reduce((a, b) => a + b, 0))} — روی ستون‌ها بروید</small>}</div>
        <svg viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label={`نمودار ${label}`} preserveAspectRatio="none">
          {[0, .5, 1].map((r) => <line key={r} x1={0} x2={w} y1={h - r * h} y2={h - r * h} className="sa-gridline" />)}
          {values.map((v, i) => { const bh = v ? Math.max(4, (v / max) * h) : 0; const x = w - (i + 1) * bar - i * gap; return <g key={i} tabIndex={0} role="img" aria-label={`${faDay(days[i])}: ${fa(v)}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}><rect x={x} y={0} width={bar} height={h} className="sa-hit" />{bh > 0 && <path className={`sa-bar${hover === i ? ' is-hover' : ''}`} d={`M${x},${h} v${-(bh - 4)} q0,-4 4,-4 h${Math.max(0, bar - 8)} q4,0 4,4 v${bh - 4} z`} />}</g> })}
          <line x1={0} x2={w} y1={h} y2={h} className="sa-axis" />
          <text x={w} y={h + 16} textAnchor="end" className="sa-tick">{faDay(days[0])}</text><text x={0} y={h + 16} textAnchor="start" className="sa-tick">{faDay(days[days.length - 1])}</text>
        </svg>
      </div>}
  </section>
}

export default function CommunityDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/community')
  const k = data?.kpis
  return <CommunityShell title="جامعه و پروفایل‌ها" actions={<a href="/feed" target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهدهٔ تازه‌ها</a>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data || !k ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>پست‌های ۳۰ روز</span><b className="num">{fa(k.posts)}</b><small className="sa-sub">{fa(k.comments)} دیدگاه · {fa(k.likes)} پسند</small></div>
        <div className="sa-kpi"><span>اعضای فعال</span><b className="num">{fa(k.activeMembers)}</b><small className="sa-sub">از {fa(k.profiles)} پروفایل</small></div>
        <div className="sa-kpi"><span>دنبال کردن‌های تازه</span><b className="num">{fa(k.follows)}</b><small className="sa-sub">در ۳۰ روز</small></div>
        <div className="sa-kpi"><span>گزارش باز</span><b className="num">{fa(k.openReports)}</b><small className="sa-sub"><Link href="/admin/community/reports" className="sa-link">رسیدگی</Link></small></div>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <Chart days={data.days} values={data.series.posts} label="پست" />
          <section className="sa-card"><header className="sa-card-head"><h2>پست‌های پرتعامل</h2></header>
            {data.topPosts.length ? <ul className="sa-rows">{data.topPosts.map((p) => <li key={p.id}><a href={`/feed/p/${p.id}`} target="_blank" rel="noreferrer"><span className="sa-grow"><b>{p.text || 'تصویر'}</b><small>{p.author?.name} · {faDate(p.createdAt)}</small></span><span className="num sa-sub">♥ {fa(p.likes)} · 💬 {fa(p.comments)}</span></a></li>)}</ul> : <p className="sa-hint">هنوز پستی نیست.</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card"><header className="sa-card-head"><h2>محبوب‌ترین اعضا</h2></header><ul className="sa-rank">{data.topMembers.map((m) => <li key={m.userId}><Who person={m} /><span className="num sa-sub">{fa(m.followers)} دنبال‌کننده</span></li>)}</ul></section>
          <section className="sa-card"><header className="sa-card-head"><h2>برچسب‌های داغ</h2></header>{data.tags.length ? <div className="ga-health">{data.tags.map((row) => <a key={row.tag} href={`/feed?tag=${encodeURIComponent(row.tag)}`} target="_blank" rel="noreferrer" className="ga-health-chip">#{row.tag}<b className="num">{fa(row.count)}</b></a>)}</div> : <p className="sa-hint">برچسبی استفاده نشده.</p>}</section>
          <section className="sa-card"><dl className="sa-mini"><dt>پروفایل تأییدشده</dt><dd className="num">{fa(k.verified)}</dd><dt>پست پنهان‌شده (۳۰ روز)</dt><dd className="num">{fa(k.hidden)}</dd></dl></section>
        </div>
      </div>
    </>}
  </CommunityShell>
}
