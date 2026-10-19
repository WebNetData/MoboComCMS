'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { INTERVALS, intervalOf, normalizeInvoiceRules, type InvoiceRules } from '@/modules/billing/domain/invoice-rules'
import { CURRENCIES, CURRENCY_LABEL, STATUS_LABEL, jalali, localInput, money, numberOf, send, type Person } from './desk'
import { CustomerPicker, useGateways } from './shared'
import { BASE_CURRENCY } from '@/shared/money/client'
import JalaliDateInput from '@/components/date/JalaliDateInput'

type Recurring = {
  id: number; userId: number; user: Person | null; title: string; detail: string; amount: number; currency: string; interval: string
  nextAt: string; endsAt: string | null; maxCount: number; issuedCount: number; dueDays: number; gatewayId: number | null; notes: string; active: boolean
  lastInvoice: { id: number; number: string; status: string } | null
}

export function RecurringPanel() {
  const [rows, setRows] = useState<Recurring[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/invoices/automation').catch(() => null)
      const data = response?.ok ? await response.json().catch(() => null) : null
      if (data) setRows(data.recurring || [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(row: Recurring, op: 'toggle' | 'issue' | 'delete') {
    if (op === 'delete' && !confirm(`فاکتور دوره‌ای «${row.title}» حذف شود؟ فاکتورهایی که تا امروز صادر کرده می‌مانند.`)) return
    if (op === 'issue' && !confirm('یک فاکتور از همین حالا برای مشتری صادر شود؟')) return
    const result = await send('/api/admin/invoices/automation', 'POST', { op, id: row.id })
    setNotice({ ok: result.ok, text: result.ok ? (op === 'issue' ? `فاکتور ${result.data.number} صادر شد` : op === 'delete' ? 'حذف شد' : result.data.active ? 'فعال شد' : 'متوقف شد') : result.error })
    void load()
  }

  return <section className="ivd-recurring">
    <header className="ivd-section-head">
      <div><h2>فاکتورهای دوره‌ای</h2><p>هر دوره، فاکتور خودبه‌خود برای مشتری صادر می‌شود و در صندوق پیام او اعلام می‌شود.</p></div>
      <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> فاکتور دوره‌ای تازه</button>
    </header>
    {notice && <p className={notice.ok ? 'ivd-notice is-ok' : 'ivd-notice is-bad'} role="status">{notice.text}</p>}
    {editing && <RecurringForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setNotice({ ok: true, text }); void load() }} />}
    {loading ? <div className="ivd-skeleton" aria-busy="true"><i /><i /></div>
      : !rows.length ? <div className="ivd-empty"><Icon name="clock" size={30} /><b>هنوز فاکتور دوره‌ای ندارید</b><span>برای خدمتی که هر هفته، ماه یا سال تکرار می‌شود یکی بسازید.</span></div>
      : <div className="ivd-cards">{rows.map((row) => <article key={row.id} className={`ivd-card${row.active ? '' : ' is-off'}`}>
        <header>
          <span className="ivd-loop"><Icon name="clock" size={16} />{intervalOf(row.interval)?.label || row.interval}</span>
          <label className="ivd-switch" title={row.active ? 'فعال' : 'متوقف'}><input type="checkbox" checked={row.active} onChange={() => void act(row, 'toggle')} aria-label={row.active ? 'توقف' : 'فعال کردن'} /><i /></label>
        </header>
        <h3>{row.title}</h3>
        {row.detail && <p className="ivd-card-detail">{row.detail}</p>}
        <b className="ivd-card-amount num">{money(row.amount, row.currency)}</b>
        <dl>
          <div><dt>مشتری</dt><dd>{row.user ? (row.user.name || row.user.email) : `#${row.userId}`}</dd></div>
          <div><dt>فاکتور بعدی</dt><dd>{row.active ? jalali(row.nextAt, true) : 'متوقف'}</dd></div>
          <div><dt>صادرشده</dt><dd>{row.issuedCount.toLocaleString('fa-IR')}{row.maxCount ? ` از ${row.maxCount.toLocaleString('fa-IR')}` : ''}</dd></div>
          {row.lastInvoice && <div><dt>آخرین</dt><dd><Link href={`/invoice/${row.lastInvoice.number}`} target="_blank" dir="ltr">{row.lastInvoice.number}</Link> <small>{STATUS_LABEL[row.lastInvoice.status] || row.lastInvoice.status}</small></dd></div>}
        </dl>
        <footer>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(row)}>ویرایش</button>
          <button type="button" className="btn btn-ghost" onClick={() => void act(row, 'issue')}>صدور همین حالا</button>
          <button type="button" className="ivd-link is-danger" onClick={() => void act(row, 'delete')}>حذف</button>
        </footer>
      </article>)}</div>}
  </section>
}

