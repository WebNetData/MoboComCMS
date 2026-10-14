'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { STAGE_LABEL, STATUSES, STATUS_LABEL, answerText, type FormField, type Stage, type SubmissionStatus } from '@/modules/forms/domain/forms'
import type { Row, SavedForm } from './shared'
import { WorkPanel } from './ProPanels'
import { EditAndAssign, FieldStatsView } from './AdvancedPanels'

type Stats = { series: { day: string; count: number }[]; counts: Record<string, number> }
type Page = { rows: Row[]; total: number; page: number; pages: number; counts: Record<string, number>; work: Record<string, number> }
const fa = (n: number) => n.toLocaleString('fa-IR')
const when = (iso: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso))
const kb = (size: number) => (size >= 1048576 ? `${(size / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت` : `${fa(Math.max(1, Math.round(size / 1024)))} کیلوبایت`)
const STAGE_TONE: Record<string, string> = { OPEN: 'is-warn', IN_PROGRESS: 'is-info', DONE: 'is-good', REJECTED: 'is-bad', UNPAID: 'is-muted' }
const TILES: [key: string, label: string][] = [['OPEN', STAGE_LABEL.OPEN], ['IN_PROGRESS', STAGE_LABEL.IN_PROGRESS], ['DONE', STAGE_LABEL.DONE], ['REJECTED', STAGE_LABEL.REJECTED], ['UNPAID', 'پرداخت‌نشده']]

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

const summary = (row: Row) => row.answers.filter((a) => a.type !== 'file' && a.type !== 'signature' && a.type !== 'secret').slice(0, 2).map((a) => answerText(a.value)).filter(Boolean).join(' · ').slice(0, 90) || '—'

/**
 * The desk for form answers: how much work waits (tiles), the answers as a list, and the chosen one beside it —
 * what was sent, its bill, who holds it, where the work stands. `formId` 0 is the queue across every form the
 * member of staff may handle. Work somebody else holds is shown, not changed.
 */
