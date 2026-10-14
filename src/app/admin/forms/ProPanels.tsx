'use client'

import { useState } from 'react'
import { CHOICE_TYPES, FX_CURRENCIES, STAGES, STAGE_LABEL, THEMES, THEME_LABEL, type FormField, type FormSettings, type FormStyle, type Stage } from '@/modules/forms/domain/forms'
import type { Row } from './shared'

const fa = (n: number) => n.toLocaleString('fa-IR')
const num = (value: string) => (value === '' ? undefined : Number(value))

/** Settings: taking a payment for the form, and how the form looks. */
export function PaymentStylePanels({ s, set, fields = [] }: { s: FormSettings; set: (patch: Partial<FormSettings>) => void; fields?: FormField[] }) {
  // Answers an invoice may quote; passwords, files and signatures never reach it.
  const fieldTags = fields.filter((field) => !['secret', 'file', 'signature', 'heading', 'paragraph', 'repeater'].includes(field.type)).map((field) => ({ tag: `{field:${field.id}}`, label: field.label }))
  const style = (patch: Partial<FormStyle>) => set({ style: { ...s.style, ...patch } })
  return <>
    <section className="sa-card">
      <header className="sa-card-head"><h2>پرداخت</h2>{s.payment.enabled && <span className="sa-tag is-deal">فعال</span>}</header>
      <label className="sa-check"><input type="checkbox" checked={s.payment.enabled} onChange={(e) => set({ payment: { ...s.payment, enabled: e.target.checked }, ...(e.target.checked ? { requireLogin: true } : {}) })} /> این فرم پرداخت دارد</label>
      <p className="sa-hint">جمع فیلدهای قیمت‌دار (هزینهٔ ثابت، مبلغ ارزی با نرخ روز، گزینه‌های قیمت‌دار) از کاربر گرفته می‌شود: با درگاه‌ها و کیف پول سایت، با فاکتور. پس از پرداخت، درخواست در «پاسخ‌ها» برای کارشناس باز می‌شود. فرم پرداختی فقط برای کاربر واردشده است و کد تخفیف روی آن اعمال نمی‌شود.</p>
      {s.payment.enabled && <label className="sa-field"><span>متن دکمهٔ پرداخت</span><input className="input" value={s.payment.label} maxLength={40} placeholder="پرداخت" onChange={(e) => set({ payment: { ...s.payment, label: e.target.value } })} /></label>}
      {s.payment.enabled && <div className="fp-invoice">
        <label className="sa-field"><span>شرح فاکتور</span><input className="input" value={s.payment.invoiceTitle || ''} maxLength={120} placeholder="مثلاً: پرداخت سایت خارجی" onChange={(e) => set({ payment: { ...s.payment, invoiceTitle: e.target.value } })} /></label>
        <label className="sa-field"><span>توضیحات فاکتور</span><textarea className="input" rows={2} value={s.payment.invoiceText || ''} maxLength={500} placeholder="مثلاً: پرداخت {field:amount} در سایت {field:site} برای حساب {field:username}" onChange={(e) => set({ payment: { ...s.payment, invoiceText: e.target.value } })} /></label>
        <p className="sa-hint">این دو، ردیف فاکتور مشتری را می‌سازند. رمزها هرگز در فاکتور نمی‌آیند؛ اگر خالی بماند، عنوان فرم و شمارهٔ درخواست نوشته می‌شود. برای آوردن پاسخ‌ها، برچسب را در متن بگذارید:</p>
        <div className="fp-invoice-tags">{[...fieldTags, { tag: '{form_title}', label: 'عنوان فرم' }, { tag: '{entry_id}', label: 'شمارهٔ درخواست' }].map((item) => <span key={item.tag}><code dir="ltr">{item.tag}</code>{item.label}</span>)}</div>
      </div>}
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>ظاهر فرم</h2></header>
      <div className="fp-themes" role="radiogroup" aria-label="پوسته">
        {THEMES.map((theme) => <button key={theme} type="button" role="radio" aria-checked={s.style.theme === theme} className={`fp-theme is-${theme}`} onClick={() => style({ theme })}><i aria-hidden="true"><b /><b /><em /></i>{THEME_LABEL[theme]}</button>)}
      </div>
      <div className="ad-fields">
        <label className="sa-field"><span>رنگ اصلی</span><span className="fp-color"><input type="color" value={s.style.accent || '#6d4aff'} onChange={(e) => style({ accent: e.target.value })} aria-label="رنگ اصلی" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => style({ accent: '' })} disabled={!s.style.accent}>رنگ سایت</button></span></label>
        <label className="sa-field"><span>گوشه‌ها</span><select className="input" value={s.style.radius} onChange={(e) => style({ radius: e.target.value as FormStyle['radius'] })}><option value="sharp">تیز</option><option value="soft">نرم</option><option value="round">گرد</option></select></label>
        <label className="sa-field"><span>فاصله‌ها</span><select className="input" value={s.style.density} onChange={(e) => style({ density: e.target.value as FormStyle['density'] })}><option value="comfortable">راحت</option><option value="compact">فشرده</option></select></label>
        <label className="sa-field"><span>عرض فرم</span><select className="input" value={s.style.width} onChange={(e) => style({ width: e.target.value as FormStyle['width'] })}><option value="narrow">باریک</option><option value="normal">معمولی</option><option value="wide">عریض</option></select></label>
        <label className="sa-field"><span>نمایش مرحله‌ها</span><select className="input" value={s.style.progress} onChange={(e) => style({ progress: e.target.value as FormStyle['progress'] })}><option value="steps">شماره و عنوان</option><option value="bar">نوار پیشرفت</option><option value="dots">نقطه‌ها</option></select></label>
      </div>
    </section>
  </>
}

