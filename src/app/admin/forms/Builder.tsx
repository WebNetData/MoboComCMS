'use client'

import { useState } from 'react'
import { CHOICE_TYPES, FIELD_LABEL, OPS, OP_LABEL, type Condition, type FormDefinition, type FormField, type FormStep } from '@/modules/forms/domain/forms'
import { isContent, newField, settingsOf } from './shared'

const GROUPS: { title: string; types: FormField['type'][] }[] = [
  { title: 'ورودی متنی', types: ['text', 'textarea', 'email', 'tel', 'url', 'number', 'date'] },
  { title: 'انتخاب', types: ['select', 'radio', 'checkboxes', 'checkbox', 'rating'] },
  { title: 'ضمیمه و محتوا', types: ['file', 'heading', 'paragraph'] },
]

const move = <T,>(list: T[], from: number, to: number) => { const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next }

/** Builder: field palette → ordered canvas → inspector for the selected field, with steps and show-if conditions. */
export default function Builder({ form, onChange }: { form: FormDefinition; onChange: (form: FormDefinition) => void }) {
  const [selected, setSelected] = useState(0)
  const [dragging, setDragging] = useState<number | null>(null)
  const settings = settingsOf(form)
  const steps = settings.steps
  const field = form.fields[selected] as FormField | undefined

  const setFields = (fields: FormField[]) => onChange({ ...form, fields })
  const setSteps = (next: FormStep[]) => onChange({ ...form, settings: { ...settings, steps: next }, fields: form.fields.map((f) => ({ ...f, step: next.length ? (next.some((s) => s.id === f.step) ? f.step : next[0].id) : undefined })) })
  const patch = (value: Partial<FormField>) => setFields(form.fields.map((f, i) => (i === selected ? { ...f, ...value } : f)))
  const add = (type: FormField['type']) => {
    const created = newField(form.fields, type, FIELD_LABEL[type])
    if (steps.length) created.step = field?.step || steps[0].id
    const at = field ? selected + 1 : form.fields.length
    const fields = [...form.fields]; fields.splice(at, 0, created)
    setFields(fields); setSelected(at)
  }
  const remove = (index: number) => {
    const gone = form.fields[index].id
    // Conditions that pointed at the removed field would never hold; drop them.
    const fields = form.fields.filter((_, i) => i !== index).map((f) => (f.showIf?.some((c) => c.field === gone) ? { ...f, showIf: f.showIf.filter((c) => c.field !== gone) } : f)).map((f) => (f.showIf && !f.showIf.length ? { ...f, showIf: undefined, logic: undefined } : f))
    setFields(fields); setSelected(Math.max(0, Math.min(index, fields.length - 1)))
  }
  const duplicate = (index: number) => {
    const source = form.fields[index]
    const copy = { ...newField(form.fields, source.type, `${source.label} (کپی)`), ...source, id: newField(form.fields, source.type, '').id, label: `${source.label} (کپی)` }
    const fields = [...form.fields]; fields.splice(index + 1, 0, copy)
    setFields(fields); setSelected(index + 1)
  }
  const shift = (index: number, delta: number) => { const to = index + delta; if (to < 0 || to >= form.fields.length) return; setFields(move(form.fields, index, to)); setSelected(to) }

  const earlier = field ? form.fields.slice(0, selected).filter((f) => !isContent(f.type)) : []
  const conditions = field?.showIf || []
  const setConditions = (next: Condition[]) => patch({ showIf: next.length ? next : undefined, logic: next.length ? field?.logic || 'all' : undefined })
  const target = (id: string) => form.fields.find((f) => f.id === id)

  const stepIndex = (f: FormField) => (steps.length ? Math.max(0, steps.findIndex((s) => s.id === f.step)) : 0)

  return <div className="fb">
    <aside className="fb-palette" aria-label="افزودن فیلد">
      {GROUPS.map((group) => <section key={group.title}><h3>{group.title}</h3><div>{group.types.map((type) => <button key={type} type="button" className="btn btn-ghost btn-sm" onClick={() => add(type)}>+ {FIELD_LABEL[type]}</button>)}</div></section>)}
    </aside>

    <section className="fb-canvas" aria-label="فیلدهای فرم">
      <div className="fb-steps">
        <div className="fb-steps-head"><b>مراحل</b><small>{steps.length ? 'هر فیلد در یکی از مرحله‌ها قرار می‌گیرد.' : 'فرم تک‌مرحله‌ای است.'}</small>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const id = `step${steps.length + 1}`; setSteps([...(steps.length ? steps : [{ id: 'step1', title: 'مرحلهٔ ۱', description: '' }]), { id: steps.some((s) => s.id === id) ? `${id}b` : id, title: `مرحلهٔ ${(steps.length ? steps.length + 1 : 2).toLocaleString('fa-IR')}`, description: '' }]) }}>+ مرحله</button></div>
        {steps.map((s, i) => <div key={s.id} className="fb-step"><span className="num">{(i + 1).toLocaleString('fa-IR')}</span>
          <input className="input" aria-label={`عنوان مرحلهٔ ${i + 1}`} value={s.title} maxLength={80} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={`حذف مرحلهٔ ${i + 1}`}>حذف</button></div>)}
      </div>

      <ol className="fb-list">
        {form.fields.map((f, i) => {
          const startsStep = steps.length > 0 && (i === 0 || stepIndex(form.fields[i - 1]) !== stepIndex(f))
          return <li key={f.id} className={dragging === i ? 'is-dragging' : ''} draggable onDragStart={() => setDragging(i)} onDragEnd={() => setDragging(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragging !== null && dragging !== i) { setFields(move(form.fields, dragging, i)); setSelected(i) } setDragging(null) }}>
            {startsStep && <div className="fb-step-title">{steps[stepIndex(f)]?.title}</div>}
            <div className={`fb-field ${i === selected ? 'is-selected' : ''}`}>
              <button type="button" className="fb-pick" onClick={() => setSelected(i)} aria-pressed={i === selected}>
                <span className="fb-kind">{FIELD_LABEL[f.type]}</span>
                <b>{f.label}{f.required ? <i aria-label="الزامی"> *</i> : null}</b>
                <small>{f.showIf?.length ? `شرطی · ` : ''}{f.width === 'half' ? 'نیم‌عرض' : ''}</small>
              </button>
              <div className="fb-tools">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => shift(i, -1)} disabled={i === 0} aria-label="بالاتر">↑</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => shift(i, 1)} disabled={i === form.fields.length - 1} aria-label="پایین‌تر">↓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => duplicate(i)} aria-label="کپی فیلد">کپی</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} disabled={form.fields.length <= 1} aria-label="حذف فیلد">حذف</button>
              </div>
            </div>
          </li>
        })}
      </ol>
    </section>

    <aside className="fb-inspector" aria-label="ویژگی‌های فیلد">
      {!field ? <p className="sa-hint">یک فیلد را انتخاب کنید.</p> : <>
        <h3>{FIELD_LABEL[field.type]}</h3>
        <label className="sa-field"><span>{field.type === 'paragraph' ? 'عنوان (فقط در مدیریت)' : 'عنوان'}</span><input className="input" value={field.label} maxLength={200} onChange={(e) => patch({ label: e.target.value })} /></label>
        {field.type !== 'heading' && <label className="sa-field"><span>{field.type === 'paragraph' ? 'متن' : 'راهنما زیر فیلد'}</span>{field.type === 'paragraph' ? <textarea className="input" rows={4} value={field.help || ''} maxLength={1000} onChange={(e) => patch({ help: e.target.value })} /> : <input className="input" value={field.help || ''} maxLength={300} onChange={(e) => patch({ help: e.target.value })} />}</label>}
        {!isContent(field.type) && <>
          {['text', 'textarea', 'email', 'tel', 'url', 'number', 'select'].includes(field.type) && <label className="sa-field"><span>متن نمونه</span><input className="input" value={field.placeholder || ''} maxLength={120} onChange={(e) => patch({ placeholder: e.target.value })} /></label>}
          {CHOICE_TYPES.includes(field.type) && <label className="sa-field"><span>گزینه‌ها (هر خط یکی)</span><textarea className="input" rows={5} value={field.options.join('\n')} onChange={(e) => patch({ options: e.target.value.split('\n') })} /></label>}
          <div className="fb-two">
            {['text', 'textarea'].includes(field.type) && <><label className="sa-field"><span>کمینهٔ نویسه</span><input className="input" type="number" min={0} value={field.min ?? ''} onChange={(e) => patch({ min: e.target.value === '' ? undefined : Number(e.target.value) })} /></label><label className="sa-field"><span>بیشینهٔ نویسه</span><input className="input" type="number" min={0} value={field.max ?? ''} onChange={(e) => patch({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}
            {field.type === 'number' && <><label className="sa-field"><span>کمینه</span><input className="input" type="number" value={field.min ?? ''} onChange={(e) => patch({ min: e.target.value === '' ? undefined : Number(e.target.value) })} /></label><label className="sa-field"><span>بیشینه</span><input className="input" type="number" value={field.max ?? ''} onChange={(e) => patch({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}
            {field.type === 'checkboxes' && <><label className="sa-field"><span>حداقل انتخاب</span><input className="input" type="number" min={0} value={field.min ?? ''} onChange={(e) => patch({ min: e.target.value === '' ? undefined : Number(e.target.value) })} /></label><label className="sa-field"><span>حداکثر انتخاب</span><input className="input" type="number" min={0} value={field.max ?? ''} onChange={(e) => patch({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}
            {field.type === 'rating' && <label className="sa-field"><span>تعداد ستاره</span><input className="input" type="number" min={3} max={10} value={field.max ?? 5} onChange={(e) => patch({ max: Number(e.target.value) })} /></label>}
            {field.type === 'file' && <label className="sa-field"><span>حداکثر تعداد فایل</span><input className="input" type="number" min={1} max={5} value={field.max ?? 1} onChange={(e) => patch({ max: Number(e.target.value) })} /></label>}
          </div>
          <label className="sa-check"><input type="checkbox" checked={field.required} onChange={(e) => patch({ required: e.target.checked })} /> تکمیل این فیلد الزامی است</label>
          {field.type === 'file' && <p className="sa-hint">PDF، JPG، PNG یا WebP تا ۵ مگابایت؛ فقط مدیران فایل را می‌بینند.</p>}
        </>}
        <div className="fb-two">
          <label className="sa-field"><span>عرض</span><select className="input" value={field.width || 'full'} onChange={(e) => patch({ width: e.target.value === 'half' ? 'half' : undefined })}><option value="full">تمام‌عرض</option><option value="half">نیم‌عرض</option></select></label>
          {steps.length > 0 && <label className="sa-field"><span>مرحله</span><select className="input" value={field.step || steps[0].id} onChange={(e) => patch({ step: e.target.value })}>{steps.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
        </div>
        <label className="sa-field"><span>شناسهٔ فیلد (در خروجی و شرط‌ها)</span><input className="input" dir="ltr" value={field.id} disabled title="برای جلوگیری از گم شدن شرط‌ها و پاسخ‌های قبلی، شناسه ثابت است" readOnly /></label>

        <fieldset className="fb-logic"><legend>نمایش شرطی</legend>
          {!earlier.length ? <p className="sa-hint">برای شرط، ابتدا باید فیلدی قبل از این فیلد وجود داشته باشد.</p> : <>
            {conditions.length > 1 && <label className="sa-field"><span>این فیلد نمایش داده شود اگر</span><select className="input" value={field.logic || 'all'} onChange={(e) => patch({ logic: e.target.value === 'any' ? 'any' : 'all' })}><option value="all">همهٔ شرط‌ها برقرار باشند</option><option value="any">یکی از شرط‌ها برقرار باشد</option></select></label>}
            {conditions.map((c, i) => { const t = target(c.field); const choices = t && (CHOICE_TYPES.includes(t.type) ? t.options : t.type === 'rating' ? Array.from({ length: Math.min(t.max || 5, 10) }, (_, n) => String(n + 1)) : t.type === 'checkbox' ? ['true', 'false'] : null)
              return <div key={i} className="fb-cond">
                <select className="input" aria-label="فیلد" value={c.field} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { field: e.target.value, op: 'filled' } : x)))}>{earlier.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                <select className="input" aria-label="شرط" value={c.op} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition['op'], value: '' } : x)))}>{OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}</select>
                {(c.op === 'eq' || c.op === 'neq' || c.op === 'contains') && (choices ? <select className="input" aria-label="مقدار" value={c.value || ''} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}><option value="">—</option>{choices.map((o) => <option key={o} value={o}>{o === 'true' ? 'تیک‌خورده' : o === 'false' ? 'بدون تیک' : o}</option>)}</select> : <input className="input" aria-label="مقدار" value={c.value || ''} maxLength={150} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />)}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConditions(conditions.filter((_, j) => j !== i))} aria-label="حذف شرط">×</button>
              </div> })}
            {conditions.length < 5 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConditions([...conditions, { field: earlier[earlier.length - 1].id, op: 'filled' }])}>+ شرط</button>}
          </>}
        </fieldset>
      </>}
    </aside>
  </div>
}

