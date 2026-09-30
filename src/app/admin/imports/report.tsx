'use client'

import { useCallback, useEffect, useState } from 'react'
import { Notice, Pager, fa, faDate } from '../store/shared'
import { ACTION_LABEL, JOB_STATUS, LIVE, RECORD_STATUS, type Job, type RecordRow } from './types'

export async function post<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch('/api/admin/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true, data: data as T } : { ok: false, error: data?.error || 'انجام نشد؛ اتصال را بررسی کنید' }
}

export function StatusChip({ status, map = JOB_STATUS }: { status: string; map?: Record<string, [string, string]> }) {
  const [label, tone] = map[status] || [status, '']
  return <span className={`imp-chip ${tone}`}>{label}</span>
}

export function Stats({ stats, labels }: { stats: Record<string, number>; labels: Record<string, string> }) {
  const keys = Object.keys(stats).filter((key) => stats[key] && labels[key])
  if (!keys.length) return null
  return <dl className="imp-stats">{keys.map((key) => <div key={key}><dt>{labels[key]}</dt><dd className="num">{fa(stats[key])}</dd></div>)}</dl>
}

/** Progress, controls and the per-record history of one job (live while it runs). */
export function JobReport({ jobId, labels, onBack }: { jobId: number; labels: Record<string, string>; onBack?: () => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<{ records: RecordRow[]; pages: number; total: number; counts: Record<string, number> } | null>(null)

  const loadJob = useCallback(async () => {
    const response = await fetch(`/api/admin/imports?view=job&id=${jobId}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setJob(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
  }, [jobId])
  const loadRecords = useCallback(async () => {
    const response = await fetch(`/api/admin/imports?view=records&id=${jobId}&page=${page}${filter ? `&status=${filter}` : ''}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setRows(await response.json())
  }, [jobId, page, filter])

  useEffect(() => { void loadJob() }, [loadJob])
  useEffect(() => { void loadRecords() }, [loadRecords])
  const live = !!job && LIVE.includes(job.status)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => { void loadJob(); void loadRecords() }, 2500)
    return () => clearInterval(timer)
  }, [live, loadJob, loadRecords])

  async function act(op: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(op); setNotice(null)
    const result = await post<Job>({ op, id: jobId, ...(op === 'rollback' ? { confirm: true } : {}) })
    setBusy('')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setJob(result.data)
    void loadRecords()
  }

  if (error) return <Notice tone="error">{error}</Notice>
  if (!job) return <div className="sa-skeleton" aria-busy="true" style={{ height: 220 }} />
  const processed = job.stats.processed || 0
  const percent = job.total ? Math.min(100, Math.round((processed / job.total) * 100)) : 0
  const canRollback = ['DONE', 'DONE_WITH_ERRORS', 'CANCELLED', 'FAILED', 'PAUSED'].includes(job.status) && (job.stats.created || job.stats.updated)

  return <section className="imp-report" aria-live="polite">
    <div className="sa-card imp-report-head">
      <div>
        <h2>ورود اطلاعات #{fa(job.id)} <StatusChip status={job.status} /></h2>
        <p className="sa-hint">{job.fileName} · {job.adapter} · {job.createdByEmail} · {faDate(job.createdAt, true)}{job.finishedAt ? ` تا ${faDate(job.finishedAt, true)}` : ''}</p>
      </div>
      <div className="imp-actions">
        {onBack && <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>بازگشت به فهرست</button>}
        {['QUEUED', 'RUNNING'].includes(job.status) && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('pause')}>توقف موقت</button>}
        {job.status === 'PAUSED' && <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('resume')}>ادامه</button>}
        {['QUEUED', 'RUNNING', 'PAUSED'].includes(job.status) && <button type="button" className="btn btn-ghost btn-sm is-danger" disabled={!!busy} onClick={() => act('cancel', 'ورود اطلاعات لغو شود؟ رکوردهای واردشده باقی می‌مانند (می‌توانید بعداً بازگردانی کنید).')}>لغو</button>}
        {canRollback && <button type="button" className="btn btn-ghost btn-sm is-danger" disabled={!!busy} onClick={() => act('rollback', 'تغییرات این ورود اطلاعات بازگردانده شود؟ ردیف‌هایی که پس از ورود ویرایش شده‌اند دست نمی‌خورند و گزارش می‌شوند.')}>بازگردانی (Rollback)</button>}
      </div>
    </div>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {job.error && <Notice tone="error">{job.error}</Notice>}
    {job.status !== 'DRAFT' && <div className="sa-card">
      <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="پیشرفت">
        <span style={{ inlineSize: `${percent}%` }} />
      </div>
      <p className="sa-hint num">{fa(processed)} از {fa(job.total)} رکورد ({fa(percent)}٪){live ? ' — صفحه خودکار به‌روز می‌شود' : ''}</p>
      <Stats stats={job.stats} labels={labels} />
    </div>}
    <div className="sa-card sa-table-wrap">
      <div className="sa-card-head">
        <h3>رکوردها{rows ? ` (${fa(rows.total)})` : ''}</h3>
        <div className="imp-actions">
          <select className="select" value={filter} aria-label="فیلتر وضعیت" onChange={(e) => { setFilter(e.target.value); setPage(1) }}>
            <option value="">همهٔ وضعیت‌ها</option>
            {Object.entries(RECORD_STATUS).map(([key, [label]]) => <option key={key} value={key}>{label}{rows?.counts[key] ? ` (${fa(rows.counts[key])})` : ''}</option>)}
          </select>
          <a className="btn btn-ghost btn-sm" href={`/api/admin/imports?view=export&id=${job.id}&format=csv`}>خطاها CSV</a>
          <a className="btn btn-ghost btn-sm" href={`/api/admin/imports?view=export&id=${job.id}&format=json`}>خطاها JSON</a>
          <a className="btn btn-ghost btn-sm" href={`/api/admin/imports?view=export&id=${job.id}&format=csv&all=1`}>گزارش کامل CSV</a>
        </div>
      </div>
      {!rows ? <div className="sa-skeleton" style={{ height: 120 }} /> : !rows.records.length ? <p className="sa-empty">{job.status === 'DRAFT' ? 'هنوز اجرا نشده است.' : 'رکوردی با این وضعیت نیست.'}</p> :
        <table className="data sa-table imp-records">
          <thead><tr><th>رکورد</th><th>ردیف فایل</th><th>عنوان</th><th>عملیات</th><th>وضعیت</th><th>نتیجه</th><th>پیام‌ها</th></tr></thead>
          <tbody>{rows.records.map((row) => <tr key={row.id}>
            <td className="num">{fa(row.index + 1)}</td>
            <td className="num">{row.rows.slice(0, 4).map((n) => fa(n)).join('، ')}{row.rows.length > 4 ? '…' : ''}</td>
            <td><b>{row.title}</b>{row.sourceKey && <small className="imp-key" dir="ltr">{row.sourceKey}</small>}</td>
            <td>{ACTION_LABEL[row.action] || row.action}</td>
            <td><StatusChip status={row.status} map={RECORD_STATUS} /></td>
            <td>{row.entityId ? <span className="num" dir="ltr">{row.entityType} #{row.entityId}</span> : '—'}</td>
            <td><Messages messages={row.messages} /></td>
          </tr>)}</tbody>
        </table>}
      {rows && <Pager page={page} pages={rows.pages} onPage={setPage} />}
    </div>
  </section>
}

export function Messages({ messages, limit = 4 }: { messages: { level: string; text: string }[]; limit?: number }) {
  const [open, setOpen] = useState(false)
  const shown = open ? messages : messages.slice(0, limit)
  if (!messages.length) return <span className="sa-hint">—</span>
  return <ul className="imp-messages">
    {shown.map((m, i) => <li key={i} className={`is-${m.level}`}>{m.text}</li>)}
    {messages.length > limit && <li><button type="button" className="sa-link" onClick={() => setOpen(!open)}>{open ? 'کمتر' : `${fa(messages.length - limit)} پیام دیگر`}</button></li>}
  </ul>
}
