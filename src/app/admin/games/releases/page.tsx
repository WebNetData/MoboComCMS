'use client'

import Link from '@/components/AppLink'
import { useState } from 'react'
import { GamesShell, Notice, RELEASE_LABEL, faDate, send, useJson } from '../shared'
import JalaliDateInput from '@/components/date/JalaliDateInput'

type Row = { id: number; slug: string; title: string; cover: string; platforms: string[]; releaseDate: string; status: string; featured: boolean; perPlatform: boolean; release: { state: string; days: number | null } }
type Plan = { upcoming: Row[]; recent: Row[]; tba: Row[] }

/** Release planning: coming releases grouped by month, games without a date and last month's launches; dates change inline. */
export default function GamesReleasesPage() {
  const { data, error, reload } = useJson<Plan>('/api/admin/games/releases')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'tba' | 'recent'>('upcoming')

  async function change(row: Row, value: string) {
    const response = await send<{ releaseDate: string }>('/api/admin/games/releases', 'POST', { id: row.id, releaseDate: value || null })
    setMessage(response.ok ? { tone: 'ok', text: `تاریخ انتشار «${row.title}» ${value ? `به ${faDate(value)}` : 'به «اعلام نشده»'} تغییر کرد` } : { tone: 'error', text: response.error })
    void reload()
  }

  const rows = data?.[tab] || []
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = row.releaseDate ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.releaseDate}T12:00:00Z`)) : 'بدون تاریخ'
    groups.set(key, [...(groups.get(key) || []), row])
  }
  return <GamesShell title="تقویم انتشار" actions={<a href="/games/calendar" target="_blank" rel="noreferrer" className="btn btn-ghost">تقویم در سایت</a>}>
    <nav className="sa-subtabs" aria-label="نما">{([['upcoming', 'در راه', data?.upcoming.length], ['tba', 'بدون تاریخ', data?.tba.length], ['recent', 'منتشرشده در ۳۰ روز اخیر', data?.recent.length]] as const).map(([key, label, count]) => <button key={key} type="button" className={tab === key ? 'is-active' : ''} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{count ? <span className="num">{count.toLocaleString('fa-IR')}</span> : null}</button>)}</nav>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : rows.length === 0 ? <div className="sa-card sa-empty">موردی نیست.</div>
      : [...groups].map(([month, list]) => <section key={month} className="sa-card">
        <header className="sa-card-head"><h2>{month}</h2><small className="num">{list.length.toLocaleString('fa-IR')} بازی</small></header>
        <ul className="ga-release-list">{list.map((row) => <li key={row.id}>
          {row.cover ? <img src={row.cover} alt="" /> : <span className="sa-ph" />}
          <span className="sa-grow"><Link href={`/admin/games/${row.id}`} className="sa-link"><b>{row.title}</b></Link><small>{row.platforms.join(' · ')}{row.perPlatform ? ' · تاریخ جداگانه برای هر پلتفرم' : ''}{row.status !== 'PUBLISHED' ? ' · پیش‌نویس' : ''}</small></span>
          <span className={`sa-state ${row.release.state === 'upcoming' ? 'is-info' : ''}`}>{RELEASE_LABEL(row.release)}</span>
          <label className="sa-inline"><span className="sr-only">تاریخ انتشار {row.title}</span><JalaliDateInput className="input" defaultValue={row.releaseDate} onChange={(value) => { if (value !== row.releaseDate) void change(row, value) }} aria-label={`تاریخ انتشار ${row.title}`} /></label>
        </li>)}</ul>
      </section>)}
    <p className="sa-hint">تاریخ را تغییر دهید و از فیلد خارج شوید تا ذخیره شود. برای تاریخ جداگانهٔ هر پلتفرم، صفحهٔ ویرایش بازی را باز کنید.</p>
  </GamesShell>
}
