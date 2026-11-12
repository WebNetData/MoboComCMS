'use client'
import { useRef, useState } from 'react'
import { StoreShell, Notice, Pager, send, useJson, faDate } from '../../shared'
import { StockNav, ItemPicker, useLocations, uuid, type PickedItem } from '../StockKit'
import { formatMoney } from '@/shared/money'
import '../../desk.css'

type Line = PickedItem & { quantity: number; unitCost: string }
type Receipt = { id: number; number: string; supplier: string; reference: string; location: string; lines: number; units: number; totalCostMinor: string; currency: string; createdAt: string }
type Detail = { id: number; number: string; supplier: string; reference: string; note: string; location: string; actor: string; currency: string; totalCostMinor: string; createdAt: string; lines: { id: number; name: string; quantity: number; unitCostMinor: string | null }[] }
const fa = (value: number) => value.toLocaleString('fa-IR')

function ReceiptView({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error } = useJson<{ receipt: Detail }>(`/api/admin/store/stock?receipt=${id}`)
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <p className="sa-hint" role="status">در حال دریافت رسید…</p>
  const r = data.receipt, money = (minor: string | null) => minor === null ? '—' : formatMoney(BigInt(minor), r.currency, 'fa-IR')
  return <section className="sa-card st-form" aria-label={`رسید ${r.number}`}>
    <header className="sa-card-head"><h2>رسید ورود کالا <bdi dir="ltr">{r.number}</bdi></h2><div className="st-form-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>چاپ</button><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div></header>
    <dl className="sa-kv"><div><dt>محل دریافت</dt><dd>{r.location}</dd></div><div><dt>تأمین‌کننده</dt><dd>{r.supplier || '—'}</dd></div><div><dt>شمارهٔ فاکتور خرید</dt><dd>{r.reference || '—'}</dd></div><div><dt>ثبت‌کننده</dt><dd>{r.actor || '—'} · {faDate(r.createdAt, true)}</dd></div></dl>
    <table className="st-lines"><thead><tr><th>کالا</th><th className="is-num">تعداد</th><th className="is-num">بهای واحد</th><th className="is-num">جمع</th></tr></thead><tbody>{r.lines.map((line) => <tr key={line.id}><td>{line.name}</td><td className="is-num">{fa(line.quantity)}</td><td className="is-num">{money(line.unitCostMinor)}</td><td className="is-num">{line.unitCostMinor === null ? '—' : money((BigInt(line.unitCostMinor) * BigInt(line.quantity)).toString())}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>جمع بهای خرید ثبت‌شده</th><th className="is-num">{money(r.totalCostMinor)}</th></tr></tfoot></table>
    {r.lines.some(line => line.unitCostMinor === null) && <p className="sa-hint">بهای بعضی اقلام ثبت نشده است؛ جمع فقط اقلام دارای بهای خرید را دربرمی‌گیرد.</p>}
    {r.note && <p className="sa-hint">{r.note}</p>}
  </section>
}

export default function ReceiveGoods() {
  const { locations, error: locationError } = useLocations()
  const [locationId, setLocationId] = useState(0), [supplier, setSupplier] = useState(''), [reference, setReference] = useState(''), [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([]), [busy, setBusy] = useState(false), [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [showing, setShowing] = useState(0)
  const key = useRef('')
  const list = useJson<{ pages: number; receipts: Receipt[] }>(`/api/admin/store/stock?receipts=1&page=${page}&r=${attempt}`)
  const active = (locations || []).filter((row) => row.active), target = locationId || active.find((row) => row.isDefault)?.id || active[0]?.id || 0
  const changed = () => { key.current = '' }
  function add(item: PickedItem) {
    changed()
    setLines((rows) => { const at = rows.findIndex((row) => row.productId === item.productId && row.variantId === item.variantId); if (at >= 0) return rows.map((row, index) => index === at ? { ...row, quantity: row.quantity + 1 } : row); return [{ ...item, quantity: 1, unitCost: '' }, ...rows] })
  }
  const patch = (index: number, part: Partial<Line>) => { changed(); setLines((rows) => rows.map((row, at) => at === index ? { ...row, ...part } : row)) }
  async function submit() {
    if (!lines.length || !target) return
    setBusy(true); setResult(null); key.current ||= uuid()
    const response = await send<{ id: number; replayed: boolean }>('/api/admin/store/stock', 'POST', { op: 'receipt.create', requestId: key.current, locationId: target, supplier, reference, note, lines: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity, unitCost: line.unitCost })) })
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    key.current = ''; setLines([]); setSupplier(''); setReference(''); setNote(''); setAttempt((value) => value + 1); setShowing(response.data.id)
    setResult({ tone: 'ok', text: 'رسید ثبت شد؛ موجودی و بهای خرید به‌روز شد' })
  }
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  return <StoreShell title="ورود کالا">
    <StockNav />
    {locationError && <Notice tone="error">{locationError}</Notice>}
    <section className="sa-card st-form" aria-labelledby="st-receive"><h2 id="st-receive" className="sa-sub-title">رسید تازه</h2>
      <fieldset disabled={busy}>
        <label className="cd-field"><span>محل دریافت</span><select className="input" value={target} onChange={(event) => { setLocationId(Number(event.target.value)); changed() }}>{active.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="cd-field"><span>تأمین‌کننده</span><input className="input" maxLength={120} value={supplier} onChange={(event) => { setSupplier(event.target.value); changed() }} /></label>
        <label className="cd-field"><span>شمارهٔ فاکتور خرید</span><input className="input" dir="auto" maxLength={80} value={reference} onChange={(event) => { setReference(event.target.value); changed() }} /></label>
        <label className="cd-field"><span>توضیح، اختیاری</span><input className="input" maxLength={500} value={note} onChange={(event) => { setNote(event.target.value); changed() }} /></label>
      </fieldset>
      <ItemPicker onPick={add} disabled={busy} />
      {lines.length > 0 ? <div className="sa-table-wrap" tabIndex={0} role="region" aria-label="اقلام رسید"><table className="st-lines">
        <thead><tr><th>کالا</th><th className="is-num">تعداد</th><th>بهای خرید هر عدد (اختیاری)</th><th><span className="cd-sr">حذف</span></th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={`${line.productId}:${line.variantId}`}>
          <td>{line.name}</td>
          <td className="is-num"><input className="input cd-num" type="number" min={1} max={1000000} aria-label={`تعداد ${line.name}`} value={line.quantity} onChange={(event) => patch(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /></td>
          <td><input className="input cd-num" dir="ltr" inputMode="decimal" placeholder={line.currency} aria-label={`بهای خرید ${line.name}`} value={line.unitCost} onChange={(event) => patch(index, { unitCost: event.target.value })} /></td>
          <td><button type="button" className="cd-remove" aria-label={`حذف ${line.name}`} onClick={() => { changed(); setLines((rows) => rows.filter((_, at) => at !== index)) }}>×</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="sa-hint">کالاها را با بارکدخوان بخوانید؛ هر اسکن یک عدد اضافه می‌کند.</p>}
      <p className="sa-hint">بهای خرید، بهای میانگین کالا را به‌روز می‌کند تا سود در گزارش یکپارچه دقیق باشد.</p>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <div className="st-form-actions"><button type="button" className="btn btn-primary" disabled={busy || !lines.length || !target} onClick={() => void submit()}>{busy ? 'در حال ثبت…' : lines.length ? `ثبت رسید · ${fa(lines.length)} قلم، ${fa(units)} عدد` : 'ثبت رسید'}</button></div>
    </section>
    {showing > 0 && <ReceiptView key={showing} id={showing} onClose={() => setShowing(0)} />}
    <section className="sa-card" aria-labelledby="st-receipts"><header className="sa-card-head"><h2 id="st-receipts">رسیدهای ثبت‌شده</h2></header>
      {list.error && <Notice tone="error">{list.error}</Notice>}
      <div className="st-docs">{list.data?.receipts.map((row) => <div className="st-doc" key={row.id}><span><b><bdi dir="ltr">{row.number}</bdi></b> · {row.location}{row.supplier && <> · {row.supplier}</>}<small>{fa(row.lines)} قلم، {fa(row.units)} عدد · {formatMoney(BigInt(row.totalCostMinor), row.currency, 'fa-IR')} · {faDate(row.createdAt, true)}</small></span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowing(row.id)}>مشاهده</button></div>)}</div>
      {list.data && !list.data.receipts.length && <p className="sa-empty">هنوز رسید ورود کالا ثبت نشده است.</p>}
      {list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}
    </section>
  </StoreShell>
}
