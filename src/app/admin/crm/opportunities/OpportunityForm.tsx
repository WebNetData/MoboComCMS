'use client'

import { useEffect, useState, type FormEvent } from 'react'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import type { CrmDeskPage } from '@/modules/livechat/domain/crm-desk'
import { amountInput, CURRENCIES, STAGES, type Detail, type Preview, type Staff } from './types'
import styles from './opportunities.module.css'

type Customer = { id: number; name: string; email: string; phone: string }
type Props = {
  initialUserId?: number; preview?: Preview | null; detail?: Detail
  staff: Staff[]; canManage: boolean; ownId: number
  busy: boolean; cancel: () => void; save: (body: Record<string, unknown>) => Promise<void>
}

function CustomerPicker({ selected, onSelect }: { selected: Customer | null; onSelect: (customer: Customer | null) => void }) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [result, setResult] = useState<{ rows: Customer[]; error?: string } | null>(null)
  useEffect(() => {
    if (!term) return
    const controller = new AbortController()
    async function search() {
      try {
        const response = await fetch(`/api/admin/crm?q=${encodeURIComponent(term)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('جست‌وجوی مشتری ممکن نشد.')
        const body: CrmDeskPage = await response.json()
        if (!controller.signal.aborted) setResult({ rows: body.rows })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ rows: [], error: error instanceof Error ? error.message : 'جست‌وجوی مشتری ممکن نشد.' })
      }
    }
    void search()
    return () => controller.abort()
  }, [term])
  if (selected) return <div><span>مشتری انتخاب‌شده </span><strong>{selected.name || selected.email || `مشتری ${selected.id}`}</strong>{' '}
    <button className="btn btn-ghost btn-sm" type="button" onClick={() => onSelect(null)}>تغییر مشتری</button></div>
  return <div className={styles.form}>
    <label className={styles.field}>جست‌وجوی مشتری<input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="نام، موبایل، ایمیل یا شناسه" maxLength={120} /></label>
    <div><button className="btn btn-ghost btn-sm" type="button" disabled={!query.trim()} onClick={() => { setResult(null); setTerm(query.trim()) }}>جست‌وجو</button></div>
    {term && !result && <p role="status">در حال جست‌وجو…</p>}
    {result?.error && <p role="alert">{result.error}</p>}
    {result && !result.error && !result.rows.length && <p>مشتری‌ای پیدا نشد.</p>}
    {result && <ul className={styles.searchResults}>{result.rows.map(customer => <li key={customer.id}>
      <button className="btn btn-ghost" type="button" onClick={() => onSelect(customer)}>{customer.name || customer.email || `مشتری ${customer.id}`}{customer.phone ? ` · ${customer.phone}` : ''}</button>
    </li>)}</ul>}
  </div>
}

export default function OpportunityForm({ initialUserId, preview, detail, staff, canManage, ownId, busy, cancel, save }: Props) {
  const row = detail?.row
  const lockedId = row?.userId ?? preview?.userId ?? initialUserId
  const [customer, setCustomer] = useState<Customer | null>(lockedId ? { id: lockedId, name: row?.userName || preview?.userName || `مشتری ${lockedId}`, email: '', phone: '' } : null)
  const [stage, setStage] = useState(row?.stage || 'NEW')
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customer) { setError('مشتری را انتخاب کنید.'); return }
    const data = new FormData(event.currentTarget)
    const reason = String(data.get('reason') || '').trim()
    if (stage === 'LOST' && reason.length < 5 && row?.stage !== 'LOST') { setError('دلیل از دست رفتن فرصت را در ۵ تا ۳۰۰ نویسه بنویسید.'); return }
    setError('')
    await save({
      ...(row ? { id: row.id, version: row.version, stage, reason } : { userId: customer.id, ...(preview ? { source: { type: preview.source.type, id: preview.source.id } } : {}) }),
      title: String(data.get('title') || '').trim(),
      amount: String(data.get('amount') || '').trim(),
      currency: String(data.get('currency') || ''),
      targetDay: String(data.get('targetDay') || '') || null,
      ...(data.get('assigneeId') ? { assigneeId: Number(data.get('assigneeId')) } : {}),
    })
  }
  return <form className={styles.form} onSubmit={event => void submit(event)}>
    {!row && (lockedId ? <p>مشتری <strong>{customer?.name}</strong></p> : <CustomerPicker selected={customer} onSelect={setCustomer} />)}
    {preview && <p className={styles.muted}>منبع <a className="sa-link" href={preview.source.href}>{preview.source.type === 'FORM' ? 'پاسخ فرم' : 'تیکت'} شمارهٔ {preview.source.id.toLocaleString('fa-IR')}</a></p>}
    <div className={styles.fields}>
      <label className={styles.field}>عنوان فرصت<input className="input" name="title" required maxLength={160} defaultValue={row?.title} /></label>
      <label className={styles.field}>مبلغ برآوردی<input className="input" name="amount" inputMode="decimal" required defaultValue={row ? amountInput(row.amountMinor, row.currency) : ''} /></label>
      <label className={styles.field}>ارز<select className="input" name="currency" defaultValue={row?.currency || 'IRT'}>{Object.entries(CURRENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className={styles.field}><span>تاریخ هدف</span><JalaliDateInput name="targetDay" aria-label="تاریخ هدف" defaultValue={row?.targetDay || ''} /></div>
      {canManage && <label className={styles.field}>مسئول<select className="input" name="assigneeId" defaultValue={row ? row.assigneeId ?? '' : ownId}>
        {row && !row.assigneeId && <option value="">بدون مسئول</option>}
        {row?.assigneeId && !staff.some(person => person.id === row.assigneeId) && <option value={row.assigneeId} disabled>{row.assigneeName}</option>}
        {staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>}
      {row && <label className={styles.field}>مرحله<select className="input" name="stage" value={stage} onChange={event => setStage(event.target.value as typeof stage)}>{Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {row && stage === 'LOST' && row.stage !== 'LOST' && <label className={styles.field}>دلیل از دست رفتن<textarea className="input" name="reason" rows={2} required minLength={5} maxLength={300} /></label>}
    </div>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <div className={styles.actions}><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : row ? 'ذخیرهٔ تغییرات' : 'ثبت فرصت'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={cancel}>انصراف</button></div>
  </form>
}
