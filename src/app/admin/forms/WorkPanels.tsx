'use client'

import { CONTENT_TYPES, STAGES, STAGE_LABEL, type FormDefinition, type FormSettings, type WorkStep } from '@/modules/forms/domain/forms'

const FIXED = STAGES as readonly string[]
const blank = (key: string, label: string): WorkStep => ({ key, label, message: '', sms: false, receipt: false, pickup: false, invoice: false })

/**
 * The form's own work steps and its receipts (forms domain: workflow, receipt). Steps between «waiting» and
 * «done / rejected» are the form's; each may message the sender, issue the receipt, or ask for the pickup code.
 */
export function WorkPanels({ form, s, set }: { form: FormDefinition; s: FormSettings; set: (patch: Partial<FormSettings>) => void }) {
  const steps = s.workflow || []
  const own = steps.length > 0
  const setStep = (index: number, patch: Partial<WorkStep>) => set({ workflow: steps.map((step, at) => at === index ? { ...step, ...patch } : step) })
  const move = (index: number, by: number) => { const next = [...steps]; const [step] = next.splice(index, 1); next.splice(index + by, 0, step); set({ workflow: next }) }
  const middle = (index: number) => !FIXED.includes(steps[index].key) || steps[index].key === 'IN_PROGRESS'
  const receipt = s.receipt || { enabled: false, title: '', terms: '', customerFields: [] }
  const fields = form.fields.filter((field) => !CONTENT_TYPES.includes(field.type) && !['secret', 'devicelock', 'file', 'signature', 'hidden'].includes(field.type))

  return <>
    <section className="sa-card">
      <header className="sa-card-head"><h2>مراحل کار</h2><span className="sa-tag">{own ? `${steps.length.toLocaleString('fa-IR')} مرحله` : 'چهار مرحلهٔ استاندارد'}</span></header>
      <p className="sa-hint">مثل تعمیر موبایل: «تأیید شد؛ دستگاه را بیاورید» ← «دستگاه دریافت شد» (رسید) ← «در حال تعمیر» ← «آماده تحویل» ← «تحویل داده شد» (با کد تحویل). پیام هر مرحله به «درخواست‌های من» و با پیامک به موبایلِ فرم فرستاده می‌شود؛ در متن پیام {'{code}'} کد تحویل، {'{receipt}'} نشانی رسید و {'{id}'} شمارهٔ درخواست است. پیامک از «تنظیمات پیامک › مرحلهٔ کار درخواست» روشن می‌شود.</p>
      {!own && <button type="button" className="btn btn-ghost" onClick={() => set({ workflow: [blank('OPEN', STAGE_LABEL.OPEN), blank('IN_PROGRESS', STAGE_LABEL.IN_PROGRESS), blank('DONE', STAGE_LABEL.DONE), blank('REJECTED', STAGE_LABEL.REJECTED)] })}>مراحل اختصاصی این فرم</button>}
      {own && <ol className="fb-work">{steps.map((step, index) => <li key={`${step.key}-${index}`} className="fb-work-step">
        <div className="fb-work-head">
          <input className="input" dir="ltr" aria-label="شناسهٔ لاتین مرحله" value={step.key} maxLength={24} disabled={FIXED.includes(step.key) && step.key !== 'IN_PROGRESS'} onChange={(event) => setStep(index, { key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
          <input className="input" aria-label="عنوان مرحله" value={step.label} maxLength={60} onChange={(event) => setStep(index, { label: event.target.value })} />
          {middle(index) && <span className="fb-work-tools">
            <button type="button" className="sa-link" aria-label="بالاتر" disabled={index <= 1} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="sa-link" aria-label="پایین‌تر" disabled={!middle(index + 1)} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="sa-link is-danger" onClick={() => set({ workflow: steps.filter((_, at) => at !== index) })}>حذف</button>
          </span>}
        </div>
        <textarea className="input" rows={2} maxLength={400} aria-label={`پیام مرحلهٔ ${step.label}`} placeholder="پیام به مشتری در این مرحله (اختیاری)" value={step.message} onChange={(event) => setStep(index, { message: event.target.value })} />
        <div className="fb-work-flags">
          <label className="sa-check"><input type="checkbox" checked={step.sms} onChange={(event) => setStep(index, { sms: event.target.checked })} />پیامک به مشتری</label>
          {step.key !== 'OPEN' && step.key !== 'REJECTED' && <label className="sa-check"><input type="checkbox" checked={step.receipt} onChange={(event) => setStep(index, { receipt: event.target.checked })} />صدور رسید و کد تحویل</label>}
          {step.key !== 'OPEN' && step.key !== 'REJECTED' && <label className="sa-check"><input type="checkbox" checked={step.pickup} onChange={(event) => setStep(index, { pickup: event.target.checked })} />فقط با کد تحویل مشتری</label>}
          {step.key !== 'OPEN' && step.key !== 'REJECTED' && <label className="sa-check"><input type="checkbox" checked={step.invoice} onChange={(event) => setStep(index, { invoice: event.target.checked })} />فقط با فاکتور تعمیر پرداخت‌شده</label>}
        </div>
      </li>)}</ol>}
      {own && <div className="fb-work-foot">
        <button type="button" className="btn btn-ghost" disabled={steps.length >= 12} onClick={() => { const at = Math.max(1, steps.findIndex((step) => step.key === 'DONE')); const next = [...steps]; next.splice(at, 0, blank(`STEP${steps.length}`, '')); set({ workflow: next }) }}>+ مرحله</button>
        <button type="button" className="sa-link is-danger" onClick={() => set({ workflow: [] })}>برگشت به مراحل استاندارد</button>
      </div>}
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>رسید چاپی</h2><span className="sa-tag">{receipt.enabled ? 'روشن' : 'خاموش'}</span></header>
      <label className="sa-check"><input type="checkbox" checked={receipt.enabled} onChange={(event) => set({ receipt: { ...receipt, enabled: event.target.checked } })} />رسید مغازه و رسید مشتری چاپ شود <small className="sa-hint">رسید مغازه همه‌چیز را دارد (حتی قفل گوشی)؛ رسید مشتری فقط فیلدهای انتخابی، قوانین، کد تحویل و جای مهر و امضا را.</small></label>
      {receipt.enabled && <>
        <label className="sa-field"><span>عنوان رسید</span><input className="input" maxLength={80} value={receipt.title} placeholder={form.title} onChange={(event) => set({ receipt: { ...receipt, title: event.target.value } })} /></label>
        <div className="sa-field"><span>فیلدهای روی رسید مشتری</span><div className="fb-work-fields">{fields.map((field) => <label key={field.id} className="sa-check"><input type="checkbox" checked={receipt.customerFields.includes(field.id)} onChange={(event) => set({ receipt: { ...receipt, customerFields: event.target.checked ? [...receipt.customerFields, field.id] : receipt.customerFields.filter((id) => id !== field.id) } })} />{field.label}</label>)}</div></div>
        <label className="sa-field"><span>قوانین و شرایط (هر بند در یک خط)</span><textarea className="input" rows={8} maxLength={6000} value={receipt.terms} onChange={(event) => set({ receipt: { ...receipt, terms: event.target.value } })} /></label>
      </>}
    </section>
  </>
}
