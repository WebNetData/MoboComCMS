'use client'

import { useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { EXPERT_WORK_LIMITS, EXPERT_WORK_POLICY_FIELDS, type ExpertWorkQueue as Queue, type ExpertWorkSource } from '@/modules/support/domain/expert-work-sla'
import s from './ExpertWorkQueue.module.css'

const fields = { claimMinutes: 'برداشتن سفارش', replyMinutes: 'پاسخ به مشتری', deliveryMinutes: 'تحویل سفارش' }
const deadlines = { claim: 'بدون مسئول', reply: 'پاسخ عقب‌افتاده', delivery: 'تحویل عقب‌افتاده' }
const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })

async function fetchQueue(url: string, input?: Record<string, unknown>): Promise<Queue> {
  const response = await fetch(url, input ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  } : { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'دریافت اطلاعات ناموفق بود')
  return result
}

export default function ExpertWorkQueue({ source }: { source: ExpertWorkSource }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Queue>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = '/api/admin/expert-work-sla?source=' + source

  async function load(after?: number) {
    setBusy(true); setError('')
    try { setData(await fetchQueue(endpoint + (after ? '&after=' + after : ''))) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'دریافت صف انجام نشد') }
    finally { setBusy(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const values = new FormData(event.currentTarget)
    const policy = Object.fromEntries(EXPERT_WORK_POLICY_FIELDS.map(field => [field, Number(values.get(field))]))
    setBusy(true); setError('')
    try { setData(await fetchQueue(endpoint, { ...policy, revision: data.revision })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ذخیرهٔ مهلت‌ها انجام نشد') }
    finally { setBusy(false) }
  }

  return <section className={s.queue} aria-label="صف سرپرست سفارش‌ها">
    <button className="btn btn-ghost" type="button" aria-expanded={open} aria-controls={'expert-queue-' + source} onClick={() => {
      setOpen(!open)
      if (!open && !data && !busy) void load()
    }}>صف سرپرست و مهلت رسیدگی</button>
    <div id={'expert-queue-' + source} hidden={!open} aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      {busy && !data && <p role="status">در حال دریافت صف…</p>}
      {data && <>
        <form key={data.revision} className={s.form} onSubmit={save}>
          {EXPERT_WORK_POLICY_FIELDS.map(field => <label key={field}>
            <span>{fields[field]} (دقیقه)</span>
            <input className="input" name={field} type="number" min={EXPERT_WORK_LIMITS.min} max={EXPERT_WORK_LIMITS.max} defaultValue={data.policy[field]} required />
          </label>)}
          <button className="btn btn-primary" type="submit" disabled={busy}>ذخیرهٔ مهلت‌ها</button>
        </form>
        <p>مهلت تحویل هنگام انتظار برای اقدام مشتری متوقف می‌شود.</p>
        {data.items.length ? <ul className={s.items}>{data.items.map(item => <li key={item.id}>
          <Link href={item.href}>{item.title} · {item.id.toLocaleString('fa-IR')}</Link>
          <span>{item.assignee || 'بدون مسئول'}</span>
          <ul>{item.deadlines.map(deadline => <li key={deadline.kind}>{deadlines[deadline.kind]} · {date.format(new Date(deadline.dueAt))}</li>)}</ul>
        </li>)}</ul> : <p role="status">سفارش عقب‌افتاده‌ای در این صفحه نیست.</p>}
        <div className={s.actions}><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void load()}>تازه‌سازی صف</button>
          {data.nextAfter && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void load(data.nextAfter!)}>صفحهٔ بعد</button>}
        </div>
      </>}
      {!data && error && <button className="btn btn-ghost" type="button" onClick={() => void load()}>تلاش دوباره</button>}
    </div>
  </section>
}
