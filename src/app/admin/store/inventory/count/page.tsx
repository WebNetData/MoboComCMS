'use client'
import { useState } from 'react'
import { StoreShell, Notice, send, useJson, faDate } from '../../shared'
import { StockNav, ItemPicker, useLocations, type PickedItem } from '../StockKit'
import '../../desk.css'

type CountRow = { id: number; location: string; status: string; lines: number; note: string; createdAt: string; postedAt: string | null; locationId: number }
type CountDetail = { id: number; status: string; note: string; createdAt: string; postedAt: string | null; location: { id: number; name: string }; lines: { id: number; productId: number; variantId: number | null; name: string; counted: number; current: number; expected: number | null; delta: number | null }[]; missing: { itemKey: string; name: string; quantity: number }[] }
const fa = (value: number) => value.toLocaleString('fa-IR')
const STATUS: Record<string, string> = { OPEN: 'در حال شمارش', POSTED: 'ثبت‌شده', CANCELLED: 'لغوشده' }
const tone = (delta: number) => delta < 0 ? 'is-short' : delta > 0 ? 'is-over' : 'is-even'

function Session({ id, onChange }: { id: number; onChange: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const { data, error } = useJson<{ count: CountDetail }>(`/api/admin/store/stock?count=${id}&r=${attempt}`)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null), [last, setLast] = useState('')
  const [drafts, setDrafts] = useState<Record<number, number>>({})
  const reload = () => setAttempt((value) => value + 1)
  async function op(body: Record<string, unknown>, done?: string) {
    setBusy(true); setMessage(null)
    const response = await send('/api/admin/store/stock', 'POST', { countId: id, ...body })
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return false }
    if (done) setMessage({ tone: 'ok', text: done })
    reload(); return true
  }
  async function scanned(item: PickedItem) { if (await op({ op: 'count.line', productId: item.productId, variantId: item.variantId })) setLast(item.name) }
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <p className="sa-hint" role="status">در حال دریافت شمارش…</p>
  const count = data.count, open = count.status === 'OPEN'
  const units = count.lines.reduce((sum, line) => sum + line.counted, 0)
  const variance = count.lines.filter((line) => (open ? line.counted - line.current : line.delta || 0) !== 0).length
  return <section className="sa-card st-form" aria-label={`شمارش ${count.location.name}`}>
    <header className="sa-card-head"><h2>انبارگردانی {count.location.name}</h2><span className={`cd-status${open ? ' is-warn' : count.status === 'POSTED' ? ' is-ok' : ''}`}>{STATUS[count.status]}</span></header>
    <p className="cd-meta">آغاز {faDate(count.createdAt, true)}{count.postedAt && <> · ثبت {faDate(count.postedAt, true)}</>} · {fa(count.lines.length)} قلم، {fa(units)} عدد شمرده‌شده · {fa(variance)} قلم با اختلاف</p>
    {open && <div className="st-scanmode"><ItemPicker label="کالای شمرده‌شده" onPick={(item) => void scanned(item)} disabled={busy} />{last && <div className="st-last" role="status"><span>+۱ {last}</span></div>}<p className="sa-hint">هر اسکن یک عدد به همان کالا اضافه می‌کند؛ عدد را در جدول هم می‌توانید مستقیم بنویسید.</p></div>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {count.lines.length > 0 && <div className="sa-table-wrap" tabIndex={0} role="region" aria-label="اقلام شمارش"><table className="st-lines">
      <thead><tr><th>کالا</th><th className="is-num">شمرده‌شده</th><th className="is-num">{open ? 'موجودی ثبت‌شده' : 'پیش از ثبت'}</th><th className="is-num">اختلاف</th>{open && <th><span className="cd-sr">حذف</span></th>}</tr></thead>
      <tbody>{count.lines.map((line) => { const delta = open ? line.counted - line.current : line.delta || 0; return <tr key={line.id}>
        <td>{line.name}</td>
        <td className="is-num">{open ? <input className="input cd-num" type="number" min={0} aria-label={`شمارش ${line.name}`} value={drafts[line.id] ?? line.counted} onChange={(event) => setDrafts({ ...drafts, [line.id]: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} onBlur={() => { const next = drafts[line.id]; if (next !== undefined && next !== line.counted) void op({ op: 'count.line', productId: line.productId, variantId: line.variantId, counted: next }); setDrafts(({ [line.id]: _, ...rest }) => rest) }} /> : fa(line.counted)}</td>
        <td className="is-num">{fa(open ? line.current : line.expected ?? 0)}</td>
        <td className={`is-num st-variance ${tone(delta)}`}><bdi dir="ltr">{delta > 0 ? '+' : ''}{fa(delta)}</bdi></td>
        {open && <td><button type="button" className="cd-remove" aria-label={`حذف ${line.name}`} onClick={() => void op({ op: 'count.remove', lineId: line.id })}>×</button></td>}
      </tr> })}</tbody>
    </table></div>}
    {open && count.missing.length > 0 && <details className="cd-history"><summary>{fa(count.missing.length)} قلم با موجودی هنوز شمرده نشده است</summary><ul>{count.missing.map((row) => <li key={row.itemKey}><span>{row.name}</span><span className="cd-meta">{fa(row.quantity)} عدد ثبت‌شده</span></li>)}</ul></details>}
    {open && <div className="st-form-actions">
      <button type="button" className="btn btn-primary" disabled={busy || !count.lines.length} onClick={() => { if (window.confirm('موجودی کالاهای شمرده‌شده برابر شمارش شود؟')) void op({ op: 'count.post' }, 'شمارش ثبت شد').then((ok) => ok && onChange()) }}>ثبت شمارش اقلام شمرده‌شده</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm('شمارش کامل: کالاهای شمرده‌نشدهٔ این محل صفر شوند؟')) void op({ op: 'count.post', full: true }, 'شمارش کامل ثبت شد').then((ok) => ok && onChange()) }}>ثبت شمارش کامل</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm('این شمارش لغو شود؟')) void op({ op: 'count.cancel' }).then((ok) => ok && onChange()) }}>لغو شمارش</button>
    </div>}
  </section>
}

