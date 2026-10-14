'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import CheckoutError from '@/components/CheckoutError'
import { fetchCheckoutGateways, startCheckout } from '@/modules/checkout/ui/client'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { DEFAULT_STYLE, checkSubmission, visibleFields, type Answer, type FormDefinition, type FormField, type FormState, type PriceLine } from '@/modules/forms/domain/forms'

type Bill = { lines: PriceLine[]; total: number }
type Pay = Bill & { submissionId: number; label: string }
const toman = (n: number) => Math.round(n).toLocaleString('fa-IR')

/** The bill as the server priced it: one line per cost, and the total. */
function BillBox({ bill, note, title }: { bill: Bill | null; note: string; title: string }) {
  return <div className="pf-bill pf-full" role="status" aria-live="polite">
    <span className="pf-bill-title">{title}</span>
    {bill && bill.total > 0 ? <>
      {bill.lines.length > 1 && <ul>{bill.lines.map((line) => <li key={line.id}><span>{line.label}{line.detail && <small> · {line.detail}</small>}</span><b className="num">{toman(line.amount)}</b></li>)}</ul>}
      {bill.lines.length === 1 && bill.lines[0].detail && <small dir="auto">{bill.lines[0].detail}</small>}
      <strong><b className="num">{toman(bill.total)}</b> تومان</strong>
    </> : <span className="pf-bill-empty">{note || 'با تکمیل فیلدهای مبلغ، هزینه همین‌جا محاسبه می‌شود.'}</span>}
  </div>
}

type Uploaded = { id: string; name: string; size: number }
const MB = 1024 * 1024
const kb = (size: number) => (size >= MB ? `${(size / MB).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت` : `${Math.max(1, Math.round(size / 1024)).toLocaleString('fa-IR')} کیلوبایت`)
const CLOSED: Record<Exclude<FormState, 'open'>, string> = { soon: 'این فرم هنوز باز نشده است.', closed: 'مهلت این فرم تمام شده است.', full: 'ظرفیت این فرم تکمیل شده است.' }

/**
 * A published form: steps with progress, fields that appear by condition, per-field errors,
 * file attachments and the anti-spam honeypot. Answers are checked here with the same rules the server applies.
 */
