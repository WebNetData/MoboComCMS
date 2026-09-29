'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { AdsShell, Notice, STATUS_LABEL, StatusChip, fa, faDate, useJson } from '../shared'

type Row = { id: number; name: string; status: string; startsAt: string | null; endsAt: string | null; placements: string[]; impressions: number; clicks: number; ctr: number; maxImpressions: number; paid: string; advertiser: string; creatives: number; updatedAt: string }
type List = { rows: Row[]; total: number; page: number; pages: number; counts: Record<string, number> }

export default function CampaignsPage() {
  const initial = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('status') || ''
  const [status, setStatus] = useState(initial)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, error } = useJson<List>(`/api/admin/ads?view=campaigns&status=${status}&q=${encodeURIComponent(q)}&page=${page}`)
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0
  return <AdsShell title="کمپین‌های تبلیغاتی" actions={<Link href="/admin/ads/campaigns/new" className="btn btn-primary">+ کمپین تازه</Link>}>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="sa-filters">
      <div className="ad-range" role="group" aria-label="وضعیت">
        <button type="button" aria-pressed={status === ''} onClick={() => { setStatus(''); setPage(1) }}>همه {data ? `(${fa(total)})` : ''}</button>
        {Object.entries(STATUS_LABEL).map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1) }}>{label}{data?.counts[key] ? ` (${fa(data.counts[key])})` : ''}</button>)}
      </div>
      <input className="input" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="جست‌وجوی نام کمپین…" aria-label="جست‌وجو" />
    </div>
    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 820 }}><thead><tr><th>کمپین</th><th>تبلیغ‌دهنده</th><th>دوره</th><th>نمایش</th><th>کلیک</th><th>نرخ کلیک</th><th>پرداخت</th></tr></thead><tbody>
        {data?.rows.map((row) => <tr key={row.id}>
          <td><Link href={`/admin/ads/campaigns/${row.id}`} className="sa-link"><b>{row.name}</b></Link> <StatusChip status={row.status} /><small className="sa-sub">{row.creatives ? `${fa(row.creatives)} تبلیغ` : 'بدون تبلیغ'} · {fa(row.placements.length)} جایگاه</small></td>
          <td>{row.advertiser || '—'}</td>
          <td className="sa-sub">{row.startsAt ? faDate(row.startsAt) : '—'} تا {row.endsAt ? faDate(row.endsAt) : 'نامحدود'}</td>
          <td className="num">{fa(row.impressions)}{row.maxImpressions ? <small> / {fa(row.maxImpressions)}</small> : null}</td>
          <td className="num">{fa(row.clicks)}</td>
          <td className="num">{row.ctr.toLocaleString('fa-IR')}٪</td>
          <td>{row.paid || '—'}</td>
        </tr>)}
        {data && !data.rows.length && <tr><td colSpan={7} className="sa-empty">کمپینی پیدا نشد.</td></tr>}
      </tbody></table>
    </section>
    {data && data.pages > 1 && <nav className="sa-pager"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{fa(page)} از {fa(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
  </AdsShell>
}
