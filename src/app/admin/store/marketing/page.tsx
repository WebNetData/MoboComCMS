'use client'

import Link from '@/components/AppLink'
import { useState, type FormEvent } from 'react'
import { Notice, Pager, StoreShell, fa, faDate, send, useJson } from '../shared'

type Tone = { tone: 'ok' | 'error'; text: string } | null
type Tab = 'alerts' | 'carts' | 'gifts' | 'club' | 'installments'
const TABS: [Tab, string][] = [['alerts', 'موجود شد خبرم کن'], ['carts', 'سبدهای رهاشده'], ['gifts', 'کارت هدیه'], ['club', 'باشگاه مشتریان'], ['installments', 'خرید اقساطی']]
const API = '/api/admin/store/marketing'
const toman = (value: number) => `${fa(Math.round(value))} تومان`

function Kpis({ items }: { items: [string, string, string?][] }) {
  return <div className="sa-kpis">{items.map(([label, value, hint]) => <div key={label} className="sa-kpi"><small>{label}</small><b className="num">{value}</b>{hint && <span>{hint}</span>}</div>)}</div>
}

// ------------------------------------------------------------------ back in stock

type AlertRow = { productId: number; variantId: number; name: string; variantName: string; slug: string; image: string; stock: number; waiting: number; since: string }
function Alerts() {
  const { data, error, reload } = useJson<{ pendingTotal: number; notified30: number; rows: AlertRow[] }>(`${API}?view=alerts`)
  const [notice, setNotice] = useState<Tone>(null)
  async function runNow() {
    const result = await send<{ results: ({ sent?: number } | null)[] }>(API, 'POST', { op: 'run-now' })
    setNotice(result.ok ? { tone: 'ok', text: `بررسی انجام شد؛ ${fa(result.data.results[0]?.sent || 0)} اطلاع‌رسانی ارسال شد.` } : { tone: 'error', text: result.error })
    void reload()
  }
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  return <>
    <Kpis items={[['در انتظار موجودی', fa(data.pendingTotal), 'مشتری منتظر'], ['اطلاع‌رسانی ۳۰ روز اخیر', fa(data.notified30)], ['کالاهای پرتقاضا', fa(data.rows.length)]]} />
    <p className="sa-hint">وقتی موجودی کالا یا نوع آن از صفر بیشتر شود، هر دقیقه به همهٔ منتظرها با اعلان، ایمیل و (اگر در تنظیمات پیامک فعال باشد) پیامک خبر داده می‌شود. این فهرست نشان می‌دهد تأمین کدام کالا بیشترین تقاضا را دارد.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>کالاهایی که مشتری منتظرشان است</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => void runNow()}>بررسی و ارسال اکنون</button></header>
      <table className="data sa-table" style={{ minWidth: 620 }}><thead><tr><th>کالا</th><th>منتظر</th><th>موجودی فعلی</th><th>از</th><th /></tr></thead><tbody>
        {data.rows.map((row) => <tr key={`${row.productId}-${row.variantId}`}>
          <td><div className="sa-prod">{row.image ? <img src={row.image} alt="" width={40} height={40} /> : <span className="sa-prod-ph" />}<div><b>{row.name}</b>{row.variantName && <small>{row.variantName}</small>}</div></div></td>
          <td><span className="sa-state is-warn num">{fa(row.waiting)} نفر</span></td>
          <td className="num">{row.stock === -1 ? 'نامحدود' : fa(row.stock)}</td>
          <td><small>{row.since ? faDate(row.since) : '—'}</small></td>
          <td><Link className="sa-link" href={`/admin/store/products?q=${encodeURIComponent(row.name)}`}>تأمین موجودی</Link></td>
        </tr>)}
        {!data.rows.length && <tr><td colSpan={5} className="sa-empty">هیچ مشتری منتظر کالای ناموجودی نیست.</td></tr>}
      </tbody></table>
    </section>
  </>
}

// ------------------------------------------------------------------ abandoned carts

type RecoveryStep = { afterHours: number; couponCode: string; message: string }
type RecoverySettings = { enabled: boolean; steps: RecoveryStep[]; minValueToman: number; maxAgeDays: number }
type CartsData = { settings: RecoverySettings; reminders30: number; recovered30: number; recoveredPaid30: number; recoveredValue30: number; carts: { id: number; updatedAt: string; reminders: number; remindedAt: string | null; user: { id: number; name: string; email: string; phone: string } | null; items: number; value: number; currency: string; names: string[] }[] }

