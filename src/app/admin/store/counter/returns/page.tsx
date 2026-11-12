'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { StoreShell, useJson } from '../../shared'
import { formatMoney } from '@/shared/money'
import { clampRefund, returnRefundMinor } from '@/modules/store/domain/returns'
import type { counterReturnLookup } from '@/modules/store/server/returns'
import '../../desk.css'
import '../../inventory/stock.css'

type Lookup = Awaited<ReturnType<typeof counterReturnLookup>>
type Result = { id: number; number: string; orderId: number; refundMinor: string; currency: string; method: string }
type Session = { id: number; register: string; currency: string; status: string; mine: boolean; location: string }
const KEY = 'store.counter.return.pending.v1'
const METHODS: Record<string, string> = { CASH: 'نقد', CARD: 'کارت', WALLET: 'کیف پول' }

export default function CounterReturnsPage() {
  const sessions = useJson<{ sessions: Session[] }>('/api/admin/store/counter?registers=1')
  const [invoice, setInvoice] = useState(''), [order, setOrder] = useState<Lookup | null>(null), [quantities, setQuantities] = useState<Record<number, number>>({})
  const [sessionId, setSessionId] = useState(''), [method, setMethod] = useState('CASH'), [reason, setReason] = useState('changed_mind')
  const [note, setNote] = useState(''), [reference, setReference] = useState(''), [restock, setRestock] = useState(false), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [uncertain, setUncertain] = useState(false), [result, setResult] = useState<Result | null>(null)
  const pending = useRef<Record<string, unknown> | null>(null), scan = useRef<HTMLInputElement>(null)
  const choices = Object.entries(quantities).filter(([, q]) => q > 0).map(([line, quantity]) => ({ line: Number(line), quantity }))
  const amount = order ? clampRefund(returnRefundMinor(choices, order.lines.map(line => ({ line: line.line, quantity: line.quantity, returnedQuantity: line.returned, unitPriceMinor: BigInt(line.unitMinor), totalMinor: BigInt(line.totalMinor) })), { itemsMinor: BigInt(order.itemsMinor), discountMinor: BigInt(order.discountMinor) }), BigInt(order.remainingMinor)) : 0n
  const open = sessions.data?.sessions.filter(row => row.mine && row.status === 'OPEN' && (!order || row.currency === order.currency)) || []

  async function recover() {
    const id = sessionStorage.getItem(KEY)
    if (!id) return
    setBusy(true); setUncertain(true)
    try {
      const response = await fetch(`/api/admin/store/counter/returns?request=${encodeURIComponent(id)}`, { cache: 'no-store' }), data = await response.json()
      if (!response.ok) throw Error(data.error)
      if (data.result) { setResult(data.result); setUncertain(false); sessionStorage.removeItem(KEY); pending.current = null; setMessage('') }
      else setMessage('نتیجه هنوز ثبت نشده است. همان درخواست را دوباره بفرستید یا پیش از شروع مرجوعی تازه، سوابق سفارش را بررسی کنید.')
    } catch { setMessage('بازیابی نتیجه انجام نشد؛ دوباره بررسی کنید.') } finally { setBusy(false) }
  }
  useEffect(() => { void recover() }, [])
  async function lookup(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setOrder(null)
    try {
      const response = await fetch(`/api/admin/store/counter/returns?invoice=${encodeURIComponent(invoice)}`, { cache: 'no-store' }), data = await response.json()
      if (!response.ok) throw Error(data.error || 'فاکتور دریافت نشد')
      setOrder(data.order); setQuantities({}); setConfirmed(false); setResult(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد') } finally { setBusy(false) }
  }
  async function submit() {
    if (!order) return
    const body = pending.current || { requestId: crypto.randomUUID(), orderId: order.orderId, sessionId: Number(sessionId), lines: choices, refund: method, reason, note, reference, restock, expectedRefundMinor: amount.toString(), confirmed }
    try { sessionStorage.setItem(KEY, String(body.requestId)) } catch { setMessage('مرورگر باید امکان نگهداری شناسهٔ مرجوعی را داشته باشد.'); return }
    pending.current = body; setBusy(true); setMessage(''); setUncertain(true)
    try {
      const response = await fetch('/api/admin/store/counter/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), data = await response.json()
      if (!response.ok) {
        if (response.status < 500 && !uncertain && data.code !== 'REQUEST_CONFLICT') { pending.current = null; sessionStorage.removeItem(KEY); setUncertain(false) }
        setMessage(data.error || 'بازپرداخت انجام نشد'); return
      }
      setResult(data.result); pending.current = null; sessionStorage.removeItem(KEY); setUncertain(false); setOrder(null)
      void sessions.reload()
    } catch { setMessage('پاسخ دریافت نشد؛ نتیجه را بررسی کنید یا همان درخواست را دوباره بفرستید.') } finally { setBusy(false) }
  }
  return <StoreShell title="مرجوعی در فروشگاه" actions={<Link className="btn btn-ghost" href="/admin/store/counter">فروش حضوری</Link>}>
    <p className="sa-hint">خرید سایت و مغازه با همان فاکتور مرجوع می‌شود. برای تعویض، مرجوعی و فروش کالای جایگزین جداگانه ثبت می‌شوند تا هر دو سند باقی بمانند.</p>
    {message && <p className="sa-notice" role="alert">{message}</p>}
    {uncertain && <div className="st-form-actions"><button type="button" className="btn" disabled={busy} onClick={() => void recover()}>بررسی نتیجهٔ درخواست</button>{pending.current && <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>تلاش مجدد همان مرجوعی</button>}<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm('سوابق سفارش را بررسی کرده‌اید و مطمئنید مرجوعی دیگری لازم است؟')) { sessionStorage.removeItem(KEY); pending.current = null; setUncertain(false); setMessage(''); setOrder(null) } }}>پس از بررسی، شروع دوباره</button></div>}
    {result && <section className="cd-success" aria-label="نتیجهٔ مرجوعی" role="status"><h2>مرجوعی ثبت شد</h2><p><b dir="ltr">{result.number}</b> · سفارش {result.orderId.toLocaleString('fa-IR')}</p><p>{formatMoney(BigInt(result.refundMinor), result.currency, 'fa-IR')} به {METHODS[result.method]} برگشت داده شد</p><div className="st-form-actions"><Link className="btn" href={`/admin/store/returns/${result.id}`}>سند و سابقهٔ مرجوعی</Link><button className="btn btn-ghost" type="button" onClick={() => { setResult(null); setInvoice(''); scan.current?.focus() }}>مرجوعی بعدی</button></div></section>}
    <form className="st-form" onSubmit={lookup}><label className="cd-field"><span>بارکد فاکتور یا شمارهٔ سفارش</span><input ref={scan} className="input cd-num" dir="ltr" value={invoice} onChange={event => setInvoice(event.target.value)} maxLength={60} required disabled={busy || uncertain} /></label><button className="btn" type="submit" disabled={busy || uncertain}>{busy ? 'در حال بررسی…' : 'خواندن فاکتور'}</button></form>
    {order && <form className="st-form st-return" onSubmit={event => { event.preventDefault(); void submit() }} aria-busy={busy}><fieldset disabled={busy || uncertain}>
      <legend>فاکتور <b dir="ltr">{order.invoice}</b> · {order.channel === 'COUNTER' ? 'حضوری' : 'سایت'}</legend>
      <p>{order.customer} <span dir="ltr">{order.phone}</span></p>
      {order.open && <p className="sa-notice">درخواست باز این سفارش را ابتدا در «لغو و مرجوعی» تعیین تکلیف کنید.</p>}
      {order.delivery !== 'DELIVERED' && <p className="sa-notice">سفارش هنوز تحویل نشده است؛ از مسیر لغو سفارش اقدام کنید.</p>}
      <div className="sa-table-wrap"><table className="st-matrix"><thead><tr><th scope="col">کالا</th><th scope="col">قابل مرجوعی</th><th scope="col">تعداد برگشتی</th></tr></thead><tbody>{order.lines.map(line => <tr key={line.line}><th scope="row">{line.name}<small>{line.variant}{line.code ? ' · کد پس‌گرفته‌شده باطل می‌شود' : ''}</small></th><td>{line.returnable.toLocaleString('fa-IR')}</td><td><input className="input st-cell" type="number" min={0} max={line.returnable} step={1} aria-label={`تعداد مرجوعی ${line.name} ${line.variant}`} value={quantities[line.line] || 0} onChange={event => { const n = Number(event.target.value); setQuantities({ ...quantities, [line.line]: Number.isSafeInteger(n) && n > 0 ? Math.min(n, line.returnable) : 0 }); setConfirmed(false) }} disabled={!line.returnable} /></td></tr>)}</tbody></table></div>
      <label className="cd-field"><span>صندوق و محل دریافت کالا</span><select className="input" value={sessionId} required onChange={event => { setSessionId(event.target.value); setConfirmed(false) }}><option value="">صندوق باز خود را انتخاب کنید</option>{open.map(row => <option key={row.id} value={row.id}>{row.register} · {row.location} · {row.currency}</option>)}</select></label>
      {!open.length && <p className="sa-hint">{sessions.error || 'صندوق باز با واحد پول این فاکتور لازم است.'} <Link href="/admin/store/registers">باز کردن صندوق</Link></p>}
      <label className="cd-field"><span>روش بازپرداخت</span><select className="input" value={method} onChange={event => { setMethod(event.target.value); setConfirmed(false) }}><option value="CASH">نقد از صندوق</option><option value="CARD">برگشت به کارت با ثبت پیگیری</option><option value="WALLET" disabled={!order.hasAccount}>کیف پول حساب خریدار{!order.hasAccount ? ' (خریدار مهمان)' : ''}</option></select></label>
      {method === 'CARD' && <label className="cd-field"><span>پیگیری بازپرداخت کارت</span><input className="input" dir="ltr" required maxLength={60} value={reference} onChange={event => setReference(event.target.value)} /><small>ثبت این سند به‌تنهایی پول را از شبکهٔ بانکی منتقل نمی‌کند.</small></label>}
      <label className="cd-field"><span>دلیل</span><select className="input" value={reason} onChange={event => setReason(event.target.value)}>{order.reasons.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="cd-field"><span>توضیح</span><textarea className="input" required={reason === 'other'} minLength={reason === 'other' ? 5 : undefined} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
      <label className="cd-confirm"><input type="checkbox" checked={restock} onChange={event => { setRestock(event.target.checked); setConfirmed(false) }} /><span>کالای فیزیکی سالم و قابل فروش است؛ به موجودی محل همین صندوق اضافه شود</span></label>
      <p className="cd-ticket-total"><span>مبلغ بازپرداخت</span><strong>{formatMoney(amount, order.currency, 'fa-IR')}</strong></p>
      <label className="cd-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>کالا را دریافت کرده‌ام و {method === 'WALLET' ? 'واریز این مبلغ به کیف پول خریدار' : 'برگشت این مبلغ به مشتری'} را تأیید می‌کنم</span></label>
      <button className="btn btn-primary" type="submit" disabled={!confirmed || !sessionId || amount <= 0n || order.open || order.delivery !== 'DELIVERED'}>ثبت مرجوعی و بازپرداخت</button>
    </fieldset></form>}
  </StoreShell>
}
