'use client'

import { useEffect, useState } from 'react'
import styles from './WebhookDeliveries.module.css'

type Status = 'PENDING' | 'RETRY' | 'IN_FLIGHT' | 'DELIVERED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED'
type Event = 'submitted' | 'paid' | 'stage' | 'test'
type Delivery = {
  id: number
  eventId: string
  event: Event
  host: string
  status: Status
  attempts: number
  httpStatus: number | null
  durationMs: number | null
  detail: string
  createdAt: string
  updatedAt: string
  nextAttemptAt: string | null
  replayable: boolean
}
type Target = { index: number; host: string; enabled: boolean }
type View = { rows: Delivery[]; targets: Target[]; nextBefore: number | null }

const STATUS: Record<Status, string> = {
  PENDING: 'در انتظار ارسال', RETRY: 'در انتظار تلاش دوباره', IN_FLIGHT: 'در حال ارسال',
  DELIVERED: 'تحویل‌شده', FAILED: 'ناموفق', UNKNOWN: 'نیازمند بررسی', CANCELLED: 'لغوشده',
}
const EVENT: Record<Event, string> = { submitted: 'ثبت پاسخ', paid: 'پرداخت', stage: 'تغییر مرحله', test: 'آزمایش' }
const fa = (value: number) => value.toLocaleString('fa-IR')
const date = (value: string) => new Date(value).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })

