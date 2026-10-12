'use client'

import Link from '@/components/AppLink'
import { DailyBars } from '../cms/SectionAdmin'
import { JournalShell, Notice, fa, faDate, useJson } from './shared'

type Dashboard = {
  kpis: { published: number; drafts: number; scheduled: number; views: number; posts30: number; pendingComments: number; comments30: number; vip: number; featured: number; categories: number }
  series: { day: string; comments: number; posts: number }[]
  health: { key: string; label: string; count: number }[]
  worst: { id: number; title: string; cover: string; issues: string[] }[]
  topViewed: { id: number; slug: string; title: string; cover: string; views: number; comments: number }[]
  scheduledList: { id: number; title: string; cover: string; at: string }[]
  pending: { id: number; body: string; author: string; post: string; createdAt: string }[]
  categories: { name: string; count: number }[]
  authors: { name: string; posts: number; views: number }[]
}

/** Journal dashboard: output, reading, comment queue, schedule and article quality. */
export default function JournalDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/journal/dashboard')
  const k = data?.kpis
  const maxCat = Math.max(1, ...(data?.categories || []).map((row) => row.count))
  return <JournalShell title="مدیریت مجله" actions={<><Link href="/admin/posts" className="btn btn-primary">+ نوشتهٔ تازه</Link><a href="/blog" target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهدهٔ مجله</a></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data || !k ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>مطالب منتشرشده</span><b className="num">{fa(k.published)}</b><small className="sa-sub">{fa(k.posts30)} مطلب در ۳۰ روز اخیر</small></div>
        <div className="sa-kpi"><span>بازدید کل</span><b className="num">{fa(k.views)}</b><small className="sa-sub">میانگین {fa(k.published ? Math.round(k.views / k.published) : 0)} برای هر مطلب</small></div>
        <div className="sa-kpi"><span>دیدگاه ۳۰ روز</span><b className="num">{fa(k.comments30)}</b><small className="sa-sub">{fa(k.pendingComments)} در انتظار تأیید</small></div>
        <div className="sa-kpi"><span>دسته‌بندی‌ها</span><b className="num">{fa(k.categories)}</b><small data-vip="" className="sa-sub">{fa(k.vip)} مطلب ویژهٔ VIP</small></div>
      </div>
      <div className="sa-queue">
        <Link href="/admin/comments" className={`sa-queue-item${k.pendingComments ? ' is-hot' : ''}`}><b className="num">{fa(k.pendingComments)}</b><span>دیدگاه در انتظار</span></Link>
        <Link href="/admin/posts" className="sa-queue-item"><b className="num">{fa(k.drafts)}</b><span>پیش‌نویس</span></Link>
        <Link href="/admin/posts" className="sa-queue-item"><b className="num">{fa(k.scheduled)}</b><span>زمان‌بندی‌شده</span></Link>
        <Link href="/admin/journal/settings" className="sa-queue-item"><b className="num">{fa(k.featured)}</b><span>مطلب ویژه</span></Link>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <DailyBars title="دیدگاه‌های تازه در ۳۰ روز اخیر" unit="دیدگاه" series={data.series.map((point) => ({ day: point.day, value: point.comments }))} />
          <section className="sa-card">
            <header className="sa-card-head"><h2>دیدگاه‌های در انتظار</h2><Link href="/admin/comments" className="sa-link">بررسی همه</Link></header>
            {data.pending.length ? <ul className="sa-rows">{data.pending.map((row) => <li key={row.id}><Link href="/admin/comments"><span className="sa-grow"><b>{row.author} <small>دربارهٔ «{row.post}»</small></b><small dir="auto">{row.body}</small></span><span className="sa-link">بررسی</span></Link></li>)}</ul> : <p className="sa-hint">دیدگاهی در انتظار نیست.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>کیفیت مطالب</h2><small>مطالبی که چیزی کم دارند</small></header>
            {data.health.length ? <>
              <div className="ga-health">{data.health.map((row) => <span key={row.key} className="ga-health-chip">{row.label}<b className="num">{fa(row.count)}</b></span>)}</div>
              <ul className="sa-rows">{data.worst.map((row) => <li key={row.id}><Link href="/admin/posts">{row.cover ? <img src={row.cover} alt="" className="ga-thumb" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{row.title}</b><small>{row.issues.map((issue) => data.health.find((h) => h.key === issue)?.label || issue).join('، ')}</small></span><span className="sa-link">ویرایش</span></Link></li>)}</ul>
            </> : <p className="sa-hint">همهٔ مطالب کامل هستند.</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>پربازدیدترین مطالب</h2></header>
            {data.topViewed.length ? <ul className="sa-rank">{data.topViewed.map((row) => <li key={row.id}>{row.cover ? <img src={row.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><a href={`/blog/${row.slug}`} target="_blank" rel="noreferrer"><b>{row.title}</b></a><small className="num">{fa(row.views)} بازدید · {fa(row.comments)} دیدگاه</small></span></li>)}</ul> : <p className="sa-hint">هنوز مطلبی منتشر نشده است.</p>}
          </section>
          {data.scheduledList.length > 0 && <section className="sa-card">
            <header className="sa-card-head"><h2>انتشارهای زمان‌بندی‌شده</h2></header>
            <ul className="sa-rank">{data.scheduledList.map((row) => <li key={row.id}>{row.cover ? <img src={row.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{row.title}</b><small>{faDate(row.at)}</small></span></li>)}</ul>
          </section>}
          <section className="sa-card">
            <header className="sa-card-head"><h2>دسته‌بندی‌ها</h2><Link href="/admin/postcats" className="sa-link">مدیریت</Link></header>
            {data.categories.length ? <ul className="sx-bars">{data.categories.map((row) => <li key={row.name}><span>{row.name}</span><span className="sx-bar" aria-hidden="true"><i style={{ width: `${(row.count / maxCat) * 100}%` }} /></span><b className="num">{fa(row.count)}</b></li>)}</ul> : <p className="sa-hint">مطلبی دسته‌بندی نشده است.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>نویسندگان</h2></header>
            <ul className="sa-rank">{data.authors.map((row) => <li key={row.name}><span className="sa-grow"><b>{row.name}</b><small className="num">{fa(row.posts)} مطلب · {fa(row.views)} بازدید</small></span></li>)}</ul>
          </section>
        </div>
      </div>
    </>}
  </JournalShell>
}