export default function PublicForm({ form, state = 'open', preview = false }: { form: FormDefinition; state?: FormState; preview?: boolean }) {
  const { locale } = useI18n()
  const uid = useId()
  const settings = form.settings
  const steps = settings?.steps || []
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [uploads, setUploads] = useState<Record<string, Uploaded[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState('')
  const [message, setMessage] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [sent, setSent] = useState(false)
  const [bill, setBill] = useState<Bill | null>(null)
  const [billNote, setBillNote] = useState('')
  const [pay, setPay] = useState<Pay | null>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<{ code: string; message: string; needed: number; currency?: string } | null>(null)
  const root = useRef<HTMLFormElement>(null)
  const style = settings?.style || DEFAULT_STYLE
  const paid = !!settings?.payment?.enabled
  const look = `pf-theme-${style.theme} pf-r-${style.radius} pf-d-${style.density} pf-w-${style.width} pf-p-${style.progress}`
  const vars = (style.accent ? { '--pf-accent': style.accent } : undefined) as CSSProperties | undefined

  // The bill follows what is typed; only the server knows today's rate and the margin.
  const priced = useMemo(() => JSON.stringify(form.fields.filter((f) => f.type === 'fxamount' || f.prices?.length).map((f) => answers[f.id] ?? '')), [form.fields, answers])
  useEffect(() => {
    if (!paid || preview || pay) return
    let live = true
    const timer = window.setTimeout(() => {
      void fetch(`/api/forms/${form.slug}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: answers }) })
        .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => null) }))
        .then(({ ok, data }) => { if (!live) return; if (ok) { setBill(data); setBillNote('') } else { setBill(null); setBillNote(String(data?.error || '')) } })
        .catch(() => { if (live) setBillNote('ارتباط برقرار نشد') })
    }, 400)
    return () => { live = false; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced, paid, preview, form.slug, pay])

  async function payNow() {
    if (!pay) return
    setPayBusy(true); setPayError(null)
    try {
      const gateways = await fetchCheckoutGateways('IRT')
      const gateway = gateways.find((row) => row.isDefault) || gateways[0]
      const result = await startCheckout({ formSubmissionId: pay.submissionId, gatewayRef: gateway?.ref })
      if (result.ok) {
        if (result.paid || result.invoiceUrl) window.location.assign(`/payment/result?invoice=${result.invoiceNumber}`)
        else if (result.paymentUrl) window.location.href = result.paymentUrl
        return
      }
      setPayError({ code: result.code, message: result.message, needed: result.needed, currency: result.currency })
    } catch { setPayError({ code: 'NETWORK_ERROR', message: 'ارتباط برقرار نشد؛ از «درخواست‌های من» دوباره پرداخت کنید.', needed: 0 }) } finally { setPayBusy(false) }
  }

  const shown = useMemo(() => visibleFields(form.fields, answers), [form.fields, answers])
  const stepFields = useCallback((index: number) => shown.filter((f) => (steps.length ? (f.step || steps[0].id) === steps[index]?.id : true)), [shown, steps])
  const current = stepFields(step)
  const last = !steps.length || step >= steps.length - 1

  function set(id: string, value: Answer) {
    setAnswers((a) => ({ ...a, [id]: value }))
    setErrors((e) => { if (!e[id]) return e; const { [id]: _drop, ...rest } = e; return rest })
  }

  function validate(fields: FormField[]) {
    const { errors: found } = checkSubmission(form.fields, answers)
    const mine = Object.fromEntries(fields.filter((f) => found[f.id]).map((f) => [f.id, found[f.id]]))
    setErrors(mine)
    const first = fields.find((f) => mine[f.id])
    if (first) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-field="${first.id}"] :is(input,textarea,select,button)`)?.focus())
    return !first
  }

  async function upload(f: FormField, file: File | undefined) {
    if (!file || preview) return
    setUploading(f.id); setErrors((e) => ({ ...e, [f.id]: '' }))
    const body = new FormData(); body.append('file', file, file.name)
    const response = await fetch(`/api/forms/${form.slug}/upload`, { method: 'POST', body }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setUploading('')
    if (!response?.ok) { setErrors((e) => ({ ...e, [f.id]: data?.error || 'بارگذاری فایل انجام نشد' })); return }
    setUploads((u) => ({ ...u, [f.id]: [...(u[f.id] || []), data] }))
    set(f.id, [...((answers[f.id] as string[]) || []), data.id])
  }
  function removeFile(f: FormField, id: string) {
    setUploads((u) => ({ ...u, [f.id]: (u[f.id] || []).filter((x) => x.id !== id) }))
    set(f.id, ((answers[f.id] as string[]) || []).filter((x) => x !== id))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!last) { if (validate(current)) { setStep(step + 1); root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } ; return }
    if (preview) { setMessage('پیش‌نمایش: در این نما فرم ارسال نمی‌شود.'); return }
    const all = shown
    if (!validate(all)) {
      // The problem may sit on an earlier step: go there.
      const bad = all.find((f) => checkSubmission(form.fields, answers).errors[f.id])
      if (bad && steps.length) setStep(Math.max(0, steps.findIndex((s) => s.id === (bad.step || steps[0].id))))
      return
    }
    setBusy(true); setMessage(''); setNeedsLogin(false)
    const honeypot = new FormData(event.currentTarget).get('website')
    try {
      const res = await fetch(`/api/forms/${form.slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: answers, website: honeypot }) })
      const result = await res.json()
      if (!res.ok) { if (res.status === 401) setNeedsLogin(true); throw new Error(result.error) }
      setMessage(result.message); setSent(true)
      if (result.pay) { setPay({ submissionId: result.pay.submissionId, lines: result.pay.lines || [], total: result.pay.amount, label: result.pay.label || '' }); return }
      if (result.redirect) window.location.assign(result.redirect)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'ارسال ناموفق؛ دوباره تلاش کنید') } finally { setBusy(false) }
  }

  const head = <><h2>{form.title}</h2>{form.description && <p className="muted">{form.description}</p>}</>
  if (state !== 'open') return <section className={`public-form card pf ${look}`} style={vars}>{head}<p className="pf-closed" role="status">{settings?.closedMessage || CLOSED[state]}</p></section>
  if (pay) return <section className={`public-form card pf ${look}`} style={vars}>{head}
    <div className="pf-pay">
      <p className="pf-pay-note">اطلاعات شما ثبت شد. برای این‌که کارشناس کار را شروع کند، پرداخت را انجام دهید.</p>
      <BillBox bill={pay} note="" title="مبلغ قابل پرداخت" />
      <button type="button" className="btn btn-primary pf-pay-btn" disabled={payBusy} onClick={() => void payNow()}>{payBusy ? 'در حال انتقال…' : pay.label || 'پرداخت'}</button>
      {payError && <CheckoutError code={payError.code} message={payError.message} needed={payError.needed} currency={payError.currency || 'IRT'} />}
      <small className="pf-help">مبلغ نهایی هنگام پرداخت با نرخ همان لحظه حساب می‌شود. این درخواست در <Link href="/dashboard/requests" className="text-link">درخواست‌های من</Link> می‌ماند و از همان‌جا هم قابل پرداخت است.</small>
    </div>
  </section>
  if (sent) return <section className={`public-form card pf ${look}`} style={vars}>{head}<div className="form-success" role="status">✓ {message}</div></section>

  return <form ref={root} onSubmit={submit} className={`public-form card pf ${look}`} style={vars} noValidate>
    {head}
    {steps.length > 1 && <nav className="pf-steps" aria-label="مراحل فرم"><ol>{steps.map((s, i) => <li key={s.id} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}><span>{(i + 1).toLocaleString('fa-IR')}</span>{s.title}</li>)}</ol><div className="pf-bar" aria-hidden="true"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div></nav>}
    {steps.length > 0 && steps[step]?.description && <p className="muted pf-step-note">{steps[step].description}</p>}
    <div className="form-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <div className="pf-grid">
      {current.map((f) => {
        const id = `${uid}-${f.id}`
        const error = errors[f.id]
        const describedBy = [f.help ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined
        const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': f.required || undefined }
        const value = answers[f.id]
        if (f.type === 'heading') return <h3 key={f.id} className="pf-heading pf-full">{f.label}</h3>
        if (f.type === 'paragraph') return <p key={f.id} className="pf-paragraph pf-full">{f.help}</p>
        if (f.type === 'hidden') return null
        if (f.type === 'price') return <div key={f.id} className="pf-cost pf-full"><span>{f.label}{f.help && <small>{f.help}</small>}</span><b className="num">{toman(f.amount || 0)} <small>تومان</small></b></div>
        if (f.type === 'total') return <BillBox key={f.id} bill={bill} note={preview ? 'در پیش‌نمایش محاسبه نمی‌شود؛ پس از انتشار با نرخ روز حساب می‌شود.' : billNote} title={f.label} />
        const priceOf = (option: string) => { const price = f.prices?.[f.options.indexOf(option)] || 0; return price > 0 ? <small className="pf-opt-price num">+{toman(price)} تومان</small> : null }
        let control: React.ReactNode
        switch (f.type) {
          case 'textarea': control = <textarea className="input" {...common} rows={4} maxLength={5000} placeholder={f.placeholder} value={(value as string) || ''} onChange={(e) => set(f.id, e.target.value)} />; break
          case 'select': control = <select className="input" {...common} value={(value as string) || ''} onChange={(e) => set(f.id, e.target.value)}><option value="">{locale === 'fa' ? 'انتخاب کنید' : 'Select an option'}</option>{f.options.map((o) => { const price = f.prices?.[f.options.indexOf(o)] || 0; return <option key={o} value={o}>{price > 0 ? `${o} (+${toman(price)} تومان)` : o}</option> })}</select>; break
          case 'radio': control = <div className="pf-choices" role="radiogroup" aria-labelledby={`${id}-l`}>{f.options.map((o) => <label key={o} className="pf-choice"><input type="radio" name={id} checked={value === o} onChange={() => set(f.id, o)} />{o}{priceOf(o)}</label>)}</div>; break
          case 'checkboxes': control = <div className="pf-choices" role="group" aria-labelledby={`${id}-l`}>{f.options.map((o) => { const list = (value as string[]) || []; return <label key={o} className="pf-choice"><input type="checkbox" checked={list.includes(o)} onChange={(e) => set(f.id, e.target.checked ? [...list, o] : list.filter((x) => x !== o))} />{o}{priceOf(o)}</label> })}</div>; break
          case 'checkbox': control = <label className="pf-choice"><input type="checkbox" {...common} checked={value === true} onChange={(e) => set(f.id, e.target.checked)} />{f.placeholder || f.label}</label>; break
          case 'rating': {
            const top = Math.min(f.max || 5, 10)
            control = <div className="pf-rating" role="radiogroup" aria-labelledby={`${id}-l`}>{Array.from({ length: top }, (_, i) => i + 1).map((n) => <button key={n} type="button" role="radio" aria-checked={Number(value) === n} aria-label={`${n.toLocaleString('fa-IR')} از ${top.toLocaleString('fa-IR')}`} className={`rv-step${Number(value) === n ? ' is-on' : Number(value) > n ? ' is-under' : ''}`} onClick={() => set(f.id, String(Number(value) === n ? 0 : n))}>{n.toLocaleString('fa-IR')}</button>)}</div>
            break
          }
          case 'file': {
            const files = uploads[f.id] || []
            const cap = Math.min(f.max || 1, 5)
            control = <div className="pf-files">
              {files.map((file) => <div key={file.id} className="pf-file"><span>{file.name} <small>{kb(file.size)}</small></span><button type="button" className="btn btn-ghost" onClick={() => removeFile(f, file.id)} aria-label={`حذف ${file.name}`}>حذف</button></div>)}
              {files.length < cap && <label className="btn btn-ghost pf-pick">{uploading === f.id ? 'در حال بارگذاری…' : 'انتخاب فایل'}<input {...common} type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" disabled={uploading === f.id} onChange={(e) => { void upload(f, e.target.files?.[0]); e.target.value = '' }} /></label>}
            </div>
            break
          }
          case 'slider': {
            const low = f.min ?? 0, high = f.max ?? 100
            control = <div className="pf-slider"><input {...common} type="range" min={low} max={high} value={value === undefined || value === '' ? low : Number(value)} onChange={(e) => set(f.id, e.target.value)} /><output className="num">{value === undefined || value === '' ? '—' : Number(value).toLocaleString('fa-IR')}</output></div>
            break
          }
          case 'fxamount': {
            const codes = f.currencies?.length ? f.currencies : ['USD']
            const text = String(value || '')
            const at = text.lastIndexOf(' ')
            const amount = at >= 0 ? text.slice(0, at) : ''
            const code = at >= 0 && codes.includes(text.slice(at + 1)) ? text.slice(at + 1) : codes[0]
            const compose = (nextAmount: string, nextCode: string) => set(f.id, nextAmount.trim() ? `${nextAmount.trim()} ${nextCode}` : '')
            control = <div className="pf-fx">
              <input className="input num" {...common} inputMode="decimal" dir="ltr" autoComplete="off" maxLength={12} placeholder={f.placeholder || '49.99'} value={amount} onChange={(e) => compose(e.target.value, code)} />
              {codes.length > 1 ? <select className="input" aria-label="واحد پول" value={code} onChange={(e) => compose(amount, e.target.value)}>{codes.map((item) => <option key={item}>{item}</option>)}</select> : <b>{code}</b>}
            </div>
            break
          }
          default: {
            const type = f.type === 'secret' ? 'password' : ['number', 'mobile', 'national'].includes(f.type) ? 'text' : f.type
            control = <input className="input" {...common} type={type} inputMode={f.type === 'number' ? 'decimal' : f.type === 'tel' || f.type === 'mobile' ? 'tel' : f.type === 'national' ? 'numeric' : undefined} autoComplete={f.type === 'secret' ? 'new-password' : undefined} dir={['email', 'tel', 'url', 'number', 'mobile', 'national', 'secret', 'time'].includes(f.type) ? 'ltr' : undefined} maxLength={500} placeholder={f.placeholder} value={(value as string) || ''} onChange={(e) => set(f.id, e.target.value)} />
          }
        }
        const boxed = f.type === 'checkbox'
        return <div key={f.id} data-field={f.id} className={`studio-field pf-field ${f.width === 'half' ? 'pf-half' : 'pf-full'} ${error ? 'has-error' : ''}`}>
          {!boxed && <span id={`${id}-l`} className="pf-label">{f.type === 'radio' || f.type === 'checkboxes' || f.type === 'rating' || f.type === 'fxamount' ? f.label : <label htmlFor={id}>{f.label}</label>}{f.required ? <b aria-hidden="true"> *</b> : null}</span>}
          {control}
          {f.help && <small id={`${id}-h`} className="pf-help">{f.help}</small>}
          {error && <small id={`${id}-e`} className="error-text" role="alert">{error}</small>}
        </div>
      })}
    </div>
    {message && <p role={preview ? 'status' : 'alert'} className={preview ? 'muted' : 'error-text'}>{message} {needsLogin && <Link href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.pathname)}`} className="text-link">ورود به حساب</Link>}</p>}
    <div className="pf-actions">
      {steps.length > 1 && step > 0 && <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>مرحلهٔ قبل</button>}
      <button disabled={busy || !!uploading} className="btn btn-primary">{busy ? '…' : !last ? 'مرحلهٔ بعد' : settings?.submitLabel || (paid ? 'تأیید و رفتن به پرداخت' : '') || (locale === 'fa' ? 'ارسال فرم' : 'Send message')} <span aria-hidden="true">{last ? '↗' : '←'}</span></button>
    </div>
  </form>
}
