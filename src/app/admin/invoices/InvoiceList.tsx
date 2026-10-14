'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { CLOSE_REASON_LABEL, INTERVALS, currencyFa } from '@/modules/billing/domain/invoice-rules'
import { CURRENCIES, CURRENCY_LABEL, STATUS_LABEL, jalali, localInput, money, send, type Person } from './desk'
import { CustomerPicker, useGateways } from './shared'
import { BASE_CURRENCY } from '@/shared/money/client'

export type InvoiceRow = {
  id: number; number: string; user: Person | null; userId: number; orderId: number | null; planName: string; productName: string
  subtotal: number; discount: number; tax: number; total: number; walletApplied: number; amountDue: number; currency: string; status: string
  gatewayName: string; issuedAt: string; dueAt: string | null; paidAt: string | null; notes: string; title: string; detail: string; kind: string
  expiresAt: string | null; fxRates: Record<string, number>; closedReason: string; recurringId: number | null
}
type Summary = { counts: Record<string, number>; paidTotal: number; closedByRule: number; expiring: number; currency: string; currencies: string[] }

const FILTERS = [['', 'همه'], ['UNPAID', 'پرداخت‌نشده'], ['PAID', 'پرداخت‌شده'], ['DRAFT', 'پیش‌نویس'], ['VOID', 'باطل'], ['REFUNDED', 'بازپرداخت'], ['closed', 'بسته‌شده با قانون']] as const

function titleOf(row: InvoiceRow) {
  if (row.title) return row.title
  if (row.kind === 'WALLET_TOPUP') return 'افزایش موجودی کیف پول'
  return row.planName || row.productName || (row.orderId ? `سفارش #${row.orderId}` : row.notes.split('\n')[0] || 'فاکتور')
}

export default function InvoiceList({ onSummary }: { onSummary: (summary: Summary) => void }) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [currency, setCurrency] = useState<string>(BASE_CURRENCY)
  const [currencies, setCurrencies] = useState<string[]>([BASE_CURRENCY])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<InvoiceRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ q: query, currency, ...(filter === 'closed' ? { closed: '1' } : { status: filter }) })
      const response = await fetch(`/api/admin/invoices?${qs}`).catch(() => null)
      const data = response?.ok ? await response.json().catch(() => null) : null
      if (data) {
        setRows(data.invoices || []); setCounts(data.counts || {}); setCurrencies(data.currencies || [currency])
        onSummary({ counts: data.counts || {}, paidTotal: data.paidTotal || 0, closedByRule: data.closedByRule || 0, expiring: data.expiring || 0, currency: data.currency, currencies: data.currencies || [] })
        setOpen((current) => (current ? (data.invoices || []).find((row: InvoiceRow) => row.id === current.id) || current : null))
      }
    } finally { setLoading(false) }
  }, [filter, query, currency, onSummary])
  useEffect(() => { const timer = setTimeout(() => void load(), query ? 300 : 0); return () => clearTimeout(timer) }, [load, query])

  const done = (ok: boolean, text: string) => { setNotice({ ok, text }); void load() }

  return <section className="ivd-list">
    <div className="ivd-toolbar">
      <div className="ivd-filters" role="tablist" aria-label="وضعیت فاکتور">
        {FILTERS.map(([id, label]) => <button key={id || 'all'} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}{id && id !== 'closed' && counts[id] ? <i>{counts[id].toLocaleString('fa-IR')}</i> : null}</button>)}
      </div>
      <div className="ivd-toolbar-end">
        <label className="ivd-search"><Icon name="search" size={16} /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="شماره، شرح، نام یا ایمیل…" aria-label="جست‌وجو" /></label>
        <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="واحد پول">{[...new Set([...currencies, ...CURRENCIES])].map((code) => <option key={code} value={code}>{CURRENCY_LABEL[code] || code}</option>)}</select>
        <button type="button" className="btn btn-primary" onClick={() => { setCreating(true); setOpen(null) }}><Icon name="plus" size={16} /> فاکتور تازه</button>
      </div>
    </div>

    {notice && <p className={notice.ok ? 'ivd-notice is-ok' : 'ivd-notice is-bad'} role="status">{notice.text}</p>}
    {creating && <CreateInvoice currency={currency} onClose={() => setCreating(false)} onDone={(text) => { setCreating(false); done(true, text) }} />}

    <div className={`ivd-body${open ? ' has-panel' : ''}`}>
      <div className="ivd-rows">
        {loading && !rows.length ? <div className="ivd-skeleton" aria-busy="true"><i /><i /><i /></div>
          : !rows.length ? <div className="ivd-empty"><Icon name="receipt" size={30} /><b>فاکتوری با این فیلتر نیست</b><span>فیلتر یا واحد پول را عوض کنید، یا یک فاکتور تازه بسازید.</span></div>
          : rows.map((row) => <button key={row.id} type="button" className={`ivd-row is-${row.status.toLowerCase()}${open?.id === row.id ? ' is-open' : ''}`} onClick={() => { setOpen(row); setCreating(false) }}>
            <span className="ivd-row-mark" aria-hidden="true"><Icon name={row.recurringId ? 'clock' : row.kind === 'WALLET_TOPUP' ? 'wallet' : 'receipt'} size={18} /></span>
            <span className="ivd-row-main">
              <b>{titleOf(row)}</b>
              <small>{row.user ? (row.user.name || row.user.email) : `کاربر #${row.userId}`} · <bdi dir="ltr">{row.number}</bdi> · {jalali(row.issuedAt)}</small>
              <span className="ivd-row-tags">
                {row.recurringId && <i className="ivd-tag is-loop">دوره‌ای</i>}
                {Object.keys(row.fxRates).length > 0 && <i className="ivd-tag is-fx">ارزی: {Object.keys(row.fxRates).map(currencyFa).join('، ')}</i>}
                {row.status === 'UNPAID' && row.expiresAt && <i className="ivd-tag is-time">تا {jalali(row.expiresAt, true)}</i>}
                {row.closedReason && <i className="ivd-tag is-closed">بسته: {CLOSE_REASON_LABEL[row.closedReason] || row.closedReason}</i>}
              </span>
            </span>
            <span className="ivd-row-end"><b className="num">{money(row.total, row.currency)}</b><i className={`ivd-status is-${row.status.toLowerCase()}`}>{STATUS_LABEL[row.status] || row.status}</i></span>
          </button>)}
      </div>
      {open && <InvoicePanel key={open.id} row={open} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  </section>
}

