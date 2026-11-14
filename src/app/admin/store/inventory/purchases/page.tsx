'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from '@/platform/routing/navigation'
import { formatMoney } from '@/shared/money'
import { StoreShell, Notice, Pager, send, useJson, faDate } from '../../shared'
import { ItemPicker, StockNav, useLocations, uuid, type PickedItem } from '../StockKit'
import '../../desk.css'

type DraftLine = PickedItem & { quantity: number; unitCost: string }
type PurchaseLine = { id: number; itemKey: string; productId: number; variantId: number | null; name: string; quantity: number; receivedQuantity: number; outstanding: number; unitCostMinor: string }
type Purchase = { id: number; number: string; supplier: string; locationId: number; location: string; status: string; version: number; currency: string; totalCostMinor: string; expectedAt: string | null; note: string; createdAt: string; lines: PurchaseLine[]; receipts?: { id: number; number: string; createdAt: string }[] }
const fa = (n: number) => n.toLocaleString('fa-IR')
const stateLabel: Record<string, string> = { OPEN: 'باز', PARTIAL: 'دریافت بخشی', RECEIVED: 'تکمیل‌شده', CANCELLED: 'لغوشده' }
const money = (minor: string, currency: string) => formatMoney(BigInt(minor), currency, 'fa-IR')

function PurchaseView({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const { data, error } = useJson<{ purchase: Purchase }>(`/api/admin/store/purchases?purchase=${id}&r=${attempt}`)
  const [quantities, setQuantities] = useState<Record<number, number>>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const requestKey = useRef('')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <p className="sa-hint" role="status">در حال دریافت سفارش خرید…</p>
  const p = data.purchase, open = p.status === 'OPEN' || p.status === 'PARTIAL'
  const receive = async () => {
    const lines = p.lines.map(line => ({ lineId: line.id, quantity: quantities[line.id] || 0 })).filter(line => line.quantity > 0)
    if (!lines.length) return
    setBusy(true); setMessage(null); requestKey.current ||= uuid()
    const response = await send<{ replayed: boolean }>('/api/admin/store/purchases', 'POST', { op: 'receive', purchaseId: p.id, version: p.version, requestId: requestKey.current, lines })
    setBusy(false)
    // Refresh after any failure: an earlier attempt may have been recorded even though its response was lost.
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); setAttempt(value => value + 1); return }
    requestKey.current = ''; setMessage({ tone: 'ok', text: response.data.replayed ? 'این دریافت قبلاً ثبت شده بود.' : 'دریافت ثبت شد و موجودی به‌روز شد.' }); setQuantities({}); setAttempt(value => value + 1); onChanged()
  }
  const cancel = async () => {
    setBusy(true); setMessage(null)
    const response = await send('/api/admin/store/purchases', 'POST', { op: 'cancel', purchaseId: p.id, version: p.version })
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setMessage({ tone: 'ok', text: 'سفارش خرید لغو شد؛ دریافت‌های قبلی حفظ شدند.' }); setAttempt(value => value + 1); onChanged()
  }
  return <section className="sa-card st-form" aria-label={`سفارش خرید ${p.number}`}>
    <header className="sa-card-head"><h2>سفارش خرید <bdi dir="ltr">{p.number}</bdi></h2><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></header>
    <dl className="sa-kv"><div><dt>تأمین‌کننده</dt><dd>{p.supplier || '—'}</dd></div><div><dt>محل دریافت</dt><dd>{p.location}</dd></div><div><dt>وضعیت</dt><dd>{stateLabel[p.status] || p.status}</dd></div><div><dt>موعد مورد انتظار</dt><dd>{p.expectedAt ? faDate(p.expectedAt, true) : '—'}</dd></div><div><dt>جمع سفارش</dt><dd>{money(p.totalCostMinor, p.currency)}</dd></div></dl>
    <div className="sa-table-wrap" tabIndex={0} role="region" aria-label="ردیف‌های سفارش خرید"><table className="st-lines"><thead><tr><th>کالا</th><th className="is-num">سفارش</th><th className="is-num">دریافت‌شده</th><th className="is-num">باقی‌مانده</th><th className="is-num">بهای واحد</th>{open && <th>دریافت اکنون</th>}</tr></thead><tbody>{p.lines.map(line => <tr key={line.id}><td>{line.name}</td><td className="is-num">{fa(line.quantity)}</td><td className="is-num">{fa(line.receivedQuantity)}</td><td className="is-num">{fa(line.outstanding)}</td><td className="is-num">{money(line.unitCostMinor, p.currency)}</td>{open && <td><input className="input cd-num" aria-label={`دریافت ${line.name}`} type="number" min={0} max={line.outstanding} value={quantities[line.id] || ''} disabled={busy} onChange={event => { setQuantities(value => ({ ...value, [line.id]: Math.min(line.outstanding, Math.max(0, Math.floor(Number(event.target.value) || 0))) })) }} /></td>}</tr>)}</tbody></table></div>
    {p.note && <p className="sa-hint">{p.note}</p>}
    {!!p.receipts?.length && <p className="sa-hint">رسیدها: {p.receipts.map(row => <span key={row.id}><bdi dir="ltr">{row.number}</bdi> · </span>)}</p>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {open && <div className="st-form-actions"><button type="button" className="btn btn-primary" disabled={busy || !Object.values(quantities).some(value => value > 0)} onClick={() => void receive()}>{busy ? 'در حال ثبت…' : 'ثبت دریافت انتخاب‌شده'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void cancel()}>لغو سفارش خرید</button></div>}
  </section>
}

