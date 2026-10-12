'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { STATUSES, STATUS_LABEL, answerText, type SubmissionStatus } from '@/modules/forms/domain/forms'
import type { Row } from './shared'

type Stats = { series: { day: string; count: number }[]; counts: Record<string, number> }
type Page = { rows: Row[]; total: number; page: number; pages: number; counts: Record<string, number> }
const fa = (n: number) => n.toLocaleString('fa-IR')
const when = (iso: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso))
const kb = (size: number) => (size >= 1048576 ? `${(size / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت` : `${fa(Math.max(1, Math.round(size / 1024)))} کیلوبایت`)
const TONE: Record<string, string> = { NEW: 'is-info', READ: '', STARRED: 'is-warn', ARCHIVED: '', SPAM: 'is-bad' }

async function api<T>(url: string, method: 'GET' | 'PATCH' | 'DELETE' = 'GET', body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  const data = await response?.json().catch(() => null)
  if (!response) return { ok: false, error: 'ارتباط با سرور برقرار نشد' }
  return response.ok ? { ok: true, data: data as T } : { ok: false, error: String(data?.error || 'انجام نشد') }
}

function Bars({ series }: { series: Stats['series'] }) {
  const max = Math.max(1, ...series.map((d) => d.count))
  const total = series.reduce((sum, d) => sum + d.count, 0)
  return <figure className="fb-chart"><figcaption><b>پاسخ‌های ۳۰ روز اخیر</b><span className="num">{fa(total)}</span></figcaption>
    <div className="fb-bars" role="img" aria-label={`${fa(total)} پاسخ در ۳۰ روز اخیر`}>{series.map((d) => <i key={d.day} title={`${d.day}: ${fa(d.count)}`} style={{ height: `${Math.max(d.count ? 8 : 2, (d.count / max) * 100)}%` }} className={d.count ? 'has' : ''} />)}</div></figure>
}