function InvoicePanel({ row, onClose, onDone }: { row: InvoiceRow; onClose: () => void; onDone: (ok: boolean, text: string) => void }) {
  const editable = !['PAID', 'REFUNDED'].includes(row.status)
  const [draft, setDraft] = useState({ title: row.title, detail: row.detail, notes: row.notes, discount: String(row.discount || ''), tax: String(row.tax || ''), dueAt: row.dueAt ? localInput(new Date(row.dueAt)) : '', expiresAt: row.expiresAt ? localInput(new Date(row.expiresAt)) : '' })
  const [txn, setTxn] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }))

  async function run(label: string, call: () => Promise<{ ok: boolean; error: string; data: any }>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(true)
    let result: { ok: boolean; error: string; data: any }
    try { result = await call() } finally { setBusy(false) }
    onDone(result.ok, result.ok ? `${label} انجام شد${result.data?.warning ? ` — ${result.data.warning}` : ''}` : result.error)
    if (result.ok && label === 'حذف') onClose()
  }
  const save = () => run('ذخیره', () => send('/api/admin/invoices', 'PATCH', {
    id: row.id, title: draft.title, detail: draft.detail, notes: draft.notes,
    ...(editable ? { discount: draft.discount || 0, tax: draft.tax || 0, dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null, expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null } : {}),
  }))

  return <aside className="ivd-panel" aria-label={`فاکتور ${row.number}`}>
    <header>
      <div><small>فاکتور</small><b dir="ltr">{row.number}</b></div>
      <i className={`ivd-status is-${row.status.toLowerCase()}`}>{STATUS_LABEL[row.status] || row.status}</i>
      <button type="button" className="ivd-close" onClick={onClose} aria-label="بستن"><Icon name="plus" size={18} /></button>
    </header>
    <div className="ivd-panel-sum">
      <div><span>مبلغ کل</span><b className="num">{money(row.total, row.currency)}</b></div>
      <div><span>مانده</span><b className="num">{money(row.amountDue, row.currency)}</b></div>
      <div><span>مشتری</span><b>{row.user ? (row.user.name || row.user.email) : `#${row.userId}`}</b></div>
      <div><span>صدور / سررسید</span><b>{jalali(row.issuedAt)} / {jalali(row.dueAt)}</b></div>
    </div>
    {Object.keys(row.fxRates).length > 0 && <p className="ivd-fx-note"><Icon name="chart" size={16} /> قیمت این فاکتور به نرخ ارز وابسته است — نرخ هنگام ثبت: {Object.entries(row.fxRates).map(([code, rate]) => `${currencyFa(code)} ${Math.round(rate).toLocaleString('fa-IR')} تومان`).join('، ')}</p>}
    {row.closedReason && <p className="ivd-fx-note is-closed"><Icon name="clock" size={16} /> این فاکتور با قانون «{CLOSE_REASON_LABEL[row.closedReason] || row.closedReason}» بسته شد.</p>}

    <div className="ivd-fields">
      <label className="sa-field"><span>شرح فاکتور</span><input className="input" value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder={titleOf(row)} /></label>
      <label className="sa-field"><span>توضیحات</span><textarea className="input" rows={2} maxLength={500} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} /></label>
      {editable && <div className="ivd-grid-2">
        <label className="sa-field"><span>تخفیف ({row.currency})</span><input className="input num" inputMode="decimal" value={draft.discount} onChange={(e) => set({ discount: e.target.value })} /></label>
        <label className="sa-field"><span>مالیات ({row.currency})</span><input className="input num" inputMode="decimal" value={draft.tax} onChange={(e) => set({ tax: e.target.value })} /></label>
        <label className="sa-field ivd-wide"><span>سررسید</span><input className="input" type="datetime-local" dir="ltr" value={draft.dueAt} onChange={(e) => set({ dueAt: e.target.value })} /><small>{draft.dueAt ? jalali(new Date(draft.dueAt), true) : 'بدون سررسید'}</small></label>
        <label className="sa-field ivd-wide"><span>بسته شدن خودکار</span><input className="input" type="datetime-local" dir="ltr" value={draft.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} /><small>{draft.expiresAt ? jalali(new Date(draft.expiresAt), true) : 'بدون مهلت'}</small></label>
      </div>}
      <label className="sa-field"><span>یادداشت داخلی</span><textarea className="input" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>ذخیرهٔ تغییرات</button>
    </div>

    <div className="ivd-actions">
      <Link href={`/invoice/${row.number}`} target="_blank" className="btn btn-ghost"><Icon name="external" size={16} /> مشاهده</Link>
      <Link href={`/invoice/${row.number}/official`} target="_blank" className="btn btn-ghost"><Icon name="file" size={16} /> صورتحساب رسمی</Link>
    </div>
    {['UNPAID', 'DRAFT'].includes(row.status) && <div className="ivd-pay">
      <input className="input" dir="ltr" value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="شمارهٔ پیگیری (اختیاری)" aria-label="شمارهٔ پیگیری" />
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run('ثبت پرداخت', () => send('/api/admin/invoices', 'PATCH', { id: row.id, action: 'markPaid', providerTxnId: txn }), 'این فاکتور پرداخت‌شده ثبت شود؟')}>ثبت پرداخت</button>
    </div>}
    <div className="ivd-danger">
      {['UNPAID', 'DRAFT'].includes(row.status) && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run('باطل کردن', () => send('/api/admin/invoices', 'PATCH', { id: row.id, action: 'void' }), 'فاکتور باطل شود؟ اعتبار کیف پول آن برمی‌گردد.')}>باطل کردن</button>}
      {row.status === 'PAID' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run('بازپرداخت', () => send('/api/admin/invoices', 'PATCH', { id: row.id, action: 'refund' }), 'بازپرداخت ثبت شود؟ پرداخت درگاه را باید جداگانه در درگاه برگردانید.')}>ثبت بازپرداخت</button>}
      {!['PAID', 'REFUNDED'].includes(row.status) && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run('حذف', () => send(`/api/admin/invoices?id=${row.id}`, 'DELETE'), `فاکتور ${row.number} برای همیشه حذف شود؟`)}>حذف</button>}
      {['PAID', 'REFUNDED'].includes(row.status) && <p className="ivd-hint">فاکتور پرداخت‌شده برای حسابداری نگه داشته می‌شود و حذف نمی‌شود.</p>}
    </div>
  </aside>
}