function RecoveryForm({ initial, onSaved }: { initial: RecoverySettings; onSaved: () => void }) {
  const [form, setForm] = useState(initial)
  const [notice, setNotice] = useState<Tone>(null)
  const setStep = (index: number, patch: Partial<RecoveryStep>) => setForm({ ...form, steps: form.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) })
  async function save(event: FormEvent) {
    event.preventDefault()
    const result = await send(API, 'POST', { op: 'recovery-settings', settings: form })
    setNotice(result.ok ? { tone: 'ok', text: 'تنظیمات یادآوری ذخیره شد.' } : { tone: 'error', text: result.error })
    if (result.ok) onSaved()
  }
  return <form className="sa-card sa-form" onSubmit={save}>
    <header className="sa-card-head"><h2>یادآوری خودکار</h2><label className="sa-check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> <span>فعال</span></label></header>
    <p className="sa-hint">برای مشتریانی که وارد حساب شده‌اند و کالا در سبد گذاشته ولی خرید نکرده‌اند. زمان‌ها از آخرین تغییر سبد حساب می‌شود و اگر مشتری خرید کند یادآوری متوقف می‌شود.</p>
    {form.steps.map((step, index) => <fieldset key={index} className="sa-fieldset">
      <legend>یادآوری {fa(index + 1)}</legend>
      <div className="sa-cols">
        <label className="sa-field"><span>چند ساعت بعد</span><input className="input num" type="number" min={1} value={step.afterHours} onChange={(e) => setStep(index, { afterHours: Number(e.target.value) })} /></label>
        <label className="sa-field"><span>کد تخفیف پیشنهادی (اختیاری)</span><input className="input" dir="ltr" value={step.couponCode} onChange={(e) => setStep(index, { couponCode: e.target.value.toUpperCase() })} placeholder="CART10" /></label>
      </div>
      <label className="sa-field"><span>متن پیام</span><input className="input" value={step.message} onChange={(e) => setStep(index, { message: e.target.value })} maxLength={200} /></label>
      {form.steps.length > 1 && <button type="button" className="sa-link is-danger" onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) })}>حذف این مرحله</button>}
    </fieldset>)}
    {form.steps.length < 3 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, steps: [...form.steps, { afterHours: (form.steps.at(-1)?.afterHours || 24) * 3, couponCode: '', message: 'هنوز فرصت دارید خریدتان را کامل کنید.' }] })}>افزودن مرحله</button>}
    <div className="sa-cols">
      <label className="sa-field"><span>حداقل ارزش سبد (تومان)</span><input className="input num" type="number" min={0} value={form.minValueToman} onChange={(e) => setForm({ ...form, minValueToman: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>سبدهای قدیمی‌تر از (روز) نادیده گرفته شوند</span><input className="input num" type="number" min={1} max={60} value={form.maxAgeDays} onChange={(e) => setForm({ ...form, maxAgeDays: Number(e.target.value) })} /></label>
    </div>
    <p className="sa-hint">کد تخفیف را اول در «کدهای تخفیف» بسازید. کانال‌های ارسال (پیامک/ایمیل) در تنظیمات همان بخش‌ها با رویداد «یادآوری سبد خرید رهاشده» روشن می‌شوند.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <button type="submit" className="btn btn-primary">ذخیره</button>
  </form>
}

function Carts() {
  const { data, error, reload } = useJson<CartsData>(`${API}?view=carts`)
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  const rate = data.reminders30 ? Math.round((data.recovered30 / data.reminders30) * 100) : 0
  return <>
    <Kpis items={[['یادآوری ۳۰ روز', fa(data.reminders30)], ['سبدهای بازگشته', fa(data.recovered30), `نرخ بازگشت ${fa(rate)}٪`], ['سفارش پرداخت‌شده', fa(data.recoveredPaid30)], ['فروش بازگردانده', toman(data.recoveredValue30)]]} />
    <div className="sa-cols sa-cols-wide">
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>سبدهای رهاشده</h2><small>{fa(data.carts.length)} سبد در ۳۰ روز اخیر</small></header>
        <table className="data sa-table" style={{ minWidth: 640 }}><thead><tr><th>مشتری</th><th>کالاها</th><th>ارزش</th><th>آخرین تغییر</th><th>یادآوری</th></tr></thead><tbody>
          {data.carts.map((cart) => <tr key={cart.id}>
            <td>{cart.user ? <Link className="sa-link" href={`/admin/users/${cart.user.id}`}>{cart.user.name || cart.user.email}</Link> : '—'}{cart.user?.phone && <><br /><small dir="ltr">{cart.user.phone}</small></>}</td>
            <td><small>{cart.names.join('، ')}{cart.items > cart.names.length ? '…' : ''}</small></td>
            <td className="num">{toman(cart.value)}</td>
            <td><small>{faDate(cart.updatedAt, true)}</small></td>
            <td>{cart.reminders ? <span className="sa-state is-info">{fa(cart.reminders)} بار</span> : <span className="sa-state">نه هنوز</span>}</td>
          </tr>)}
          {!data.carts.length && <tr><td colSpan={5} className="sa-empty">سبد رهاشده‌ای نیست.</td></tr>}
        </tbody></table>
      </section>
      <RecoveryForm key={JSON.stringify(data.settings)} initial={data.settings} onSaved={() => void reload()} />
    </div>
  </>
}

// ------------------------------------------------------------------ gift cards

type GiftRow = { id: number; last4: string; amount: number; state: string; source: string; note: string; recipientName: string; recipientEmail: string; purchaser: { id: number; name: string; email: string } | null; redeemer: { id: number; name: string; email: string } | null; createdAt: string; expiresAt: string | null; redeemedAt: string | null }
type GiftSettings = { purchaseEnabled: boolean; amounts: number[]; minToman: number; maxToman: number; validityDays: number }
type GiftData = { settings: GiftSettings; page: number; pages: number; total: number; outstanding: { count: number; amount: number }; redeemed: { count: number; amount: number }; rows: GiftRow[] }
const GIFT_STATE: Record<string, [string, string]> = { ACTIVE: ['فعال', 'is-ok'], REDEEMED: ['استفاده شد', 'is-info'], DISABLED: ['غیرفعال', 'is-bad'], EXPIRED: ['منقضی', 'is-warn'] }

function IssueForm({ onIssued }: { onIssued: () => void }) {
  const [form, setForm] = useState({ count: 1, toman: 500000, days: 365, note: '', recipientName: '', recipientEmail: '', message: '' })
  const [codes, setCodes] = useState<string[]>([])
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const result = await send<{ cards: { id: number; code: string }[] }>(API, 'POST', { op: 'gift-issue', ...form })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setCodes(result.data.cards.map((card) => card.code)); onIssued()
    setNotice({ tone: 'ok', text: `${fa(result.data.cards.length)} کارت صادر شد.` })
  }
  const csv = () => {
    const blob = new Blob([`code,amount_toman\n${codes.map((code) => `${code},${form.toman}`).join('\n')}\n`], { type: 'text/csv' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `gift-cards-${Date.now()}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }
  return <form className="sa-card sa-form" onSubmit={submit}>
    <header className="sa-card-head"><h2>صدور کارت هدیه</h2></header>
    <div className="sa-cols">
      <label className="sa-field"><span>مبلغ (تومان)</span><input className="input num" type="number" min={1000} value={form.toman} onChange={(e) => setForm({ ...form, toman: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>تعداد</span><input className="input num" type="number" min={1} max={500} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} /></label>
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>اعتبار (روز، ۰ = بدون انقضا)</span><input className="input num" type="number" min={0} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>یادداشت داخلی</span><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="کمپین نوروز" /></label>
    </div>
    {form.count === 1 && <>
      <div className="sa-cols">
        <label className="sa-field"><span>نام گیرنده</span><input className="input" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} /></label>
        <label className="sa-field"><span>ایمیل گیرنده (کارت ایمیل می‌شود)</span><input className="input" dir="ltr" type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} /></label>
      </div>
      <label className="sa-field"><span>پیام</span><input className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={300} /></label>
    </>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {codes.length > 0 && <div className="sa-codes">
      <ul dir="ltr">{codes.slice(0, 20).map((code) => <li key={code}><code>{code}</code></li>)}{codes.length > 20 && <li>…</li>}</ul>
      <div className="sa-head-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>کپی همه</button><button type="button" className="btn btn-ghost btn-sm" onClick={csv}>دانلود CSV</button></div>
    </div>}
    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال صدور…' : 'صدور'}</button>
  </form>
}

function GiftSettingsForm({ initial, onSaved }: { initial: GiftSettings; onSaved: () => void }) {
  const [form, setForm] = useState({ ...initial, amountsText: initial.amounts.join('، ') })
  const [notice, setNotice] = useState<Tone>(null)
  async function save(event: FormEvent) {
    event.preventDefault()
    const amounts = form.amountsText.split(/[,،\s]+/).map((value) => Number(value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))).filter(Boolean)
    const result = await send(API, 'POST', { op: 'gift-settings', settings: { ...form, amounts } })
    setNotice(result.ok ? { tone: 'ok', text: 'ذخیره شد.' } : { tone: 'error', text: result.error })
    if (result.ok) onSaved()
  }
  return <form className="sa-card sa-form" onSubmit={save}>
    <header className="sa-card-head"><h2>خرید کارت هدیه توسط مشتری</h2><label className="sa-check"><input type="checkbox" checked={form.purchaseEnabled} onChange={(e) => setForm({ ...form, purchaseEnabled: e.target.checked })} /> <span>فعال</span></label></header>
    <label className="sa-field"><span>مبالغ پیشنهادی (تومان، با کاما)</span><input className="input" dir="ltr" value={form.amountsText} onChange={(e) => setForm({ ...form, amountsText: e.target.value })} /></label>
    <div className="sa-cols">
      <label className="sa-field"><span>حداقل مبلغ</span><input className="input num" type="number" value={form.minToman} onChange={(e) => setForm({ ...form, minToman: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>حداکثر مبلغ</span><input className="input num" type="number" value={form.maxToman} onChange={(e) => setForm({ ...form, maxToman: Number(e.target.value) })} /></label>
    </div>
    <label className="sa-field"><span>اعتبار کارت‌های خریداری‌شده (روز)</span><input className="input num" type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: Number(e.target.value) })} /></label>
    <p className="sa-hint">مشتری از «کارت هدیه» در حساب کاربری، با موجودی کیف پول کارت می‌خرد؛ گیرنده کد را وارد می‌کند و مبلغ به کیف پولش اضافه می‌شود.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <button type="submit" className="btn btn-primary">ذخیره</button>
  </form>
}

function Gifts() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useJson<GiftData>(`${API}?view=gifts&status=${status}&page=${page}`)
  const [notice, setNotice] = useState<Tone>(null)
  async function act(body: Record<string, unknown>, text?: string) {
    const result = await send<{ code?: string }>(API, 'POST', body)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    if (result.data.code) window.prompt('کد کارت (کپی کنید):', result.data.code)
    else if (text) setNotice({ tone: 'ok', text })
    void reload()
  }
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  return <>
    <Kpis items={[['کارت‌های فعال', fa(data.outstanding.count), toman(data.outstanding.amount)], ['استفاده‌شده', fa(data.redeemed.count), toman(data.redeemed.amount)], ['کل کارت‌ها', fa(data.total)]]} />
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="sa-cols sa-cols-wide">
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>کارت‌ها</h2>
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="وضعیت"><option value="">همه</option><option value="ACTIVE">فعال</option><option value="REDEEMED">استفاده‌شده</option><option value="EXPIRED">منقضی</option><option value="DISABLED">غیرفعال</option></select>
        </header>
        <table className="data sa-table" style={{ minWidth: 700 }}><thead><tr><th>کد</th><th>مبلغ</th><th>وضعیت</th><th>منبع</th><th>استفاده‌کننده</th><th>تاریخ</th><th /></tr></thead><tbody>
          {data.rows.map((row) => { const [label, tone] = GIFT_STATE[row.state] || [row.state, '']; return <tr key={row.id}>
            <td dir="ltr"><code>••••-{row.last4}</code>{row.note && <><br /><small dir="auto">{row.note}</small></>}</td>
            <td className="num">{toman(row.amount)}</td>
            <td><span className={`sa-state ${tone}`}>{label}</span></td>
            <td><small>{row.source === 'PURCHASE' ? `خرید ${row.purchaser?.name || row.purchaser?.email || ''}` : 'صدور مدیر'}{row.recipientName || row.recipientEmail ? ` → ${row.recipientName || row.recipientEmail}` : ''}</small></td>
            <td><small>{row.redeemer ? row.redeemer.name || row.redeemer.email : '—'}</small></td>
            <td><small>{faDate(row.redeemedAt || row.createdAt)}</small>{row.expiresAt && row.state === 'ACTIVE' && <><br /><small className="sa-hint">تا {faDate(row.expiresAt)}</small></>}</td>
            <td className="sp-row-actions">
              <button type="button" className="sa-link" onClick={() => void act({ op: 'gift-reveal', id: row.id })}>نمایش کد</button>
              {row.state === 'ACTIVE' && <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm('این کارت غیرفعال شود؟')) void act({ op: 'gift-status', id: row.id, disabled: true }, 'کارت غیرفعال شد.') }}>غیرفعال</button>}
              {row.state === 'DISABLED' && <button type="button" className="sa-link" onClick={() => void act({ op: 'gift-status', id: row.id, disabled: false }, 'کارت فعال شد.')}>فعال‌سازی</button>}
            </td>
          </tr> })}
          {!data.rows.length && <tr><td colSpan={7} className="sa-empty">کارتی نیست.</td></tr>}
        </tbody></table>
        <Pager page={data.page} pages={data.pages} onPage={setPage} />
      </section>
      <div className="sa-stack">
        <IssueForm onIssued={() => void reload()} />
        <GiftSettingsForm key={JSON.stringify(data.settings)} initial={data.settings} onSaved={() => void reload()} />
      </div>
    </div>
  </>
}

// ------------------------------------------------------------------ customer club

type TierRow = { id: string; name: string; minLifetime: number; multiplier: number; color: string; perks: string }
type LoyaltySettings = { enabled: boolean; earnPoints: number; earnStepToman: number; pointValueToman: number; minRedeem: number; signupBonus: number; reviewBonus: number; tiers: TierRow[]; since: string }
type ClubData = { settings: LoyaltySettings; members: number; outstanding: number; lifetime: number; outstandingValue: number; tiers: (TierRow & { count: number })[]; top: { userId: number; name: string; balance: number; lifetime: number; tier: string }[]; recent: { id: number; userId: number; name: string; points: number; kind: string; note: string; createdAt: string }[] }

function LoyaltyForm({ initial, onSaved }: { initial: LoyaltySettings; onSaved: () => void }) {
  const [form, setForm] = useState(initial)
  const [notice, setNotice] = useState<Tone>(null)
  const num = (key: keyof LoyaltySettings) => ({ value: form[key] as number, onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: Number(e.target.value) }) })
  const setTier = (index: number, patch: Partial<TierRow>) => setForm({ ...form, tiers: form.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) })
  async function save(event: FormEvent) {
    event.preventDefault()
    const result = await send(API, 'POST', { op: 'loyalty-settings', settings: form })
    setNotice(result.ok ? { tone: 'ok', text: 'قوانین باشگاه ذخیره شد.' } : { tone: 'error', text: result.error })
    if (result.ok) onSaved()
  }
  return <form className="sa-card sa-form" onSubmit={save}>
    <header className="sa-card-head"><h2>قوانین باشگاه</h2><label className="sa-check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> <span>فعال</span></label></header>
    {form.since && <p className="sa-hint">امتیاز سفارش‌های پرداخت‌شده از {faDate(form.since)} به بعد محاسبه می‌شود.</p>}
    <div className="sa-cols">
      <label className="sa-field"><span>امتیاز به ازای هر</span><input className="input num" type="number" min={0} {...num('earnPoints')} /></label>
      <label className="sa-field"><span>… تومان خرید</span><input className="input num" type="number" min={100} {...num('earnStepToman')} /></label>
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>ارزش هر امتیاز (تومان)</span><input className="input num" type="number" min={0} {...num('pointValueToman')} /></label>
      <label className="sa-field"><span>حداقل امتیاز برای تبدیل</span><input className="input num" type="number" min={1} {...num('minRedeem')} /></label>
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>هدیهٔ عضویت (امتیاز)</span><input className="input num" type="number" min={0} {...num('signupBonus')} /></label>
      <label className="sa-field"><span>امتیاز نظر تأییدشده</span><input className="input num" type="number" min={0} {...num('reviewBonus')} /></label>
    </div>
    <p className="sa-hint">مثال: {fa(form.earnPoints)} امتیاز برای هر {fa(form.earnStepToman)} تومان یعنی خرید ۱ میلیون تومانی = {fa(Math.floor(1_000_000 / Math.max(1, form.earnStepToman)) * form.earnPoints)} امتیاز ≈ {toman(Math.floor(1_000_000 / Math.max(1, form.earnStepToman)) * form.earnPoints * form.pointValueToman)} اعتبار ({fa(Math.round((form.earnPoints * form.pointValueToman / Math.max(1, form.earnStepToman)) * 1000) / 10)}٪ بازگشت).</p>
    <fieldset className="sa-fieldset">
      <legend>سطح‌ها</legend>
      {form.tiers.map((tier, index) => <div key={index} className="sa-tier-row">
        <input type="color" value={tier.color} onChange={(e) => setTier(index, { color: e.target.value })} aria-label="رنگ" />
        <input className="input" value={tier.name} onChange={(e) => setTier(index, { name: e.target.value })} aria-label="نام سطح" />
        <input className="input num" type="number" min={0} value={tier.minLifetime} disabled={index === 0} onChange={(e) => setTier(index, { minLifetime: Number(e.target.value) })} aria-label="حداقل امتیاز کل" title="حداقل امتیاز کسب‌شده" placeholder="از امتیاز" />
        <input className="input num" type="number" min={0.1} step={0.05} value={tier.multiplier} onChange={(e) => setTier(index, { multiplier: Number(e.target.value) })} aria-label="ضریب امتیاز" title="ضریب امتیاز" />
        <input className="input" value={tier.perks} onChange={(e) => setTier(index, { perks: e.target.value })} aria-label="مزایا" placeholder="مزایا" />
        {index > 0 && <button type="button" className="sa-link is-danger" onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, i) => i !== index) })}>حذف</button>}
      </div>)}
      {form.tiers.length < 8 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, tiers: [...form.tiers, { id: `t${Date.now()}`, name: 'سطح جدید', minLifetime: (form.tiers.at(-1)?.minLifetime || 0) * 2 || 1000, multiplier: 1, color: '#8f9bab', perks: '' }] })}>افزودن سطح</button>}
      <small className="sa-hint">هر سطح: رنگ و نام · حداقل امتیاز کسب‌شده (کل تاریخچه) و ضریب امتیاز خرید · مزایا</small>
    </fieldset>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <button type="submit" className="btn btn-primary">ذخیره</button>
  </form>
}

const KIND: Record<string, string> = { EARN_ORDER: 'خرید', REVERSE_ORDER: 'برگشت', REDEEM: 'تبدیل', ADMIN: 'مدیر', BONUS: 'هدیه' }

function Club() {
  const { data, error, reload } = useJson<ClubData>(`${API}?view=club`)
  const [adjust, setAdjust] = useState({ userId: '', points: '', note: '' })
  const [notice, setNotice] = useState<Tone>(null)
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  async function submitAdjust(event: FormEvent) {
    event.preventDefault()
    const result = await send<{ balance: number }>(API, 'POST', { op: 'points-adjust', ...adjust })
    setNotice(result.ok ? { tone: 'ok', text: `ثبت شد؛ موجودی فعلی ${fa(result.data.balance)} امتیاز.` } : { tone: 'error', text: result.error })
    if (result.ok) { setAdjust({ userId: '', points: '', note: '' }); void reload() }
  }
  return <>
    <Kpis items={[['اعضای دارای امتیاز', fa(data.members)], ['امتیاز خرج‌نشده', fa(data.outstanding), `تعهد ${toman(data.outstandingValue)}`], ['کل امتیاز داده‌شده', fa(data.lifetime)]]} />
    <div className="sa-tier-strip">{data.tiers.map((tier) => <div key={tier.id} style={{ ['--tier' as string]: tier.color }}><i /><b>{tier.name}</b><span className="num">{fa(tier.count)} عضو</span></div>)}</div>
    <div className="sa-cols sa-cols-wide">
      <div className="sa-stack">
        <section className="sa-card sa-table-wrap">
          <header className="sa-card-head"><h2>برترین اعضا</h2></header>
          <table className="data sa-table" style={{ minWidth: 480 }}><thead><tr><th>مشتری</th><th>سطح</th><th>امتیاز فعلی</th><th>کل کسب‌شده</th></tr></thead><tbody>
            {data.top.map((row) => <tr key={row.userId}><td><Link className="sa-link" href={`/admin/users/${row.userId}`}>{row.name}</Link></td><td>{row.tier}</td><td className="num">{fa(row.balance)}</td><td className="num">{fa(row.lifetime)}</td></tr>)}
            {!data.top.length && <tr><td colSpan={4} className="sa-empty">هنوز امتیازی داده نشده است.</td></tr>}
          </tbody></table>
        </section>
        <section className="sa-card sa-table-wrap">
          <header className="sa-card-head"><h2>آخرین تراکنش‌های امتیاز</h2></header>
          <table className="data sa-table" style={{ minWidth: 520 }}><thead><tr><th>مشتری</th><th>نوع</th><th>شرح</th><th>امتیاز</th><th>زمان</th></tr></thead><tbody>
            {data.recent.map((row) => <tr key={row.id}><td>{row.name}</td><td>{KIND[row.kind] || row.kind}</td><td><small>{row.note}</small></td><td className={`num ${row.points > 0 ? 'success-text' : 'error-text'}`}>{row.points > 0 ? '+' : '−'}{fa(Math.abs(row.points))}</td><td><small>{faDate(row.createdAt, true)}</small></td></tr>)}
            {!data.recent.length && <tr><td colSpan={5} className="sa-empty">—</td></tr>}
          </tbody></table>
        </section>
        <form className="sa-card sa-form" onSubmit={submitAdjust}>
          <header className="sa-card-head"><h2>افزودن یا کسر دستی امتیاز</h2></header>
          <div className="sa-cols">
            <label className="sa-field"><span>شناسهٔ کاربر</span><input className="input num" value={adjust.userId} onChange={(e) => setAdjust({ ...adjust, userId: e.target.value })} /></label>
            <label className="sa-field"><span>امتیاز (منفی = کسر)</span><input className="input num" value={adjust.points} onChange={(e) => setAdjust({ ...adjust, points: e.target.value })} /></label>
          </div>
          <label className="sa-field"><span>توضیح</span><input className="input" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></label>
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          <button type="submit" className="btn btn-ghost" disabled={!adjust.userId || !adjust.points}>ثبت</button>
        </form>
      </div>
      <LoyaltyForm key={JSON.stringify(data.settings)} initial={data.settings} onSaved={() => void reload()} />
    </div>
  </>
}

function Installments() {
  return <section className="sa-card sa-form">
    <header className="sa-card-head"><h2>خرید اقساطی</h2></header>
    <p>اسنپ‌پی، دیجی‌پی (خرید اعتباری) و ازکی وام مثل یک درگاه پرداخت اضافه می‌شوند. پس از فعال‌سازی:</p>
    <ul className="sa-list">
      <li>در صفحهٔ هر کالا «خرید اقساطی: n قسط x تومانی» نمایش داده می‌شود.</li>
      <li>در پرداخت سفارش، مشتری درگاه اقساطی را انتخاب می‌کند و در سایت سرویس‌دهنده اعتبارسنجی و خرید را تأیید می‌کند.</li>
      <li>پرداخت پس از بازگشت تأیید (verify)، سفارش ثبت و سپس نهایی (settle/deliver) می‌شود؛ اگر سفارش قابل ثبت نباشد (مثلاً کالا تمام شده باشد) خرید اقساطی خودکار لغو می‌شود.</li>
      <li>مشتری باید شمارهٔ موبایل تأییدشده در حساب خود داشته باشد.</li>
    </ul>
    <p className="sa-hint">اطلاعات پذیرندگی (Client ID، Client Secret، نام کاربری و رمز؛ برای ازکی شناسهٔ پذیرنده و کلید API) را از سرویس‌دهنده بگیرید. پیش از استفادهٔ واقعی، «نشانی سرویس» را روی محیط آزمایشی (Sandbox) سرویس‌دهنده بگذارید و یک خرید آزمایشی کامل انجام دهید. نشانی بازگشت: <bdi dir="ltr">/api/payment/installment/&lt;provider&gt;/callback</bdi></p>
    <Link href="/admin/gateways" className="btn btn-primary">افزودن درگاه اقساطی</Link>
  </section>
}

export default function MarketingPage() {
  const [tab, setTab] = useState<Tab>('alerts')
  return <StoreShell title="بازاریابی و وفاداری">
    <nav className="sa-subtabs" aria-label="بخش‌ها">{TABS.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'alerts' && <Alerts />}
    {tab === 'carts' && <Carts />}
    {tab === 'gifts' && <Gifts />}
    {tab === 'club' && <Club />}
    {tab === 'installments' && <Installments />}
  </StoreShell>
}