/** Answers: status tabs, search and dates, bulk actions, notes, attachments, CSV export. */
export default function Inbox({ formId, onNotice }: { formId: number; onNotice: (tone: 'ok' | 'error', text: string) => void }) {
  const [status, setStatus] = useState('ALL')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})

  const query = `formId=${formId}&status=${status}&q=${encodeURIComponent(q)}&from=${from}&to=${to}`
  const load = useCallback(async () => {
    const result = await api<Page>(`/api/admin/forms/submissions?${query}&page=${page}`)
    if (result.ok) { setData(result.data); setPicked([]) } else onNotice('error', result.error)
  }, [query, page, onNotice])
  useEffect(() => { const t = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => { void api<Stats>(`/api/admin/forms/submissions?formId=${formId}&view=stats`).then((r) => r.ok && setStats(r.data)) }, [formId, data?.total])

  async function setState(ids: number[], next: SubmissionStatus) {
    const r = await api('/api/admin/forms/submissions', 'PATCH', { ids, status: next })
    if (r.ok) { void load() } else onNotice('error', r.error)
  }
  async function saveNote(id: number) {
    const r = await api('/api/admin/forms/submissions', 'PATCH', { id, note: notes[id] ?? '' })
    onNotice(r.ok ? 'ok' : 'error', r.ok ? 'یادداشت ذخیره شد.' : r.error)
  }
  async function remove(ids: number[]) {
    if (!window.confirm(`${fa(ids.length)} پاسخ برای همیشه حذف شود؟ ضمیمه‌ها هم پاک می‌شوند.`)) return
    const r = await api('/api/admin/forms/submissions', 'DELETE', { ids, formId })
    onNotice(r.ok ? 'ok' : 'error', r.ok ? 'حذف شد.' : r.error)
    if (r.ok) void load()
  }
  function expand(row: Row) {
    setOpen(open === row.id ? null : row.id)
    if (row.status === 'NEW') void setState([row.id], 'READ')
  }

  const counts = data?.counts || {}
  const all = Object.entries(counts).filter(([k]) => k !== 'SPAM').reduce((sum, [, n]) => sum + n, 0)
  return <div className="fb-inbox">
    {stats && <Bars series={stats.series} />}
    <div className="sa-filters">
      <div className="ad-range" role="group" aria-label="وضعیت">
        <button type="button" aria-pressed={status === 'ALL'} onClick={() => { setStatus('ALL'); setPage(1) }}>همه ({fa(all)})</button>
        {STATUSES.map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setPage(1) }}>{STATUS_LABEL[s]}{counts[s] ? ` (${fa(counts[s])})` : ''}</button>)}
      </div>
      <input className="input" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="جست‌وجو در پاسخ‌ها…" aria-label="جست‌وجو" />
      <label className="fb-date">از <input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} /></label>
      <label className="fb-date">تا <input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} /></label>
      <a className="btn btn-ghost" href={`/api/admin/forms/submissions?${query}&export=csv`}>خروجی CSV</a>
    </div>
    {picked.length > 0 && <div className="fb-bulk" role="region" aria-label="عملیات گروهی"><b>{fa(picked.length)} انتخاب</b>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setState(picked, 'READ')}>خوانده‌شده</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setState(picked, 'ARCHIVED')}>بایگانی</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setState(picked, 'SPAM')}>هرزنامه</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(picked)}>حذف</button></div>}

    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 720 }}>
        <thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="انتخاب همه" checked={!!data?.rows.length && picked.length === data.rows.length} onChange={(e) => setPicked(e.target.checked ? data?.rows.map((r) => r.id) || [] : [])} /></th><th>#</th><th>پاسخ</th><th>کاربر</th><th>زمان</th><th>وضعیت</th></tr></thead>
        <tbody>
          {data?.rows.map((row) => <Fragment key={row.id}>
            <tr className={row.status === 'NEW' ? 'fb-new' : ''}>
              <td><input type="checkbox" aria-label={`انتخاب پاسخ ${row.id}`} checked={picked.includes(row.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, row.id] : picked.filter((id) => id !== row.id))} /></td>
              <td className="num">{fa(row.id)}</td>
              <td><button type="button" className="fb-open" aria-expanded={open === row.id} onClick={() => expand(row)}>{row.answers.slice(0, 2).map((a) => answerText(a.value)).filter(Boolean).join(' · ').slice(0, 90) || '—'}{row.files.length ? ` 📎${fa(row.files.length)}` : ''}</button></td>
              <td>{row.user || <span className="sa-sub">مهمان</span>}</td>
              <td className="sa-sub">{when(row.createdAt)}</td>
              <td><span className={`sa-state ${TONE[row.status] || ''}`}>{STATUS_LABEL[row.status] || row.status}</span></td>
            </tr>
            {open === row.id && <tr className="fb-detail"><td colSpan={6}>
              <dl>{row.answers.map((a) => <div key={a.id}><dt>{a.label}</dt><dd>{a.type === 'file' ? '' : answerText(a.value) || '—'}{a.type === 'rating' && a.value ? ' (امتیاز)' : ''}</dd></div>)}</dl>
              {row.files.length > 0 && <div className="fb-attach">{row.files.map((f) => /\.(png|jpe?g|webp)$/i.test(f.id) ? <a key={f.id} href={`/api/admin/forms/files?id=${f.id}`} target="_blank" rel="noopener"><img src={`/api/admin/forms/files?id=${f.id}`} alt={f.name} /><small>{f.name} · {kb(f.size)}</small></a> : <a key={f.id} className="btn btn-ghost btn-sm" href={`/api/admin/forms/files?id=${f.id}&download=1`}>📄 {f.name} · {kb(f.size)}</a>)}</div>}
              <label className="sa-field"><span>یادداشت داخلی</span><textarea className="input" rows={2} maxLength={1000} value={notes[row.id] ?? row.note} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })} /></label>
              <div className="sa-row-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveNote(row.id)}>ذخیرهٔ یادداشت</button>
                {(['STARRED', 'ARCHIVED', 'SPAM', 'NEW'] as SubmissionStatus[]).filter((s) => s !== row.status).map((s) => <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => void setState([row.id], s)}>{s === 'NEW' ? 'نخوانده' : STATUS_LABEL[s]}</button>)}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove([row.id])}>حذف</button>
              </div>
            </td></tr>}
          </Fragment>)}
          {data && !data.rows.length && <tr><td colSpan={6} className="sa-empty">پاسخی پیدا نشد.</td></tr>}
        </tbody>
      </table>
    </section>
    {data && data.pages > 1 && <nav className="sa-pager"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{fa(page)} از {fa(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
  </div>
}
