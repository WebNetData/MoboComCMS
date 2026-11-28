'use client'

import { useEffect, useRef, useState } from 'react'
import type { RenewalDueFilter, RenewalInvoiceFilter, RenewalReminderDelivery, RenewalReminderPreview, RenewalReminderResult, RenewalReminderRow } from '@/modules/hosting/domain/renewal-reminders'
import { Notice, fa, faDate, send, useJson } from '../../store/shared'

const endpoint = '/api/admin/hosting/services/renewal-reminders'
const dueLabels: Record<RenewalDueFilter, string> = { ALL: 'گذشته یا تا ۳۰ روز آینده', OVERDUE: 'سررسید گذشته', NEXT_7: 'تا ۷ روز آینده', NEXT_30: 'تا ۳۰ روز آینده' }
const invoiceLabels: Record<RenewalInvoiceFilter, string> = { ALL: 'همهٔ وضعیت‌ها', UNPAID: 'پرداخت‌نشده', NONE: 'بدون فاکتور قابل پرداخت', PAID: 'پرداخت‌شده' }
const channelLabels = { sms: 'پیامک', email: 'ایمیل', push: 'پوش' }
const deliveryLabels = { QUEUED: 'در صف', DELIVERED: 'ارسال شد', SKIPPED: 'ارسال نشد', RETRYING: 'تلاش دوباره', FAILED: 'ناموفق' }
const outcomeLabels = { QUEUED: 'به صف رفت', ALREADY_RECORDED: 'قبلاً ثبت شده', SKIPPED: 'رد شد', FAILED: 'ناموفق' }

function DeliveryStatus({ delivery }: { delivery: RenewalReminderDelivery }) {
  return <div className="hx-batch-delivery">
    <span>ثبت در صندوق مشتری · {faDate(delivery.recordedAt, true)}</span>
    <ul>{delivery.channels.map(({ channel, status, reason }) =>
      <li key={channel} data-channel-status={status}>
        <strong>{channelLabels[channel]} · {deliveryLabels[status]}</strong>
        {reason && <span>{reason}</span>}
      </li>
    )}</ul>
  </div>
}

function RecipientTable({ rows, selection, onSelect }: {
  rows: RenewalReminderRow[]
  selection: number[]
  onSelect?: (id: number) => void
}) {
  return <ul className="hx-batch-list" aria-label={onSelect ? 'گیرندگان در این صفحه' : 'گیرندگان انتخاب‌شده'}>
    {rows.map(row => <li className="hx-batch-recipient" key={row.id}>
      <div className="hx-batch-recipient-main">
        {onSelect && <input type="checkbox" checked={selection.includes(row.id)} disabled={!row.eligible}
          aria-label={`انتخاب سرویس ${row.label} برای ${row.recipient}، شماره ${fa(row.id)}`}
          onChange={() => onSelect(row.id)} />}
        <div><strong>{row.label} <span className="hx-spec">#{fa(row.id)}</span></strong><bdi>{row.recipient}</bdi></div>
      </div>
      <div className="hx-batch-invoice">
        <span>سررسید <time dateTime={row.dueAt}>{faDate(row.dueAt)}</time></span>
        <span>{invoiceLabels[row.invoice?.status ?? 'NONE']}{row.invoice && <> · <bdi>{row.invoice.number}</bdi></>}</span>
      </div>
      {row.delivery && <DeliveryStatus delivery={row.delivery} />}
    </li>)}
  </ul>
}

