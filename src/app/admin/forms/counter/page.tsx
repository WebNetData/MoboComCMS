'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import PublicForm from '@/components/site/PublicForm'
import type { FormDefinition } from '@/modules/forms/domain/forms'
import DoneMark from '../../store/DoneMark'
import '../../store/desk.css'

type Saved = { id: number; pickupCode: string; receiptToken: string }

/**
 * A customer in the shop (forms/server/counter): staff fill the form for them — the device, the problem, its lock —
 * and the answer is taken in at once at the step that issues the receipt. Then the two receipts are printed.
 */
export default function CounterPage() {
  const [forms, setForms] = useState<FormDefinition[]>([])
  const [formId, setFormId] = useState(0)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)
  const savedPanel = useRef<HTMLElement>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const id = Number(new URLSearchParams(window.location.search).get('form'))
    setLoading(true)
    setError('')
    setForms([])
    setFormId(0)
    fetch('/api/admin/forms', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(body.error || 'فرم‌ها خوانده نشدند')
        const available: FormDefinition[] = body.forms || []
        const eligible = available.filter((item) => !item.settings?.payment.enabled)
        setForms(eligible)
        if (id) {
          const found = available.find((item) => item.id === id)
          if (!found) setError('این فرم پیدا نشد یا به شما سپرده نشده است')
          else if (found.settings?.payment.enabled) setError('فرم پرداختی را مشتری خودش در سایت ارسال و پرداخت می‌کند')
          else setFormId(id)
        } else if (eligible.length === 1) setFormId(eligible[0].id!)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'فرم‌ها خوانده نشدند')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  useEffect(() => {
    if (!saved) return
    savedPanel.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [saved])
  const form = forms.find((item) => item.id === formId)

  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>ثبت حضوری{form ? ` — ${form.title}` : ''}</h1>{form && <div className="sa-head-actions"><Link className="btn btn-ghost" href={`/admin/forms?form=${form.id}&tab=inbox`}>میز کار این فرم</Link></div>}</header>
    {loading && <p className="sa-hint" role="status" aria-busy="true">در حال دریافت فرم‌ها…</p>}
    {error && <div className="sa-notice is-error" role="alert"><p>{error}</p><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button></div>}
    {!loading && forms.length > 0 && !saved && <section className="sa-card">
      <label htmlFor="counter-form">فرم پذیرش</label>
      <select id="counter-form" className="input" value={formId} onChange={(event) => { setFormId(Number(event.target.value)); setError(''); setRound((value) => value + 1) }}>
        <option value={0}>فرم را انتخاب کنید</option>
        {forms.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </section>}
    {!loading && !error && !forms.length && <p className="sa-hint">فرم غیرپرداختی برای پذیرش حضوری در دسترس شما نیست. مدیر فرم‌ها می‌تواند فرم تعمیر موبایل را بسازد و دسترسی آن را به شما بدهد.</p>}
    {saved && <section ref={savedPanel} className="sa-card ct-saved cd-done" role="status" tabIndex={-1}>
      <span className="cd-done-mark" aria-hidden="true"><DoneMark size={28} /></span>
      <div className="cd-done-text"><h2>پذیرش شمارهٔ <bdi className="cd-num">{saved.id.toLocaleString('fa-IR', { useGrouping: false })}</bdi> ثبت شد</h2>
        {saved.pickupCode ? <p>کد تحویل مشتری <b dir="ltr" className="cd-pickup-code"><span className="cd-sr">{saved.pickupCode}</span>{saved.pickupCode.split('').map((digit, index) => <i key={index} aria-hidden="true">{digit}</i>)}</b></p> : <p>در میز کار این فرم قرار گرفت.</p>}
        {saved.pickupCode && <p className="sa-hint">روی رسید مشتری چاپ می‌شود؛ بدون آن دستگاه تحویل داده نمی‌شود.</p>}</div>
      <div className="cd-done-actions">
        {form?.settings?.receipt.enabled && saved.receiptToken && <>
          <a className="btn btn-primary" href={`/admin/forms/receipt/${saved.id}?copy=customer`} target="_blank" rel="noopener">چاپ رسید مشتری</a>
          <a className="btn btn-ghost" href={`/admin/forms/receipt/${saved.id}?copy=shop`} target="_blank" rel="noopener">چاپ رسید مغازه</a>
        </>}
        <button type="button" className="btn btn-ghost" onClick={() => { setSaved(null); setRound((value) => value + 1) }}>مشتری بعدی</button>
      </div>
    </section>}
    {form && !saved && <PublicForm key={round} form={{ ...form, description: 'اطلاعات مشتری و دستگاه را وارد کنید. قفل گوشی رمزنگاری می‌شود و یک هفته پس از پایان کار پاک می‌شود.', settings: form.settings && { ...form.settings, saveDraft: false } }} counter={{ formId: form.id!, onSaved: setSaved }} />}
  </div>
}
