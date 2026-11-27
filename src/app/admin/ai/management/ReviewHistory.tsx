'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import type { ManagementFinding, ReviewCadence, ReviewDecision, ReviewHistory } from '@/modules/ai/domain/management'
import ReviewedAction from './ReviewedAction'
import { actionSignals } from '@/modules/ai/domain/management'
import s from './page.module.css'

const endpoint = '/api/admin/ai/management/reviews'
const cadenceLabels = { OFF: 'خاموش', DAILY: 'روزانه', WEEKLY: 'هفتگی' }
const statusLabels = { PENDING: 'در انتظار تصمیم', APPROVED: 'در حال پیگیری', DISMISSED: 'رد شده', DONE: 'انجام شد' }
const format = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const date = (value: string) => format.format(new Date(value))
const count = new Intl.NumberFormat('fa-IR')
type Command = Record<string, string | number>

async function load(options?: RequestInit): Promise<ReviewHistory> {
  const response = await fetch(endpoint, { cache: 'no-store', ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'تاریخچه دریافت نشد')
  }
  return response.json()
}

export default function ManagementReviewHistory() {
  const [history, setHistory] = useState<ReviewHistory>()
  const [cadence, setCadence] = useState<ReviewCadence>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    load({ signal: controller.signal }).then(setHistory).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message)
    })
    return () => controller.abort()
  }, [reload])

  async function command(body: Command, confirmation: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await load({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setHistory(result)
      setCadence(undefined)
      setNotice(confirmation)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تغییر ثبت نشد')
    } finally {
      setBusy(false)
    }
  }

  const selectedCadence = cadence ?? history?.cadence ?? 'OFF'
  return <section className={s.panel} aria-labelledby="review-history">
    <div className={s.panelHeader}>
      <h2 id="review-history">بررسی دوره‌ای و پیگیری</h2>
      <button type="button" className="btn btn-ghost" disabled={busy || !history}
        onClick={() => void command({ action: 'snapshot' }, 'بررسی در تاریخچه ثبت شد')}>بررسی و ثبت اکنون</button>
    </div>
    {error && <div className={s.reviewError}>
      <p className={s.notice} role="alert">{error}</p>
      <button type="button" className="btn btn-ghost" onClick={() => { setError(''); setCadence(undefined); setReload(value => value + 1) }}>بارگیری دوباره</button>
    </div>}
    {notice && <p className={s.status} role="status">{notice}</p>}
    {!history && !error && <p className={s.empty} role="status">در حال دریافت تاریخچه…</p>}
    {history && <>
      <form className={s.reviewSchedule} onSubmit={event => {
        event.preventDefault()
        if (!busy) void command({ action: 'schedule', cadence: selectedCadence, version: history.scheduleVersion }, 'زمان‌بندی ذخیره شد')
      }}>
        <label htmlFor="review-cadence">بازهٔ بررسی</label>
        <select id="review-cadence" value={selectedCadence} onChange={event => setCadence(event.target.value as ReviewCadence)}>
          {Object.entries(cadenceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="submit" className="btn btn-ghost" disabled={busy || selectedCadence === history.cadence}>ذخیرهٔ زمان‌بندی</button>
        {history.nextRunAt && <time dateTime={history.nextRunAt}>بررسی بعدی {date(history.nextRunAt)}</time>}
      </form>
      {!history.reviews.length && <p className={s.empty}>در محدودهٔ دسترسی فعلی، هنوز بررسی ثبت‌شده‌ای ندارید.</p>}
      {history.reviews.map((row, index) => <details key={row.id} open={index === 0 ? true : undefined} className={s.review}>
        <summary><time dateTime={row.checkedAt}>{date(row.checkedAt)}</time><span>{count.format(row.findings.length)} مورد</span></summary>
        {row.unavailable.length > 0 && <p className={s.empty}>دادهٔ این بخش‌ها در دسترس نبوده است. {row.unavailable.join('، ')}</p>}
        {!row.findings.length && <p className={s.empty}>این بررسی موردی برای پیگیری ثبت نکرد.</p>}
        <ul className={s.historyList}>
          {row.findings.map(item => <li key={item.id}>
            <Finding item={item} busy={busy} onDecide={(decision, outcome) => command({
              action: 'decide', id: row.id, version: row.version, signalId: item.id, decision, outcome,
            }, 'نتیجهٔ پیگیری ثبت شد')} review={{ id: row.id, version: row.version }} onActionSaved={(result, message) => { setHistory(result); setNotice(message); setError('') }} />
          </li>)}
        </ul>
      </details>)}
    </>}
  </section>
}

function Finding({ item, busy, onDecide, review, onActionSaved }: { item: ManagementFinding; busy: boolean; onDecide: (status: ReviewDecision, outcome: string) => Promise<void>; review: { id: number; version: number }; onActionSaved: (history: ReviewHistory, message: string) => void }) {
  const [outcome, setOutcome] = useState('')
  const active = item.status === 'PENDING' || item.status === 'APPROVED'
  const actionSignal = actionSignals.find(signal => signal === item.id)
  return <div className={s.historyFinding}>
    <div className={s.panelHeader}>
      <h3>{item.sectionLabel} · {item.label}</h3>
      <span>{statusLabels[item.status]}</span>
    </div>
    <p>{count.format(item.count)} مورد هنگام بررسی. {item.recommendation}</p>
    {item.outcome && <p>{item.outcome}</p>}
    {item.status === 'APPROVED' && <Link href={item.href}>باز کردن پنل {item.sectionLabel}</Link>}
    {actionSignal && (item.status === 'APPROVED' || (item.status === 'DONE' && item.action?.result)) &&
      <ReviewedAction signalId={actionSignal} review={review} busy={busy} saved={item.action} onSaved={onActionSaved} />}
    {active && <div className={s.followUpControls}>
      <label>دلیل رد یا نتیجهٔ انجام
        <input value={outcome} maxLength={450} onChange={event => setOutcome(event.target.value)} />
      </label>
      <div className={s.panelHeader}>
        {item.status === 'PENDING'
          ? <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onDecide('APPROVED', '')}>تأیید برای پیگیری</button>
          : <button type="button" className="btn btn-primary" disabled={busy || !outcome.trim()} onClick={() => void onDecide('DONE', outcome)}>ثبت انجام</button>}
        <button type="button" className="btn btn-ghost" disabled={busy || !outcome.trim()} onClick={() => void onDecide('DISMISSED', outcome)}>رد پیشنهاد</button>
      </div>
    </div>}
  </div>
}