function ReminderPage({ due, invoice, cursor, previous, goBack, goNext, onQueued }: {
  due: RenewalDueFilter
  invoice: RenewalInvoiceFilter
  cursor: number
  previous: boolean
  goBack: () => void
  goNext: (next: number) => void
  onQueued: () => void
}) {
  const query = new URLSearchParams({ due, invoice, cursor: String(cursor) })
  const { data, error, loading, reload } = useJson<RenewalReminderPreview>(`${endpoint}?${query}`)
  const [selection, setSelection] = useState<number[]>([])
  const [review, setReview] = useState<RenewalReminderRow[]>([])
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState('')
  const [results, setResults] = useState<(RenewalReminderResult & { label: string })[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (review.length) heading.current?.focus() }, [review])
  const rows = data?.items ?? []
  const selected = rows.filter(row => row.eligible && selection.includes(row.id))
  const eligible = rows.filter(row => row.eligible)
  const select = (id: number) => setSelection(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  async function confirm() {
    setBusy(true)
    setSendError('')
    const response = await send<{ items: RenewalReminderResult[] }>(endpoint, 'POST', {
      confirmed: true,
      items: review.map(({ id, userId, dueAt, invoice }) => ({ id, userId, dueAt, invoiceNumber: invoice?.number ?? null })),
    })
    setBusy(false)
    if (!response.ok) { setSendError(response.error); return }
    const labels = new Map(review.map(row => [row.id, row.label]))
    setResults(response.data.items.map(item => ({ ...item, label: labels.get(item.id) ?? String(item.id) })))
    setReview([])
    setSelection([])
    void reload()
    onQueued()
  }

  if (review.length) return <div className="hx-batch-review" aria-busy={busy}>
    <h3 ref={heading} tabIndex={-1}>تأیید یادآوری برای {fa(review.length)} سرویس</h3>
    <p className="sa-hint">این یادآوری در صندوق مشتری ثبت می‌شود. ارسال پیامک، ایمیل و پوش به تنظیمات اعلان هر مشتری بستگی دارد.</p>
    <RecipientTable rows={review} selection={[]} />
    {sendError && <Notice tone="error">{sendError}</Notice>}
    <div className="hx-batch-actions">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'در حال ثبت…' : 'تأیید و ثبت در صف ارسال'}</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setReview([]); setSendError('') }}>بازگشت به انتخاب</button>
    </div>
  </div>

  return <div aria-busy={loading} className="hx-batch-results">
    {error && <Notice tone="error">{error}</Notice>}
    {loading && <p role="status" className="sa-hint">در حال دریافت وضعیت یادآوری…</p>}
    {results.length > 0 && <section className="hx-batch-outcomes" aria-label="نتیجهٔ ثبت یادآوری">
      <h3>نتیجهٔ ثبت در صف</h3>
      <p className="sa-hint" role="status">{fa(results.filter(item => item.status === 'QUEUED').length)} یادآوری در صف ثبت شد.</p>
      <ul>{results.map(item => <li key={item.id} data-state={item.status}><strong>{item.label} · {outcomeLabels[item.status]}</strong><span>{item.message}</span></li>)}</ul>
    </section>}
    {!loading && data && !rows.length && <p className="sa-hint">{data.nextCursor ? 'در این صفحه موردی با فیلترها مطابق نیست. صفحهٔ بعد را بررسی کنید.' : 'مورد دیگری با این فیلترها پیدا نشد.'}</p>}
    <div className="hx-batch-actions">
      <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => { setSelection([]); void reload() }}>تازه‌سازی وضعیت ارسال</button>
      {eligible.length > 0 && <button type="button" className="btn btn-ghost" disabled={loading}
        onClick={() => setSelection(selected.length === eligible.length ? [] : eligible.map(row => row.id))}>
        {selected.length === eligible.length ? 'پاک کردن انتخاب‌ها' : 'انتخاب همهٔ موارد مجاز این صفحه'}
      </button>}
    </div>
    {rows.length > 0 && <RecipientTable rows={rows} selection={selection} onSelect={select} />}
    <div className="hx-batch-actions">
      {selected.length > 0 && <button type="button" className="btn btn-primary" disabled={loading}
        onClick={() => { setReview(selected); setResults([]) }}>پیش‌نمایش {fa(selected.length)} گیرنده</button>}
      {previous && <button type="button" className="btn btn-ghost" disabled={loading} onClick={goBack}>صفحهٔ قبل</button>}
      {data?.nextCursor && <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => goNext(data.nextCursor!)}>صفحهٔ بعد</button>}
    </div>
  </div>
}

export default function RenewalReminderBatch({ onQueued }: { onQueued: () => void }) {
  const [open, setOpen] = useState(false)
  const [due, setDue] = useState<RenewalDueFilter>('ALL')
  const [invoice, setInvoice] = useState<RenewalInvoiceFilter>('ALL')
  const [cursors, setCursors] = useState([0])
  const cursor = cursors.at(-1) ?? 0

  return <section className="hx-batch" aria-labelledby="hosting-renewal-batch-title">
    <div className="hx-batch-head">
      <div>
        <h2 id="hosting-renewal-batch-title">یادآوری گروهی تمدید</h2>
        <p className="sa-hint">سرویس‌ها را فیلتر کنید و پیش از ثبت یادآوری، گیرندگان را مرور کنید.</p>
      </div>
      <button type="button" className="btn btn-ghost" aria-expanded={open} aria-controls="hosting-renewal-batch" onClick={() => setOpen(value => !value)}>
        {open ? 'بستن یادآوری گروهی' : 'آماده‌سازی یادآوری'}
      </button>
    </div>
    <div id="hosting-renewal-batch" hidden={!open}>
      {open && <>
        <div className="hx-batch-filters">
          <label className="sa-field"><span>بازهٔ سررسید</span><select className="input" value={due}
            onChange={event => { setDue(event.target.value as RenewalDueFilter); setCursors([0]) }}>
            {Object.entries(dueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="sa-field"><span>وضعیت فاکتور این دوره</span><select className="input" value={invoice}
            onChange={event => { setInvoice(event.target.value as RenewalInvoiceFilter); setCursors([0]) }}>
            {Object.entries(invoiceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        <ReminderPage key={`${due}:${invoice}:${cursor}`} due={due} invoice={invoice} cursor={cursor}
          previous={cursors.length > 1} goBack={() => setCursors(values => values.slice(0, -1))}
          goNext={next => setCursors(values => [...values, next])} onQueued={onQueued} />
      </>}
    </div>
  </section>
}