type Item = { id: number; name: string; price?: number | string; currency?: string; active?: boolean }

function CreateInvoice({ currency, onClose, onDone }: { currency: string; onClose: () => void; onDone: (text: string) => void }) {
  const gateways = useGateways()
  const [person, setPerson] = useState<Person | null>(null)
  const [form, setForm] = useState({ kind: 'custom', itemId: '', title: '', detail: '', amount: '', currency, discount: '', tax: '', dueDays: '7', expiresHours: '', gatewayId: '', status: 'UNPAID', notes: '', repeat: 'ONCE', startAt: localInput(new Date()), maxCount: '' })
  const [items, setItems] = useState<{ plan: Item[]; product: Item[] }>({ plan: [], product: [] })
  useEffect(() => {
    if (form.kind === 'custom' || items[form.kind as 'plan' | 'product'].length) return
    const url = form.kind === 'plan' ? '/api/plans' : '/api/public/cms?type=products'
    fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((data) => {
      const list = (Array.isArray(data) ? data : data.plans || data.items || []) as Item[]
      setItems((current) => ({ ...current, [form.kind]: list.filter((item) => item.active !== false) }))
    }).catch(() => undefined)
  }, [form.kind, items])
  const pick = (id: string) => {
    const item = items[form.kind as 'plan' | 'product'].find((row) => String(row.id) === id)
    set({ itemId: id, amount: item ? String(item.price ?? '') : '', currency: item?.currency || form.currency, gatewayId: '' })
  }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))
  const fitting = gateways.filter((gateway) => !gateway.fiat || gateway.fiat === form.currency)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!person) { setError('مشتری را انتخاب کنید'); return }
    setBusy(true); setError('')
    let result: Awaited<ReturnType<typeof send>>
    try {
      result = form.repeat === 'ONCE'
      ? await send('/api/admin/invoices', 'POST', { userId: person.id, ...(form.kind === 'plan' ? { planId: Number(form.itemId) } : form.kind === 'product' ? { productId: Number(form.itemId) } : {}), title: form.title, detail: form.detail, subtotal: form.amount, currency: form.currency, discount: form.discount || 0, tax: form.tax || 0, dueDays: Number(form.dueDays) || 0, expiresHours: form.expiresHours, gatewayId: form.gatewayId ? Number(form.gatewayId) : null, status: form.status, notes: form.notes })
      : await send('/api/admin/invoices/automation', 'POST', { op: 'save', userId: person.id, title: form.title, detail: form.detail, amount: form.amount, currency: form.currency, interval: form.repeat, nextAt: new Date(form.startAt).toISOString(), maxCount: form.maxCount || 0, dueDays: Number(form.dueDays) || 0, gatewayId: form.gatewayId ? Number(form.gatewayId) : null, notes: form.notes })
    } finally { setBusy(false) }
    if (!result.ok) { setError(result.error); return }
    onDone(form.repeat === 'ONCE' ? `فاکتور ${result.data.number} ساخته شد` : 'فاکتور دوره‌ای ساخته شد؛ اولین فاکتور در زمان شروع صادر می‌شود')
  }

  return <form className="ivd-create" onSubmit={submit}>
    <header><h2>فاکتور تازه</h2><button type="button" className="ivd-close" onClick={onClose} aria-label="بستن"><Icon name="plus" size={18} /></button></header>
    <div className="ivd-create-grid">
      <div className="sa-field ivd-wide"><span>مشتری</span><CustomerPicker value={person} onChange={setPerson} /></div>
      <label className="sa-field"><span>برای</span><select className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value, itemId: '', amount: '', repeat: e.target.value === 'custom' ? form.repeat : 'ONCE' })}><option value="custom">خدمت یا مبلغ دلخواه</option><option value="plan">پلن</option><option value="product">محصول</option></select></label>
      {form.kind !== 'custom' && <label className="sa-field"><span>{form.kind === 'plan' ? 'پلن' : 'محصول'}</span><select className="select" required value={form.itemId} onChange={(e) => pick(e.target.value)}><option value="">انتخاب کنید…</option>{items[form.kind as 'plan' | 'product'].map((item) => <option key={item.id} value={item.id}>{item.name} — {money(Number(item.price) || 0, item.currency || form.currency)}</option>)}</select></label>}
      <label className="sa-field ivd-wide"><span>شرح فاکتور</span><input className="input" value={form.title} maxLength={120} required={form.kind === 'custom'} onChange={(e) => set({ title: e.target.value })} placeholder={form.kind === 'custom' ? 'مثلاً: پشتیبانی ماهانهٔ سایت' : 'خالی: نام پلن یا محصول'} /></label>
      <label className="sa-field ivd-wide"><span>توضیحات</span><textarea className="input" rows={2} maxLength={500} value={form.detail} onChange={(e) => set({ detail: e.target.value })} placeholder="آنچه مشتری در ردیف فاکتور می‌بیند" /></label>
      <label className="sa-field"><span>مبلغ</span><input className="input num" inputMode="decimal" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
      <label className="sa-field"><span>واحد پول</span><select className="select" value={form.currency} disabled={form.kind !== 'custom'} onChange={(e) => set({ currency: e.target.value, gatewayId: '' })}>{CURRENCIES.map((code) => <option key={code} value={code}>{CURRENCY_LABEL[code]}</option>)}</select></label>
      {form.repeat === 'ONCE' && <>
        <label className="sa-field"><span>تخفیف</span><input className="input num" inputMode="decimal" value={form.discount} onChange={(e) => set({ discount: e.target.value })} /></label>
        <label className="sa-field"><span>مالیات</span><input className="input num" inputMode="decimal" value={form.tax} onChange={(e) => set({ tax: e.target.value })} /></label>
      </>}
      <label className="sa-field"><span>مهلت پرداخت (روز)</span><input className="input num" type="number" min={0} max={365} value={form.dueDays} onChange={(e) => set({ dueDays: e.target.value })} /></label>
      <label className="sa-field"><span>درگاه</span><select className="select" value={form.gatewayId} onChange={(e) => set({ gatewayId: e.target.value })}><option value="">انتقال دستی / انتخاب مشتری</option>{fitting.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name}</option>)}</select></label>
    </div>

    <fieldset className="ivd-repeat">
      <legend>تکرار</legend>
      <div className="ivd-repeat-options">
        <label className={form.repeat === 'ONCE' ? 'is-on' : ''}><input type="radio" name="repeat" checked={form.repeat === 'ONCE'} onChange={() => set({ repeat: 'ONCE' })} /> یک‌بار پرداخت</label>
        {form.kind === 'custom' && INTERVALS.map((item) => <label key={item.id} className={form.repeat === item.id ? 'is-on' : ''}><input type="radio" name="repeat" checked={form.repeat === item.id} onChange={() => set({ repeat: item.id })} /> {item.label}</label>)}
      </div>
      {form.repeat === 'ONCE' ? <div className="ivd-create-grid">
        <label className="sa-field"><span>بسته شدن خودکار پس از (ساعت)</span><input className="input num" type="number" min={0} step="0.5" value={form.expiresHours} onChange={(e) => set({ expiresHours: e.target.value })} placeholder="خالی: ندارد" /></label>
        <label className="sa-field"><span>وضعیت</span><select className="select" value={form.status} onChange={(e) => set({ status: e.target.value })}><option value="UNPAID">صادر شود (مشتری می‌بیند)</option><option value="DRAFT">پیش‌نویس</option></select></label>
      </div> : <div className="ivd-create-grid">
        <label className="sa-field"><span>اولین فاکتور</span><input className="input" type="datetime-local" dir="ltr" value={form.startAt} onChange={(e) => set({ startAt: e.target.value })} /><small>{jalali(new Date(form.startAt), true)}</small></label>
        <label className="sa-field"><span>تعداد دفعات</span><input className="input num" type="number" min={0} max={1000} value={form.maxCount} onChange={(e) => set({ maxCount: e.target.value })} placeholder="خالی: تا وقتی متوقف کنید" /></label>
      </div>}
    </fieldset>
    <label className="sa-field"><span>یادداشت داخلی</span><input className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
    {error && <p className="ivd-notice is-bad" role="alert">{error}</p>}
    <div className="ivd-create-foot"><button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button><button type="submit" className="btn btn-primary" disabled={busy}>{form.repeat === 'ONCE' ? 'ساخت فاکتور' : 'ساخت فاکتور دوره‌ای'}</button></div>
  </form>
}