function ReplayForm({ busy, row, cancel, submit }: { busy: boolean; row: Delivery; cancel: () => void; submit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const valid = confirmed && reason.trim().length >= 5
  return <form className={styles.replay} onSubmit={(event) => { event.preventDefault(); if (valid && !busy) submit(reason.trim()) }}>
    <p>ممکن است گیرنده رویداد را قبلاً اجرا کرده باشد. پیش از ارسال دوباره مطمئن شوید گیرنده با شناسهٔ رویداد از اجرای تکراری جلوگیری می‌کند.</p>
    <label className="sa-field"><span>دلیل ارسال دوباره</span><textarea className="input" rows={2} minLength={5} maxLength={300} required value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby={`replay-help-${row.id}`} /></label>
    <small id={`replay-help-${row.id}`}>دلیل را در ۵ تا ۳۰۰ نویسه بنویسید.</small>
    <label className="sa-check"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />وضعیت گیرنده و احتمال اجرای تکراری را بررسی کردم</label>
    <div className={styles.controls}><button type="submit" className="btn btn-primary btn-sm" disabled={busy || !valid}>ثبت ارسال دوباره</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={cancel}>انصراف</button></div>
  </form>
}

export default function WebhookDeliveries({ formId, dirty }: { formId: number; dirty: boolean }) {
  const [status, setStatus] = useState('')
  const [cursors, setCursors] = useState<(number | null)[]>([null])
  const [refresh, setRefresh] = useState(0)
  const [view, setView] = useState<View | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [targetIndex, setTargetIndex] = useState('')
  const [busy, setBusy] = useState(false)
  const [replayId, setReplayId] = useState<number | null>(null)
  const before = cursors[cursors.length - 1]

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ formId: String(formId) })
    if (status) params.set('status', status)
    if (before !== null) params.set('before', String(before))
    setLoading(true)
    setError('')
    fetch(`/api/admin/forms/webhooks?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const failure = await response.json().catch(() => null)
          throw new Error(failure?.error || 'دریافت تاریخچه ممکن نشد')
        }
        return response.json() as Promise<View>
      })
      .then((data) => { if (!controller.signal.aborted) setView(data) })
      .catch((failure: unknown) => { if (!controller.signal.aborted) { setView(null); setError(failure instanceof Error ? failure.message : 'دریافت تاریخچه ممکن نشد') } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [formId, status, before, refresh, dirty])

  async function command(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/forms/webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, formId }) })
      if (!response.ok) {
        const failure = await response.json().catch(() => null)
        throw new Error(failure?.error || 'درخواست انجام نشد')
      }
      const data = await response.json()
      setNotice(`درخواست در صف قرار گرفت. شناسهٔ رویداد ${data.eventId}`)
      setReplayId(null)
      setCursors([null])
      setRefresh((value) => value + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'درخواست انجام نشد')
    } finally {
      setBusy(false)
    }
  }

  return <div className={styles.stack}>
    <section className="sa-card" aria-labelledby="webhook-test-title">
      <header className="sa-card-head"><h2 id="webhook-test-title">آزمون مقصد</h2></header>
      <p className="sa-hint">یک رویداد آزمایشی با دادهٔ ساختگی به مقصد ذخیره‌شده فرستاده می‌شود. مقصد غیرفعال نیز قابل آزمایش است.</p>
      {dirty && <p className="sa-hint">برای آزمون، ابتدا تغییرات فرم را ذخیره کنید.</p>}
      <div className={styles.controls}>
        <label className="sa-field"><span>مقصد ذخیره‌شده</span><select className="input" value={targetIndex} onChange={(event) => setTargetIndex(event.target.value)} disabled={loading || !view?.targets.length}>
          <option value="">انتخاب مقصد</option>
          {view?.targets.map((target) => <option key={target.index} value={target.index}>مقصد {fa(target.index + 1)} · {target.host} · {target.enabled ? 'فعال' : 'غیرفعال'}</option>)}
        </select></label>
        <button type="button" className="btn btn-primary" disabled={dirty || loading || busy || targetIndex === '' || !view?.targets.some((target) => String(target.index) === targetIndex)} onClick={() => void command({ op: 'test', targetIndex: Number(targetIndex) })}>ارسال آزمایشی</button>
      </div>
      {!loading && view && !view.targets.length && <p className="sa-hint">برای آزمون، ابتدا یک وب‌هوک در تنظیمات فرم ذخیره کنید.</p>}
    </section>

    <section className="sa-card" aria-labelledby="webhook-history-title" aria-busy={loading}>
      <header className="sa-card-head"><h2 id="webhook-history-title">تاریخچهٔ ارسال‌ها</h2><button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>تازه‌سازی</button></header>
      <label className="sa-field"><span>وضعیت</span><select className="input" value={status} onChange={(event) => { setStatus(event.target.value); setCursors([null]); setReplayId(null) }}>
        <option value="">همهٔ وضعیت‌ها</option>
        {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {notice && <p className="sa-notice is-ok" role="status">{notice}</p>}
      {error && <p className="sa-notice is-error" role="alert">{error}</p>}
      {loading ? <p role="status">در حال دریافت تاریخچه…</p> : view && !view.rows.length ? <p className="sa-hint">ارسالی با این وضعیت پیدا نشد.</p> : null}
      {!loading && view?.rows.map((row) => <article className={`fa-item ${styles.delivery}`} key={row.id}>
        <div className={styles.rowHead}><h3>{EVENT[row.event]} · {STATUS[row.status]}</h3><span dir="ltr">{row.host}</span></div>
        <dl className={styles.details}>
          <div><dt>شناسهٔ رویداد</dt><dd><bdi dir="ltr">{row.eventId}</bdi></dd></div>
          <div><dt>زمان ثبت</dt><dd>{date(row.createdAt)}</dd></div>
          <div><dt>تعداد تلاش</dt><dd>{fa(row.attempts)}</dd></div>
          <div><dt>پاسخ HTTP</dt><dd>{row.httpStatus === null ? '—' : fa(row.httpStatus)}</dd></div>
          <div><dt>مدت پاسخ</dt><dd>{row.durationMs === null ? '—' : `${fa(row.durationMs)} میلی‌ثانیه`}</dd></div>
          {row.nextAttemptAt && <div><dt>تلاش بعدی</dt><dd>{date(row.nextAttemptAt)}</dd></div>}
        </dl>
        {row.detail && <p className="sa-hint">{row.detail}</p>}
        {row.replayable && replayId !== row.id && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setReplayId(row.id)}>ارسال دوباره</button>}
        {row.replayable && replayId === row.id && <ReplayForm row={row} busy={busy} cancel={() => setReplayId(null)} submit={(reason) => { void command({ op: 'replay', id: row.id, reason, confirmed: true }) }} />}
      </article>)}
      {!loading && view && (cursors.length > 1 || view.nextBefore !== null) && <nav className={styles.controls} aria-label="صفحه‌های تاریخچه">
        <button type="button" className="btn btn-ghost btn-sm" disabled={cursors.length === 1} onClick={() => { setCursors((value) => value.slice(0, -1)); setReplayId(null) }}>صفحهٔ قبل</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={view.nextBefore === null} onClick={() => { const next = view.nextBefore; if (next !== null) setCursors((value) => [...value, next]); setReplayId(null) }}>صفحهٔ بعد</button>
      </nav>}
    </section>
  </div>
}
