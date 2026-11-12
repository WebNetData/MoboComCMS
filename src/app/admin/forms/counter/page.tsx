'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import PublicForm from '@/components/site/PublicForm'
import type { FormDefinition } from '@/modules/forms/domain/forms'

type Saved = { id: number; pickupCode: string; receiptToken: string }

/**
 * A customer in the shop (forms/server/counter): staff fill the form for them — the device, the problem, its lock —
 * and the answer is taken in at once at the step that issues the receipt. Then the two receipts are printed.
 */
export default function CounterPage() {
  const [form, setForm] = useState<FormDefinition | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('form'))
    fetch('/api/admin/forms', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        const found = (body.forms || []).find((item: FormDefinition) => item.id === id)
        if (found) setForm(found); else setError(response.ok ? 'این فرم پیدا نشد یا به شما سپرده نشده است' : body.error || 'فرم خوانده نشد')
      })
      .catch(() => setError('فرم خوانده نشد'))
  }, [])

  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>ثبت حضوری{form ? ` — ${form.title}` : ''}</h1>{form && <div className="sa-head-actions"><Link className="btn btn-ghost" href={`/admin/forms?form=${form.id}&tab=inbox`}>میز کار این فرم</Link></div>}</header>
    {error && <p className="sa-hint" role="alert">{error}</p>}
    {saved && <section className="sa-card ct-saved" role="status">
      <header className="sa-card-head"><h2>پذیرش شمارهٔ {saved.id.toLocaleString('fa-IR', { useGrouping: false })} ثبت شد</h2></header>
      {saved.pickupCode && <p>کد تحویل مشتری: <b dir="ltr" className="ct-code">{saved.pickupCode}</b> <small className="sa-hint">روی رسید مشتری چاپ می‌شود؛ بدون آن دستگاه تحویل داده نمی‌شود.</small></p>}
      <div className="sa-row-actions">
        <a className="btn btn-primary" href={`/admin/forms/receipt/${saved.id}?copy=customer`} target="_blank">چاپ رسید مشتری</a>
        <a className="btn btn-ghost" href={`/admin/forms/receipt/${saved.id}?copy=shop`} target="_blank">چاپ رسید مغازه</a>
        <button type="button" className="btn btn-ghost" onClick={() => { setSaved(null); setRound((value) => value + 1) }}>مشتری بعدی</button>
      </div>
    </section>}
    {form && !saved && <PublicForm key={round} form={{ ...form, description: 'اطلاعات مشتری و دستگاه را وارد کنید. قفل گوشی رمزنگاری می‌شود و یک هفته پس از پایان کار پاک می‌شود.', settings: form.settings && { ...form.settings, saveDraft: false } }} counter={{ formId: form.id!, onSaved: setSaved }} />}
  </div>
}