function Purchases() {
  const params = useSearchParams(), productParam = params.get('product'), variantParam = params.get('variant')
  const { locations, error: locationError } = useLocations()
  const [locationId, setLocationId] = useState(0), [supplier, setSupplier] = useState(''), [expectedAt, setExpectedAt] = useState(''), [note, setNote] = useState(''), [lines, setLines] = useState<DraftLine[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [showing, setShowing] = useState(0)
  const requestKey = useRef(''), active = (locations || []).filter(row => row.active), target = locationId || active.find(row => row.isDefault)?.id || active[0]?.id || 0
  const list = useJson<{ pages: number; purchases: Purchase[] }>(`/api/admin/store/purchases?page=${page}&r=${attempt}`)
  const seed = useJson<{ item: PickedItem }>(productParam ? `/api/admin/store/purchases?product=${encodeURIComponent(productParam)}&variant=${encodeURIComponent(variantParam || '')}` : null)
  const seeded = useRef('')
  useEffect(() => {
    const item = seed.data?.item
    if (!item) return
    const key = `${item.productId}:${item.variantId || 0}`
    if (seeded.current === key) return
    seeded.current = key
    setLines(rows => { const at = rows.findIndex(row => row.productId === item.productId && row.variantId === item.variantId); return at >= 0 ? rows : [{ ...item, quantity: 1, unitCost: '' }, ...rows] })
  }, [seed.data])
  const changed = () => { requestKey.current = '' }
  function add(item: PickedItem) { changed(); setLines(rows => { const at = rows.findIndex(row => row.productId === item.productId && row.variantId === item.variantId); return at >= 0 ? rows.map((row, i) => i === at ? { ...row, quantity: row.quantity + 1 } : row) : [{ ...item, quantity: 1, unitCost: '' }, ...rows] }) }
  const patch = (index: number, part: Partial<DraftLine>) => { changed(); setLines(rows => rows.map((row, i) => i === index ? { ...row, ...part } : row)) }
  async function submit() {
    if (!lines.length || !target) return
    setBusy(true); setMessage(null); requestKey.current ||= uuid()
    const response = await send<{ number: string }>('/api/admin/store/purchases', 'POST', { op: 'create', requestId: requestKey.current, locationId: target, supplier, expectedAt: expectedAt || null, note, lines: lines.map(({ productId, variantId, quantity, unitCost }) => ({ productId, variantId, quantity, unitCost })) })
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    requestKey.current = ''; setLines([]); setSupplier(''); setExpectedAt(''); setNote(''); setAttempt(value => value + 1); setMessage({ tone: 'ok', text: `سفارش ${response.data.number} ثبت شد.` })
  }
  return <StoreShell title="خرید و تأمین کالا">
    <StockNav />
    {locationError && <Notice tone="error">{locationError}</Notice>}
    {seed.error && <Notice tone="error">{seed.error}</Notice>}
    <section className="sa-card st-form" aria-labelledby="st-purchase-create"><h2 id="st-purchase-create" className="sa-sub-title">سفارش خرید تازه</h2>
      <fieldset disabled={busy}>
        <label className="cd-field"><span>محل دریافت</span><select className="input" value={target} onChange={event => { setLocationId(Number(event.target.value)); changed() }}>{active.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="cd-field"><span>تأمین‌کننده <b aria-hidden="true">*</b></span><input className="input" maxLength={120} required value={supplier} onChange={event => { setSupplier(event.target.value); changed() }} /></label>
        <label className="cd-field"><span>موعد مورد انتظار، اختیاری</span><input className="input" type="date" value={expectedAt} onChange={event => { setExpectedAt(event.target.value); changed() }} /></label>
        <label className="cd-field"><span>توضیح، اختیاری</span><input className="input" maxLength={500} value={note} onChange={event => { setNote(event.target.value); changed() }} /></label>
      </fieldset>
      <ItemPicker onPick={add} disabled={busy} />
      {lines.length ? <div className="sa-table-wrap" tabIndex={0} role="region" aria-label="اقلام سفارش خرید"><table className="st-lines"><thead><tr><th>کالا</th><th>تعداد</th><th>بهای واحد</th><th><span className="cd-sr">حذف</span></th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.productId}:${line.variantId}`}><td>{line.name}</td><td><input className="input cd-num" type="number" min={1} max={1000000} aria-label={`تعداد ${line.name}`} value={line.quantity} disabled={busy} onChange={event => patch(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /></td><td><input className="input cd-num" dir="ltr" inputMode="decimal" placeholder={line.currency} aria-label={`بهای خرید هر عدد ${line.name}`} value={line.unitCost} disabled={busy} onChange={event => patch(index, { unitCost: event.target.value })} /></td><td><button type="button" className="cd-remove" aria-label={`حذف ${line.name}`} disabled={busy} onClick={() => { changed(); setLines(rows => rows.filter((_, i) => i !== index)) }}>×</button></td></tr>)}</tbody></table></div> : <p className="sa-hint">کالاها را با بارکد یا نام پیدا کنید. تعداد و بهای واحد هنگام سفارش ثبت می‌شود و پس از ثبت ثابت می‌ماند.</p>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="st-form-actions"><button type="button" className="btn btn-primary" disabled={busy || !supplier.trim() || !lines.length || !target} onClick={() => void submit()}>{busy ? 'در حال ثبت…' : 'ثبت سفارش خرید'}</button></div>
    </section>
    {showing > 0 && <PurchaseView key={showing} id={showing} onClose={() => setShowing(0)} onChanged={() => setAttempt(value => value + 1)} />}
    <section className="sa-card" aria-labelledby="st-purchases"><header className="sa-card-head"><h2 id="st-purchases">سفارش‌های خرید</h2></header>
      {list.error && <Notice tone="error">{list.error}</Notice>}
      <div className="st-docs">{list.data?.purchases.map(row => <div className="st-doc" key={row.id}><span><b><bdi dir="ltr">{row.number}</bdi></b> · {row.supplier || 'بدون نام تأمین‌کننده'} · {stateLabel[row.status] || row.status}<small>{fa(row.lines.length)} قلم · {money(row.totalCostMinor, row.currency)} · {faDate(row.createdAt, true)}</small></span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowing(row.id)}>مشاهده و دریافت</button></div>)}</div>
      {list.data && !list.data.purchases.length && <p className="sa-empty">هنوز سفارش خرید ثبت نشده است.</p>}
      {list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}
    </section>
  </StoreShell>
}

export default function PurchasesPage() { return <Suspense fallback={null}><Purchases /></Suspense> }
