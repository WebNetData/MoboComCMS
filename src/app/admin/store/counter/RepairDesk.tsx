'use client'

import { formatMoney, toMinor } from '@/shared/money'
import type { CounterWorkLine } from '@/modules/store/domain/counter-sales'
/** What the counter reads about the repair (`?repair=<id>`, Forms decides who may invoice it). */
export type RepairInfo = { id: number; formId: number; title: string; stage: string; customerName: string; phone: string; device: string; invoice: { orderId: number; number: string; status: string } | null }

/** One row of a repair invoice typed at the counter: work done, or a part that is not kept in stock. */
export type WorkRow = { key: string; part: boolean; name: string; quantity: number; price: string }
export const newWorkRow = (part: boolean): WorkRow => ({ key: crypto.randomUUID(), part, name: '', quantity: 1, price: '' })
const digits = (value: string) => value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[^\d]/g, '').slice(0, 13)
const unitOf = (row: WorkRow, currency: string) => { try { return row.price ? toMinor(row.price, currency as Parameters<typeof toMinor>[1]) : null } catch { return null } }

/** The rows the sale sends: complete ones only; an empty row is not an error while it is being typed. */
export function workLines(rows: WorkRow[], currency: string): CounterWorkLine[] {
  return rows.flatMap((row) => { const unit = unitOf(row, currency); return row.name.trim().length >= 2 && unit !== null ? [{ name: row.name.trim(), part: row.part, quantity: row.quantity, unitMinor: unit.toString() }] : [] })
}
export const workTotal = (rows: WorkRow[], currency: string) => workLines(rows, currency).reduce((sum, line) => sum + BigInt(line.unitMinor) * BigInt(line.quantity), 0n)
export const workIncomplete = (rows: WorkRow[], currency: string) => rows.some((row) => (row.name.trim() || row.price) && (row.name.trim().length < 2 || unitOf(row, currency) === null))

/**
 * The repair this sale invoices (forms answer): who and which device, then the work done and the parts bought in, each
 * with its price. Parts from the shop's stock are added with the barcode or the picker like any sale line.
 */
export default function RepairDesk({ repair, rows, onRows, currency, stockLines }: { repair: RepairInfo; rows: WorkRow[]; onRows: (rows: WorkRow[]) => void; currency: string; stockLines: number }) {
  const set = (key: string, patch: Partial<WorkRow>) => onRows(rows.map((row) => row.key === key ? { ...row, ...patch } : row))
  const full = rows.length + stockLines >= 30
  return <section className="cd-repair" aria-labelledby="cd-repair-title">
    <header className="cd-repair-head">
      <div><h2 id="cd-repair-title">فاکتور تعمیر شمارهٔ <bdi className="cd-num">{repair.id.toLocaleString('fa-IR', { useGrouping: false })}</bdi></h2>
        <p>{[repair.device, repair.customerName, repair.stage].filter(Boolean).join(' · ') || repair.title}</p></div>
      {repair.invoice && <span className="sa-state is-warn">فاکتور قبلی {repair.invoice.number}: پرداخت‌نشده</span>}
    </header>
    <p className="sa-hint">کارهای انجام‌شده و قطعه‌هایی را که از بیرون تهیه شده‌اند با مبلغشان بنویسید. قطعه‌ای را که در انبار فروشگاه دارید با بارکد یا «انتخاب دستی کالا» اضافه کنید تا از موجودی کم شود.</p>
    {rows.length > 0 && <ol className="cd-work">{rows.map((row, index) => {
      const unit = unitOf(row, currency)
      return <li key={row.key} className="cd-work-row">
        <label className="cd-field cd-work-type"><span>نوع</span><select className="input" value={row.part ? 'part' : 'work'} onChange={(event) => set(row.key, { part: event.target.value === 'part' })}><option value="work">اجرت و کار</option><option value="part">قطعه (خارج از انبار)</option></select></label>
        <label className="cd-field cd-work-name"><span>شرح</span><input className="input" maxLength={120} value={row.name} placeholder={row.part ? 'مثلاً باتری لپ‌تاپ ASUS A31N1519' : 'مثلاً تعویض باتری و سرویس فن'} onChange={(event) => set(row.key, { name: event.target.value })} /></label>
        <label className="cd-field cd-work-q"><span>تعداد</span><input className="input cd-num" type="number" inputMode="numeric" min={1} max={99} value={row.quantity} onChange={(event) => set(row.key, { quantity: Math.max(1, Math.min(99, Math.floor(Number(event.target.value) || 1))) })} /></label>
        <label className="cd-field cd-work-price"><span>مبلغ واحد</span><input className="input cd-num" inputMode="numeric" dir="ltr" autoComplete="off" value={row.price} placeholder="0" onChange={(event) => set(row.key, { price: digits(event.target.value) })} /></label>
        <b className="cd-line-total cd-num">{unit !== null && currency ? formatMoney(unit * BigInt(row.quantity), currency, 'fa-IR') : '—'}</b>
        <button type="button" className="cd-remove" aria-label={`حذف ردیف ${row.name || (index + 1).toLocaleString('fa-IR')}`} onClick={() => onRows(rows.filter((item) => item.key !== row.key))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </li>
    })}</ol>}
    <div className="sa-row-actions">
      <button type="button" className="btn btn-ghost btn-sm" disabled={full} onClick={() => onRows([...rows, newWorkRow(false)])}>افزودن اجرت یا کار</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={full} onClick={() => onRows([...rows, newWorkRow(true)])}>افزودن قطعهٔ خارج از انبار</button>
    </div>
    {!currency && <p className="sa-hint" role="status">برای نوشتن مبلغ‌ها، ابتدا صندوق باز خود را انتخاب کنید.</p>}
  </section>
}