export default function Inbox({ formId, fields, forms = [], me = 0, manager = true, onNotice }: { formId: number; fields: FormField[]; forms?: SavedForm[]; me?: number; manager?: boolean; onNotice: (tone: 'ok' | 'error', text: string) => void }) {
  const queue = formId === 0
  const [status, setStatus] = useState('ALL')
  const [stage, setStage] = useState('')
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})

  const query = `formId=${formId}&status=${status}&stage=${stage}&who=${who}&q=${encodeURIComponent(q)}`
  const load = useCallback(async () => {
    const result = await api<Page>(`/api/admin/forms/submissions?${query}&page=${page}`)
    if (result.ok) { setData(result.data); setPicked([]) } else onNotice('error', result.error)
  }, [query, page, onNotice])
  useEffect(() => { const t = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => { if (!queue && showStats) void api<Stats>(`/api/admin/forms/submissions?formId=${formId}&view=stats`).then((r) => r.ok && setStats(r.data)) }, [formId, queue, showStats, data?.total])
  useEffect(() => { setOpen(null); setPage(1) }, [formId])

  const row = data?.rows.find((item) => item.id === open) || null
  // Somebody else's work can be read; changing it is for the one who holds it or a manager of forms.
  const locked = (item: Row) => !manager && !!item.assigneeId && item.assigneeId !== me
  const fieldsOf = useMemo(() => (item: Row) => (queue ? forms.find((form) => form.id === item.formId)?.fields || [] : fields), [queue, forms, fields])

  async function setState(ids: number[], next: SubmissionStatus) {
    const r = await api('/api/admin/forms/submissions', 'PATCH', { ids, status: next })
    if (r.ok) void load(); else onNotice('error', r.error)
  }
  async function saveNote(id: number) {
    const r = await api('/api/admin/forms/submissions', 'PATCH', { id, note: notes[id] ?? '' })
    onNotice(r.ok ? 'ok' : 'error', r.ok ? 'یادداشت ذخیره شد.' : r.error)
  }
  async function remove(ids: number[]) {
    if (!window.confirm(`${fa(ids.length)} پاسخ برای همیشه حذف شود؟ ضمیمه‌ها هم پاک می‌شوند.`)) return
    const r = await api('/api/admin/forms/submissions', 'DELETE', { ids, formId })
    onNotice(r.ok ? 'ok' : 'error', r.ok ? 'حذف شد.' : r.error)
    if (r.ok) { setOpen(null); void load() }
  }
  function choose(item: Row) {
    setOpen(item.id)
    if (item.status === 'NEW' && !locked(item)) void setState([item.id], 'READ')
  }
  const filter = (set: () => void) => { set(); setPage(1); setOpen(null) }

  const work = data?.work || {}
  return <div className="dk">
    <div className="dk-tiles" role="group" aria-label="وضعیت کارها">
      {TILES.map(([key, label]) => <button key={key} type="button" className={`dk-tile ${STAGE_TONE[key]}`} aria-pressed={stage === key} onClick={() => filter(() => setStage(stage === key ? '' : key))}><b className="num">{fa(work[key] || 0)}</b><span>{label}</span></button>)}
    </div>

    <div className="dk-bar">
      <div className="ad-range" role="group" aria-label="مسئول">
        <button type="button" aria-pressed={who === ''} onClick={() => filter(() => setWho(''))}>همه</button>
        <button type="button" aria-pressed={who === 'mine'} onClick={() => filter(() => setWho('mine'))}>کارهای من</button>
        <button type="button" aria-pressed={who === 'free'} onClick={() => filter(() => setWho('free'))}>بدون مسئول</button>
      </div>
      <input className="input dk-search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="جست‌وجو در پاسخ‌ها…" aria-label="جست‌وجو" />
      <select className="input dk-triage" aria-label="دسته" value={status} onChange={(e) => filter(() => setStatus(e.target.value))}>
        <option value="ALL">همه (بدون هرزنامه)</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}{data?.counts[s] ? ` (${fa(data.counts[s])})` : ''}</option>)}
      </select>
      {!queue && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showStats} onClick={() => setShowStats(!showStats)}>{showStats ? 'بستن آمار' : 'آمار'}</button>}
      {!queue && <a className="btn btn-ghost btn-sm" href={`/api/admin/forms/submissions?${query}&export=csv`}>خروجی CSV</a>}
    </div>
    {!queue && showStats && <div className="dk-stats">{stats && <Bars series={stats.series} />}<FieldStatsView formId={formId} api={api} /></div>}
    {stage || who || status !== 'ALL' || q ? <p className="dk-filtered">فیلتر فعال است. <button type="button" className="sa-link" onClick={() => { setStage(''); setWho(''); setStatus('ALL'); setQ(''); setPage(1) }}>نمایش همه</button></p> : null}

    {picked.length > 0 && manager && <div className="fb-bulk" role="region" aria-label="عملیات گروهی"><b>{fa(picked.length)} انتخاب</b>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setState(picked, 'ARCHIVED')}>بایگانی</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setState(picked, 'SPAM')}>هرزنامه</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(picked)}>حذف</button></div>}

    <div className={`dk-split${row ? ' has-open' : ''}`}>
      <ul className="dk-list" aria-label="درخواست‌ها">
        {data?.rows.map((item) => <li key={item.id} className={`${item.id === open ? 'is-open' : ''}${item.status === 'NEW' ? ' is-new' : ''}`}>
          {manager && <input type="checkbox" aria-label={`انتخاب درخواست ${item.id}`} checked={picked.includes(item.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, item.id] : picked.filter((id) => id !== item.id))} />}
          <button type="button" className="dk-card" aria-current={item.id === open ? 'true' : undefined} onClick={() => choose(item)}>
            <span className="dk-card-top"><b className="num">#{fa(item.id)}</b>{queue && <em>{item.formTitle}</em>}<time>{when(item.createdAt)}</time></span>
            <span className="dk-card-text">{summary(item)}{item.files.length ? ` 📎${fa(item.files.length)}` : ''}</span>
            <span className="dk-card-foot">
              {item.payStatus === 'UNPAID' ? <i className="dk-pill is-muted">پرداخت‌نشده</i> : item.stage ? <i className={`dk-pill ${STAGE_TONE[item.stage] || ''}`}>{STAGE_LABEL[item.stage as Stage]}</i> : null}
              {item.amount > 0 && <i className="dk-pill num">{fa(item.amount)} ت</i>}
              <small>{item.assignee ? `در دست ${item.assigneeId === me ? 'شما' : item.assignee}` : item.user || 'مهمان'}</small>
            </span>
          </button>
        </li>)}
        {data && !data.rows.length && <li className="dk-empty">درخواستی با این فیلتر نیست.</li>}
        {!data && <li className="dk-empty" aria-busy="true">در حال بارگذاری…</li>}
      </ul>

      <section className="dk-detail" aria-label="جزئیات درخواست" aria-live="polite">
        {!row ? <p className="dk-hint">یک درخواست را از فهرست انتخاب کنید تا جزئیات و ابزار کار آن اینجا باز شود.</p> : <>
          <header className="dk-head">
            <div><h3>درخواست <span className="num">#{fa(row.id)}</span>{queue && <small> · {row.formTitle}</small>}</h3><p>{row.user || 'مهمان'} · {when(row.createdAt)}</p></div>
            <div className="dk-head-pills">
              {row.payStatus === 'UNPAID' ? <i className="dk-pill is-muted">پرداخت‌نشده</i> : row.stage ? <i className={`dk-pill ${STAGE_TONE[row.stage] || ''}`}>{STAGE_LABEL[row.stage as Stage]}</i> : null}
              <button type="button" className="btn btn-ghost btn-sm dk-close" onClick={() => setOpen(null)} aria-label="بستن جزئیات">بستن</button>
            </div>
          </header>
          {locked(row) && <p className="dk-lock" role="status">این درخواست در دست <b>{row.assignee}</b> است. می‌توانید آن را ببینید، اما تغییرش با خود او یا مدیر فرم‌هاست.</p>}

          <h4 className="dk-title">پاسخ‌ها</h4>
          <dl className="dk-answers">{row.answers.map((a) => <div key={a.id}><dt>{a.label}</dt><dd dir="auto">{a.type === 'file' || a.type === 'signature' ? (Array.isArray(a.value) && a.value.length ? 'پیوست (پایین)' : '—') : a.type === 'repeater' && Array.isArray(a.value) ? <ul>{a.value.map((line, index) => <li key={index}>{line}</li>)}</ul> : answerText(a.value) || '—'}</dd></div>)}</dl>
          {row.files.length > 0 && <div className="fb-attach">{row.files.map((f) => /\.(png|jpe?g|webp)$/i.test(f.id) ? <a key={f.id} href={`/api/admin/forms/files?id=${f.id}`} target="_blank" rel="noopener"><img src={`/api/admin/forms/files?id=${f.id}`} alt={f.name} /><small>{f.name} · {kb(f.size)}</small></a> : <a key={f.id} className="btn btn-ghost btn-sm" href={`/api/admin/forms/files?id=${f.id}&download=1`}>{f.name} · {kb(f.size)}</a>)}</div>}

          {!locked(row) && <>
            <EditAndAssign row={row} fields={fieldsOf(row)} manager={manager} api={api} onChanged={() => void load()} onNotice={onNotice} />
            <WorkPanel key={`${row.id}:${row.stage}:${row.reply.length}`} row={row} api={api} onChanged={() => void load()} onNotice={onNotice} />
            <h4 className="dk-title">یادداشت داخلی</h4>
            <textarea className="input" rows={2} maxLength={1000} aria-label="یادداشت داخلی" value={notes[row.id] ?? row.note} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })} />
            <div className="sa-row-actions dk-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveNote(row.id)}>ذخیرهٔ یادداشت</button>
              {(['STARRED', 'ARCHIVED', 'SPAM', 'NEW'] as SubmissionStatus[]).filter((s) => s !== row.status).map((s) => <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => void setState([row.id], s)}>{s === 'NEW' ? 'نخوانده' : STATUS_LABEL[s]}</button>)}
              {manager && <button type="button" className="sa-link is-danger" onClick={() => void remove([row.id])}>حذف</button>}
            </div>
          </>}
        </>}
      </section>
    </div>
    {data && data.pages > 1 && <nav className="sa-pager"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{fa(page)} از {fa(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
  </div>
}
