'use client'

import { useState } from 'react'
import { Notice, send } from '../../shared'

export type Assignment = { assigneeId: number | null; canWork: boolean; manager: boolean; specialists?: { id: number; name: string; role: string; open: number }[] }
export default function OrderAssignment({ id, work, onChanged }: { id: number; work: Assignment; onChanged: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const assign = async (value?: string) => {
    setBusy(true); setError('')
    const result = await send(`/api/admin/store/orders/${id}`, 'POST', value === undefined ? { action: 'take' } : { action: 'assign', assigneeId: value ? Number(value) : null })
    setBusy(false)
    if (!result.ok) setError(result.error)
    else onChanged()
  }
  return <section className="sa-card sa-noprint" aria-labelledby="order-work-title" aria-busy={busy}>
    <header className="sa-card-head"><h2 id="order-work-title">کارشناس مسئول سفارش</h2><span className="sa-tag">{work.assigneeId ? 'واگذار شده' : 'آمادهٔ واگذاری'}</span></header>
    <p className="sa-hint">هر سفارش یک مسئول دارد. اطلاعات کار پس از برداشتن در اختیار کارشناس است؛ مدیر سفارش‌ها می‌تواند مسئول را تغییر دهد.</p>
    {error && <Notice tone="error">{error}</Notice>}
    {work.manager ? <label className="sa-field"><span>انتخاب کارشناس</span><select aria-label="انتخاب کارشناس" className="input" value={work.assigneeId || ''} disabled={busy} onChange={event => void assign(event.target.value)}><option value="">بدون کارشناس</option>{work.assigneeId && !work.specialists?.some(person => person.id === work.assigneeId) && <option value={work.assigneeId}>کارشناس قبلی (دیگر واجد دسترسی نیست)</option>}{work.specialists?.map(person => <option key={person.id} value={person.id}>{person.name} · {person.role} · {person.open.toLocaleString('fa-IR')} کار باز</option>)}</select></label> : work.assigneeId ? <p className="sa-hint">این سفارش در کارتابل شماست.</p> : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void assign()}>{busy ? 'در حال واگذاری…' : 'برداشتن سفارش'}</button>}
  </section>
}
