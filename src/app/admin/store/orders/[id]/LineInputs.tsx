'use client'

import { useState } from 'react'
import { faDate, send } from '../../shared'

export type LineInput = { key: string; label: string; value: string; secret: boolean }
export type InputLine = { lineId: number; name: string; inputs: LineInput[]; inputsErasedAt: string | null; openAmount: { amount: string; currency: string; rate: string } | null }

/**
 * What the buyer gave for one line of the order. A password arrives masked; "show" asks the server for it
 * (the click is recorded), and "erase" wipes the answers once the work is done.
 */
export default function LineInputs({ orderId, line, canErase = true, onErased }: { orderId: number; line: InputLine; canErase?: boolean; onErased: (detail: unknown) => void }) {
  const [revealed, setRevealed] = useState<LineInput[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState('')
  const rows = revealed || line.inputs
  const hidden = !revealed && line.inputs.some((answer) => answer.secret)

  async function reveal() {
    setBusy(true); setNote('')
    const response = await send<{ inputs: LineInput[] }>(`/api/admin/store/orders/${orderId}`, 'POST', { action: 'reveal-inputs', lineId: line.lineId })
    setBusy(false)
    if (!response.ok) { setNote(response.error); return }
    setRevealed(response.data.inputs)
  }
  async function erase() {
    if (!window.confirm('اطلاعاتی که خریدار برای این ردیف داده پاک شود؟ این کار برگشت ندارد.')) return
    setBusy(true); setNote('')
    const response = await send(`/api/admin/store/orders/${orderId}`, 'POST', { action: 'erase-inputs', lineId: line.lineId })
    setBusy(false)
    if (!response.ok) { setNote(response.error); return }
    setRevealed(null)
    onErased(response.data)
  }
  async function copy(answer: LineInput) {
    try { await navigator.clipboard.writeText(answer.value); setCopied(answer.key); window.setTimeout(() => setCopied(''), 1500) } catch { setNote('کپی انجام نشد') }
  }

  if (!line.openAmount && !line.inputs.length && !line.inputsErasedAt) return null
  return <div className="oi">
    {line.openAmount && <p className="oi-open">مبلغی که باید پرداخت شود: <b className="num" dir="ltr">{line.openAmount.amount} {line.openAmount.currency}</b>{line.openAmount.rate && <small> · نرخ محاسبه: <span className="num">{Math.round(Number(line.openAmount.rate)).toLocaleString('fa-IR')}</span> تومان</small>}</p>}
    {rows.length > 0 && <>
      <dl className="oi-list">{rows.map((answer) => <div key={answer.key}>
        <dt>{answer.label}</dt>
        <dd><span dir="auto" className={answer.secret ? 'is-secret' : ''}>{answer.value}</span>{(!answer.secret || revealed) && <button type="button" className="sa-link" onClick={() => void copy(answer)}>{copied === answer.key ? 'کپی شد' : 'کپی'}</button>}</dd>
      </div>)}</dl>
      <div className="oi-actions">
        {hidden && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reveal()}>نمایش اطلاعات محرمانه</button>}
        {canErase && <button type="button" className="sa-link is-danger" disabled={busy} onClick={() => void erase()}>پاک‌کردن اطلاعات خریدار</button>}
        <small>مشاهدهٔ اطلاعات محرمانه با نام شما ثبت می‌شود. یک هفته پس از پایان سفارش خودکار پاک می‌شود.</small>
      </div>
    </>}
    {!rows.length && line.inputsErasedAt && <p className="oi-erased">اطلاعات خریدار برای این ردیف در {faDate(line.inputsErasedAt)} پاک شده است.</p>}
    {note && <p className="oi-note" role="alert">{note}</p>}
  </div>
}