function RecurringForm({ row, onClose, onSaved }: { row: Recurring | null; onClose: () => void; onSaved: (text: string) => void }) {
  const gateways = useGateways()
  const [person, setPerson] = useState<Person | null>(row?.user || null)
  const [form, setForm] = useState({
    title: row?.title || '', detail: row?.detail || '', amount: row ? String(row.amount) : '', currency: row?.currency || BASE_CURRENCY, interval: row?.interval || 'MONTH',
    nextAt: localInput(row ? new Date(row.nextAt) : new Date()), endsAt: row?.endsAt ? localInput(new Date(row.endsAt)) : '', maxCount: row?.maxCount ? String(row.maxCount) : '',
    dueDays: String(row?.dueDays ?? 7), gatewayId: row?.gatewayId ? String(row.gatewayId) : '', notes: row?.notes || '', active: row?.active ?? true,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!person) { setError('مشتری را انتخاب کنید'); return }
    setBusy(true); setError('')
    let result: Awaited<ReturnType<typeof send>>
    try {
      result = await send('/api/admin/invoices/automation', 'POST', {
      op: 'save', id: row?.id, userId: person.id, title: form.title, detail: form.detail, amount: form.amount, currency: form.currency, interval: form.interval,
      nextAt: new Date(form.nextAt).toISOString(), endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null, maxCount: form.maxCount || 0,
      dueDays: Number(form.dueDays) || 0, gatewayId: form.gatewayId ? Number(form.gatewayId) : null, notes: form.notes, active: form.active,
      })
    } finally { setBusy(false) }
    if (!result.ok) { setError(result.error); return }
    onSaved(row ? 'تغییرات ذخیره شد' : 'فاکتور دوره‌ای ساخته شد')
  }
  return <form className="ivd-create" onSubmit={submit}>
    <header><h2>{row ? 'ویرایش فاکتور دوره‌ای' : 'فاکتور دوره‌ای تازه'}</h2><button type="button" className="ivd-close" onClick={onClose} aria-label="بستن"><Icon name="plus" size={18} /></button></header>
    <div className="ivd-create-grid">
      <div className="sa-field ivd-wide"><span>مشتری</span><CustomerPicker value={person} onChange={setPerson} /></div>
      <label className="sa-field ivd-wide"><span>شرح فاکتور</span><input className="input" required maxLength={120} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="مثلاً: میزبانی سایت" /></label>
      <label className="sa-field ivd-wide"><span>توضیحات</span><textarea className="input" rows={2} maxLength={500} value={form.detail} onChange={(e) => set({ detail: e.target.value })} /></label>
      <label className="sa-field"><span>مبلغ هر دوره</span><input className="input num" inputMode="decimal" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
      <label className="sa-field"><span>واحد پول</span><select className="select" value={form.currency} onChange={(e) => set({ currency: e.target.value, gatewayId: '' })}>{CURRENCIES.map((code) => <option key={code} value={code}>{CURRENCY_LABEL[code]}</option>)}</select></label>
    </div>
    <fieldset className="ivd-repeat"><legend>هر چند وقت</legend><div className="ivd-repeat-options">{INTERVALS.map((item) => <label key={item.id} className={form.interval === item.id ? 'is-on' : ''}><input type="radio" name="interval" checked={form.interval === item.id} onChange={() => set({ interval: item.id })} /> {item.label}</label>)}</div></fieldset>
    <div className="ivd-create-grid">
      <label className="sa-field"><span>فاکتور بعدی</span><JalaliDateInput withTime className="input" value={form.nextAt} onChange={(value) => set({ nextAt: value })} /><small>{jalali(new Date(form.nextAt), true)}</small></label>
      <label className="sa-field"><span>پایان تکرار (اختیاری)</span><JalaliDateInput withTime className="input" value={form.endsAt} onChange={(value) => set({ endsAt: value })} /><small>{form.endsAt ? jalali(new Date(form.endsAt), true) : 'بدون پایان'}</small></label>
      <label className="sa-field"><span>تعداد دفعات</span><input className="input num" type="number" min={0} max={1000} value={form.maxCount} onChange={(e) => set({ maxCount: e.target.value })} placeholder="خالی: نامحدود" /></label>
      <label className="sa-field"><span>مهلت پرداخت (روز)</span><input className="input num" type="number" min={0} max={365} value={form.dueDays} onChange={(e) => set({ dueDays: e.target.value })} /></label>
      <label className="sa-field"><span>درگاه</span><select className="select" value={form.gatewayId} onChange={(e) => set({ gatewayId: e.target.value })}><option value="">انتخاب مشتری</option>{gateways.filter((g) => !g.fiat || g.fiat === form.currency).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label className="sa-check ivd-wide"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> فعال باشد</label>
    </div>
    {error && <p className="ivd-notice is-bad" role="alert">{error}</p>}
    <div className="ivd-create-foot"><button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button><button type="submit" className="btn btn-primary" disabled={busy}>ذخیره</button></div>
  </form>
}

export function RulesPanel() {
  const [rules, setRules] = useState<InvoiceRules | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { fetch('/api/admin/invoices/automation').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((data) => setRules(normalizeInvoiceRules(data?.rules))).catch(() => setRules(normalizeInvoiceRules({}))) }, [])
  if (!rules) return <div className="ivd-skeleton" aria-busy="true"><i /><i /></div>
  const set = (patch: Partial<InvoiceRules>) => setRules({ ...rules, ...patch })
  async function save() {
    const result = await send('/api/admin/invoices/automation', 'POST', { op: 'rules', rules })
    if (result.ok) setRules(result.data.rules)
    setNotice({ ok: result.ok, text: result.ok ? 'قانون‌ها ذخیره شد' : result.error })
  }
  return <section className="ivd-rules">
    <header className="ivd-section-head"><div><h2>بستن خودکار فاکتور</h2><p>فاکتورهای پرداخت‌نشده‌ای که دیگر معتبر نیستند خودبه‌خود بسته می‌شوند و مشتری با پیامی رسمی باخبر می‌شود. فاکتوری که رسید کارت‌به‌کارت آن در انتظار بررسی است بسته نمی‌شود.</p></div></header>
    <article className="ivd-rule">
      <span className="ivd-rule-icon is-fx"><Icon name="chart" size={22} /></span>
      <div className="ivd-rule-body">
        <h3>محصولات و خدمات وابسته به نرخ ارز</h3>
        <p>فاکتوری که قیمتش از نرخ دلار، یورو یا ارز دیگری آمده (مبلغ ارزی وارد‌شده، محصول با قیمت ارزی، فرم پرداخت ارزی). مشتری روی فاکتور مهلت و دلیل آن را می‌بیند.</p>
        <div className="ivd-create-grid">
          <label className="sa-field"><span>فعال بماند تا (ساعت پس از ثبت)</span><input className="input num" type="number" min={0} max={72} step={0.25} value={rules.fxHours} onChange={(e) => set({ fxHours: numberOf(e.target.value) })} /><small>{rules.fxHours ? `${rules.fxHours.toLocaleString('fa-IR')} ساعت` : 'بدون مهلت زمانی'}</small></label>
          <label className="sa-field"><span>اگر نرخ بیش از این بالا رفت (تومان)</span><input className="input num" type="number" min={0} step={500} value={rules.fxJumpToman} onChange={(e) => set({ fxJumpToman: numberOf(e.target.value) })} /><small>{rules.fxJumpToman ? `${rules.fxJumpToman.toLocaleString('fa-IR')} تومان افزایش نرخ` : 'با نوسان نرخ بسته نمی‌شود'}</small></label>
          <label className="sa-field"><span>آنگاه</span><select className="select" value={rules.fxAction} onChange={(e) => set({ fxAction: e.target.value as 'void' | 'delete' })}><option value="delete">بسته و حذف شود</option><option value="void">بسته شود (باطل، برای سابقه بماند)</option></select></label>
        </div>
      </div>
    </article>
    <article className="ivd-rule">
      <span className="ivd-rule-icon"><Icon name="clock" size={22} /></span>
      <div className="ivd-rule-body">
        <h3>فاکتورهای سررسید‌گذشته</h3>
        <label className="sa-check"><input type="checkbox" checked={rules.overdueEnabled} onChange={(e) => set({ overdueEnabled: e.target.checked })} /> فاکتور پرداخت‌نشده پس از سررسید بسته شود</label>
        {rules.overdueEnabled && <div className="ivd-create-grid">
          <label className="sa-field"><span>چند ساعت پس از سررسید</span><input className="input num" type="number" min={1} value={rules.overdueHours} onChange={(e) => set({ overdueHours: numberOf(e.target.value) })} /><small>{rules.overdueHours >= 24 ? `${(rules.overdueHours / 24).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} روز` : `${rules.overdueHours.toLocaleString('fa-IR')} ساعت`}</small></label>
          <label className="sa-field"><span>آنگاه</span><select className="select" value={rules.overdueAction} onChange={(e) => set({ overdueAction: e.target.value as 'void' | 'delete' })}><option value="void">بسته شود (باطل)</option><option value="delete">بسته و حذف شود</option></select></label>
        </div>}
        <p className="ivd-hint">فاکتوری که برایش «بسته شدن خودکار» تعیین کرده‌اید، در زمان خودش بسته می‌شود.</p>
      </div>
    </article>
    {notice && <p className={notice.ok ? 'ivd-notice is-ok' : 'ivd-notice is-bad'} role="status">{notice.text}</p>}
    <div className="ivd-create-foot"><button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیرهٔ قانون‌ها</button></div>
  </section>
}