export default function StockCount() {
  const { locations, error } = useLocations()
  const [attempt, setAttempt] = useState(0), [locationId, setLocationId] = useState(0), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const counts = useJson<{ counts: CountRow[] }>(`/api/admin/store/stock?counts=1&r=${attempt}`)
  const [showing, setShowing] = useState(0)
  const active = (locations || []).filter((row) => row.active), target = locationId || active[0]?.id || 0
  const openCounts = counts.data?.counts.filter((row) => row.status === 'OPEN') || []
  async function start() {
    setBusy(true); setMessage('')
    const response = await send<{ count: { id: number } }>('/api/admin/store/stock', 'POST', { op: 'count.start', locationId: target, note })
    setBusy(false)
    if (!response.ok) { setMessage(response.error); return }
    setNote(''); setShowing(response.data.count.id); setAttempt((value) => value + 1)
  }
  const current = showing || openCounts[0]?.id || 0
  return <StoreShell title="انبارگردانی">
    <StockNav />
    {error && <Notice tone="error">{error}</Notice>}
    <section className="sa-card st-form" aria-labelledby="st-count-start"><h2 id="st-count-start" className="sa-sub-title">شمارش تازه</h2>
      <fieldset disabled={busy}>
        <label className="cd-field"><span>محل</span><select className="input" value={target} onChange={(event) => setLocationId(Number(event.target.value))}>{active.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="cd-field"><span>توضیح، اختیاری</span><input className="input" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button type="button" className="btn btn-primary" disabled={!target} onClick={() => void start()}>{busy ? 'در حال آغاز…' : 'آغاز شمارش'}</button>
      </fieldset>
      <p className="sa-hint">کالاهای قابل فروش روی قفسه را بشمارید، نه کالاهایی که برای سفارش‌ها کنار گذاشته شده‌اند. هر محل در یک زمان یک شمارش باز دارد.</p>
      {message && <Notice tone="error">{message}</Notice>}
    </section>
    {current > 0 && <Session key={current} id={current} onChange={() => setAttempt((value) => value + 1)} />}
    <section className="sa-card" aria-labelledby="st-counts"><header className="sa-card-head"><h2 id="st-counts">شمارش‌ها</h2></header>
      {counts.error && <Notice tone="error">{counts.error}</Notice>}
      <div className="st-docs">{counts.data?.counts.map((row) => <div className="st-doc" key={row.id}><span><b>{row.location}</b> · {STATUS[row.status]}<small>{fa(row.lines)} قلم · آغاز {faDate(row.createdAt, true)}{row.postedAt && <> · ثبت {faDate(row.postedAt, true)}</>}{row.note && <> · {row.note}</>}</small></span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowing(row.id)}>{row.status === 'OPEN' ? 'ادامه' : 'مشاهده'}</button></div>)}</div>
      {counts.data && !counts.data.counts.length && <p className="sa-empty">هنوز شمارشی ثبت نشده است.</p>}
    </section>
  </StoreShell>
}