/** Inspector: what the newer field kinds need (prices of options, a fixed cost, a foreign amount, a slider, a hidden value). */
export function ProFieldProps({ field, patch }: { field: FormField; patch: (value: Partial<FormField>) => void }) {
  const options = field.options.map((option) => option.trim()).filter(Boolean)
  const currencies = field.currencies || ['USD']
  return <>
    {CHOICE_TYPES.includes(field.type) && <fieldset className="fb-logic"><legend>قیمت گزینه‌ها (تومان)</legend>
      <p className="sa-hint">اگر انتخاب گزینه هزینه دارد، مبلغش را بنویسید؛ در فرم پرداختی به جمع اضافه می‌شود. خالی یا صفر = رایگان.</p>
      {options.map((option, index) => <label key={`${index}-${option}`} className="fp-price"><span>{option}</span><input className="input" dir="ltr" inputMode="numeric" value={field.prices?.[index] || ''} placeholder="0" onChange={(e) => { const prices = options.map((_, at) => (at === index ? Math.max(0, Math.trunc(Number(e.target.value)) || 0) : field.prices?.[at] || 0)); patch({ prices: prices.some((price) => price > 0) ? prices : undefined }) }} /></label>)}
    </fieldset>}
    {field.type === 'price' && <label className="sa-field"><span>مبلغ (تومان)</span><input className="input" dir="ltr" inputMode="numeric" value={field.amount || ''} onChange={(e) => patch({ amount: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })} /></label>}
    {field.type === 'total' && <p className="sa-hint">جمع قابل پرداخت را همان‌جا که این فیلد قرار دارد نشان می‌دهد و با هر تغییر، با نرخ روز از سرور دوباره حساب می‌شود.</p>}
    {field.type === 'fxamount' && <>
      <div className="fp-checks" role="group" aria-label="ارزهای مجاز"><span>ارزهای مجاز</span>{FX_CURRENCIES.map((code) => <label key={code} className="sa-check"><input type="checkbox" checked={currencies.includes(code)} onChange={(e) => { const next = e.target.checked ? [...currencies, code] : currencies.filter((item) => item !== code); patch({ currencies: next.length ? next : ['USD'] }) }} />{code}</label>)}</div>
      <div className="fb-two">
        <label className="sa-field"><span>درصد سود</span><input className="input" dir="ltr" inputMode="decimal" value={field.markupPercent ?? ''} placeholder="5" onChange={(e) => patch({ markupPercent: num(e.target.value) })} /></label>
        <label className="sa-field"><span>سود ثابت (تومان)</span><input className="input" dir="ltr" inputMode="numeric" value={field.markupFixed ?? ''} placeholder="150000" onChange={(e) => patch({ markupFixed: num(e.target.value) })} /></label>
        <label className="sa-field"><span>حداقل مبلغ ارزی</span><input className="input" dir="ltr" inputMode="numeric" value={field.min ?? ''} onChange={(e) => patch({ min: num(e.target.value) })} /></label>
        <label className="sa-field"><span>حداکثر مبلغ ارزی</span><input className="input" dir="ltr" inputMode="numeric" value={field.max ?? ''} onChange={(e) => patch({ max: num(e.target.value) })} /></label>
      </div>
      <p className="sa-hint">هزینه = مبلغ کاربر × نرخ روز (از بخش «نرخ ارز») + درصد سود + سود ثابت. درصد و سود ثابت به بازدیدکننده نشان داده نمی‌شود.</p>
    </>}
    {field.type === 'slider' && <div className="fb-two">
      <label className="sa-field"><span>کمینه</span><input className="input" type="number" value={field.min ?? 0} onChange={(e) => patch({ min: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>بیشینه</span><input className="input" type="number" value={field.max ?? 100} onChange={(e) => patch({ max: Number(e.target.value) })} /></label>
    </div>}
    {field.type === 'hidden' && <label className="sa-field"><span>مقدار ثابت</span><input className="input" value={field.value || ''} maxLength={300} onChange={(e) => patch({ value: e.target.value })} /><small className="sa-hint">بازدیدکننده آن را نمی‌بیند؛ با هر پاسخ ذخیره می‌شود (مثلاً نام کمپین).</small></label>}
    {field.type === 'secret' && <p className="sa-hint">رمزنگاری‌شده ذخیره می‌شود، در فهرست‌ها و خروجی‌ها پوشیده است، مشاهده‌اش با نام کارمند ثبت می‌شود و یک هفته پس از پایان کار خودکار پاک می‌شود.</p>}
  </>
}

type Api = <T>(url: string, method: 'GET' | 'PATCH' | 'DELETE', body?: unknown) => Promise<{ ok: true; data: T } | { ok: false; error: string }>

/** One answer as a piece of work: its bill and payment, who has it, where it stands, the reply to its sender, and its passwords. */
export function WorkPanel({ row, api, onChanged, onNotice }: { row: Row; api: Api; onChanged: () => void; onNotice: (tone: 'ok' | 'error', text: string) => void }) {
  const [reply, setReply] = useState(row.reply)
  const [secrets, setSecrets] = useState<{ id: string; label: string; value: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const unpaid = row.payStatus === 'UNPAID'

  async function work(body: { stage?: Stage; take?: boolean; reply?: string }, done: string) {
    setBusy(true)
    const result = await api('/api/admin/forms/submissions', 'PATCH', { id: row.id, work: body })
    setBusy(false)
    onNotice(result.ok ? 'ok' : 'error', result.ok ? done : result.error)
    if (result.ok) onChanged()
  }
  async function reveal() {
    setBusy(true)
    const result = await api<{ secrets: { id: string; label: string; value: string }[] }>('/api/admin/forms/submissions', 'PATCH', { id: row.id, secrets: 'reveal' })
    setBusy(false)
    if (result.ok) setSecrets(result.data.secrets); else onNotice('error', result.error)
  }
  async function erase() {
    if (!window.confirm('اطلاعات محرمانهٔ این پاسخ پاک شود؟ این کار برگشت ندارد.')) return
    const result = await api('/api/admin/forms/submissions', 'PATCH', { id: row.id, secrets: 'erase' })
    onNotice(result.ok ? 'ok' : 'error', result.ok ? 'اطلاعات محرمانه پاک شد.' : result.error)
    if (result.ok) { setSecrets(null); onChanged() }
  }

  return <div className="fp-work">
    {row.amount > 0 && <div className="fp-bill">
      <header><b>صورت‌حساب</b><span className={`sa-state ${unpaid ? 'is-warn' : 'is-info'}`}>{unpaid ? 'پرداخت‌نشده' : 'پرداخت‌شده'}</span></header>
      <ul>{row.lines.map((line) => <li key={line.id}><span>{line.label}{line.detail && <small> · {line.detail}</small>}</span><b className="num">{fa(line.amount)}</b></li>)}</ul>
      <footer><span>جمع</span><b className="num">{fa(row.amount)} تومان</b></footer>
      {row.orderId && <a className="sa-link" href={`/admin/orders?q=${row.orderId}`}>سفارش شمارهٔ {fa(row.orderId)}</a>}
    </div>}
    {(row.hasSecrets || row.secretsErasedAt) && <div className="fp-secrets">
      <b>اطلاعات محرمانه</b>
      {secrets ? <ul className="fp-secret-list">{secrets.map((secret) => <li key={secret.id}><span>{secret.label}</span><code dir="ltr">{secret.value}</code><button type="button" className="sa-link" onClick={() => void navigator.clipboard.writeText(secret.value).then(() => onNotice('ok', 'کپی شد.')).catch(() => undefined)}>کپی</button></li>)}</ul> : null}
      {row.hasSecrets ? <div className="sa-row-actions">
        {!secrets && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void reveal()}>نمایش اطلاعات محرمانه</button>}
        <button type="button" className="sa-link is-danger" onClick={() => void erase()}>پاک‌کردن</button>
        <small className="sa-hint">مشاهده با نام شما ثبت می‌شود.</small>
      </div> : <p className="sa-hint">اطلاعات محرمانهٔ این پاسخ پاک شده است.</p>}
    </div>}
    <div className="fp-stage">
      <b>وضعیت کار</b>
      {unpaid ? <p className="sa-hint">تا پرداخت انجام نشود، کار روی این درخواست شروع نمی‌شود.</p> : <>
        <div className="ad-range" role="group" aria-label="وضعیت کار">{STAGES.map((stage) => <button key={stage} type="button" aria-pressed={row.stage === stage} disabled={busy} onClick={() => void work({ stage }, `وضعیت: ${STAGE_LABEL[stage]}`)}>{STAGE_LABEL[stage]}</button>)}</div>
        <p className="sa-hint">{row.assignee ? <>در دست: <b>{row.assignee}</b> </> : 'هنوز کسی این کار را برنداشته است. '}<button type="button" className="sa-link" disabled={busy} onClick={() => void work({ take: true }, 'این درخواست به شما سپرده شد.')}>من انجام می‌دهم</button>{row.assignee && <> · <button type="button" className="sa-link" disabled={busy} onClick={() => void work({ take: false }, 'آزاد شد.')}>آزاد کن</button></>}</p>
        {row.userId ? <>
          <label className="sa-field"><span>پیام به کاربر (در «درخواست‌های من» و صندوق پیام او)</span><textarea className="input" rows={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} dir="auto" /></label>
          <button type="button" className="btn btn-primary btn-sm fp-send" disabled={busy || reply === row.reply} onClick={() => void work({ reply }, 'پیام برای کاربر فرستاده شد.')}>ارسال پیام</button>
        </> : <p className="sa-hint">فرستنده مهمان بوده؛ پیگیری و پیام فقط برای کاربر واردشده ممکن است.</p>}
      </>}
    </div>
  </div>
}
