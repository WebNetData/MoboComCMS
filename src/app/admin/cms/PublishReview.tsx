'use client'

import { useEffect, useRef } from 'react'

export type ReviewRow = { key: string; label: string; value: string; state: 'ok' | 'empty' | 'ai' | 'missing'; href?: string }

/** Plain-text preview of a form value for the review list. */
export function previewValue(value: unknown, options?: { value: string; label: string }[]): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'بله' : ''
  if (Array.isArray(value)) {
    if (!value.length) return ''
    if (typeof value[0] === 'object') return `${value.length.toLocaleString('fa-IR')} مورد`
    return value.map((item) => options?.find((o) => o.value === String(item))?.label || String(item)).join('، ')
  }
  if (typeof value === 'object') {
    const ids = (value as { ids?: unknown[] }).ids
    return Array.isArray(ids) ? (ids.length ? `${ids.length.toLocaleString('fa-IR')} دسته` : '') : ''
  }
  const text = String(value)
  const label = options?.find((o) => o.value === text)?.label
  const plain = (label || text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain.length > 180 ? `${plain.slice(0, 180)}…` : plain
}

/**
 * Final review before publishing: every field with its value, AI-filled ones
 * marked, required gaps flagged. Publishing happens only on «تأیید و انتشار».
 */
export default function PublishReview({ open, title, rows, onCancel, onConfirm, busy, scheduled = false }: { open: boolean; title: string; rows: ReviewRow[]; onCancel: () => void; onConfirm: () => void; busy?: boolean; scheduled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])
  const missing = rows.filter((row) => row.state === 'missing')
  const ai = rows.filter((row) => row.state === 'ai')
  const empty = rows.filter((row) => row.state === 'empty')
  return <dialog ref={dialog} className="pr-dialog" dir="rtl" aria-labelledby="pr-title" onCancel={(e) => { e.preventDefault(); onCancel() }}>
    <header className="pr-head">
      <div><span className="pr-kicker">{scheduled ? 'بازبینی نهایی پیش از زمان‌بندی' : 'بازبینی نهایی پیش از انتشار'}</span><h2 id="pr-title">{title || 'بدون عنوان'}</h2></div>
      <button type="button" className="pr-x" onClick={onCancel} aria-label="بستن و ادامهٔ ویرایش">✕</button>
    </header>
    <div className="pr-summary">
      <span className="is-ok">{rows.filter((row) => row.state === 'ok' || row.state === 'ai').length.toLocaleString('fa-IR')} فیلد تکمیل</span>
      {ai.length > 0 && <span className="is-ai">{ai.length.toLocaleString('fa-IR')} پیشنهاد هوش مصنوعی</span>}
      {empty.length > 0 && <span className="is-empty">{empty.length.toLocaleString('fa-IR')} خالی</span>}
      {missing.length > 0 && <span className="is-missing">{missing.length.toLocaleString('fa-IR')} فیلد ضروری خالی</span>}
    </div>
    {missing.length > 0 && <p className="pr-alert" role="alert">پیش از انتشار این فیلدها را پر کنید: {missing.map((row) => row.label).join('، ')}</p>}
    {ai.length > 0 && <p className="pr-note">فیلدهای «پیشنهاد AI» را یک بار دیگر بخوانید؛ هوش مصنوعی ممکن است اشتباه کند.</p>}
    <dl className="pr-list">{rows.map((row) => <div key={row.key} className={`pr-row is-${row.state}`}>
      <dt>{row.label}{row.state === 'ai' && <em>پیشنهاد AI</em>}</dt>
      <dd dir="auto">{row.state === 'missing' && row.href ? <a href={row.href} onClick={onCancel}>{row.value || 'ضروری — تکمیل لازم است'} ↗</a> : row.value || (row.state === 'missing' ? 'ضروری — خالی' : '—')}</dd>
    </div>)}</dl>
    <footer className="pr-foot">
      <button type="button" className="btn btn-ghost" onClick={onCancel}>بازگشت و ویرایش</button>
      <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0} onClick={onConfirm}>{busy ? scheduled ? 'در حال زمان‌بندی…' : 'در حال انتشار…' : scheduled ? 'تأیید و زمان‌بندی' : 'تأیید و انتشار'}</button>
    </footer>
  </dialog>
}
