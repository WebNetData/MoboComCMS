'use client'
import Icon from '@/components/site/Icon'
import { useEffect, useId, useState } from 'react'
import type { FieldInput, FieldInputs } from '@/modules/imports/domain/field-inputs'
import { isExistingValue } from '@/modules/imports/domain/field-inputs'
import type { Analysis, Destination, FieldDef, Settings } from './types'

type Props = { dest: Destination; analysis: Analysis; settings: Settings; change: (next: Partial<Settings>) => void }
const faNumber = new Intl.NumberFormat('fa-IR')
const display = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)

function ExistingPicker({ adapter, field, value, onChange }: { adapter: string; field: FieldDef; value: unknown; onChange: (value: unknown) => void }) {
  const groupId = useId()
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ choices: { id: string; label: string }[]; more: boolean } | null>(null)
  const [error, setError] = useState(''), [pending, setPending] = useState(true)
  const ids = isExistingValue(value) ? value.existing : []
  const selectedIds = new Set(ids)
  const choicesById = new Map((result?.choices || []).map(choice => [choice.id, choice]))
  useEffect(() => {
    const controller = new AbortController(); setPending(true); setError('')
    const timer = setTimeout(() => {
      void fetch('/api/admin/imports?' + new URLSearchParams({ view: 'field-choices', adapter, key: field.key, q: query, page: String(page) }), { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'بارگذاری انجام نشد'); if (!controller.signal.aborted) setResult(body) }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'بارگذاری انجام نشد') }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [adapter, field.key, query, page, retry])
  const toggle = (id: string, checked: boolean) => onChange({ existing: checked ? field.selection?.multiple ? [...ids, id] : [id] : ids.filter(value => value !== id), labels: { ...(isExistingValue(value) ? value.labels : {}), ...Object.fromEntries((result?.choices || []).map(choice => [choice.id, choice.label])) } })
  return <div className="imp-existing">
    <label className="sa-field"><span>جستجو در {field.label}</span><input className="input" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label>
    {ids.length > 0 && <div className="imp-chosen" aria-label="انتخاب‌های فعلی">{ids.map(id => <button className="btn btn-ghost btn-sm" type="button" key={id} onClick={() => toggle(id, false)}>حذف {isExistingValue(value) && value.labels?.[id] || choicesById.get(id)?.label || ('#' + id)}</button>)}</div>}
    {pending && <p role="status" className="sa-hint">در حال دریافت گزینه‌ها…</p>}
    {error ? <div role="alert"><p>{error}</p><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div> : <fieldset className="imp-existing-list" disabled={pending}><legend className="sa-hint">{field.selection?.multiple ? 'یک یا چند مورد را انتخاب کنید' : 'یک مورد را انتخاب کنید'}</legend>
      {result?.choices.map(choice => <label className="imp-existing-choice" key={choice.id}><input type={field.selection?.multiple ? 'checkbox' : 'radio'} name={groupId} checked={selectedIds.has(choice.id)} onChange={event => toggle(choice.id, event.target.checked)} /><span>{choice.label}</span></label>)}
      {!pending && result?.choices.length === 0 && <p className="sa-hint">موردی پیدا نشد؛ عبارت جستجو را تغییر دهید یا ابتدا آن را در بخش مربوط بسازید.</p>}
    </fieldset>}
    <div className="imp-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={pending || page === 1} onClick={() => setPage(value => value - 1)}>صفحهٔ قبل</button><span className="sa-hint">صفحهٔ {faNumber.format(page)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={pending || !result?.more} onClick={() => setPage(value => value + 1)}>صفحهٔ بعد</button></div>
  </div>
}

function ValueControl({ adapter, field, value, onChange }: { adapter: string; field: FieldDef; value: unknown; onChange: (value: unknown) => void }) {
  const [manual, setManual] = useState(false)
  if (field.selection && (!manual || isExistingValue(value))) return <><ExistingPicker adapter={adapter} field={field} value={value} onChange={onChange}/><button type="button" className="sa-link" onClick={() => { setManual(true); onChange('') }}>ورود دستی مقدار</button></>
  return <>
    {field.selection && <button type="button" className="sa-link" onClick={() => { setManual(false); onChange({ existing: [] }) }}>انتخاب از موارد موجود</button>}
    {field.enum || field.type === 'bool' ? <select className="select" aria-label={'مقدار ' + field.label} value={String(value ?? '')} onChange={event => onChange(event.target.value)}><option value="">انتخاب کنید</option>{(field.enum || [{ value: 'true', label: 'بله' }, { value: 'false', label: 'خیر' }]).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select> : <textarea className="input" rows={field.type === 'json' || field.type === 'html' ? 4 : 2} dir="auto" aria-label={'مقدار ' + field.label} value={display(value)} onChange={event => { let value: unknown = event.target.value; if (field.type === 'json') { try { value = JSON.parse(event.target.value) } catch { /* show invalid JSON until completed */ } }; onChange(value) }} />}
  </>
}

function BindingRow({ adapter, field, input, distinct, column, onChange }: { adapter: string; field: FieldDef; input?: FieldInput; distinct: string[]; column: string; onChange: (input?: FieldInput) => void }) {
  return <details className="imp-binding"><summary><b>{field.label}</b><span className="imp-chip">{input?.mode === 'fixed' ? 'مقدار ثابت' : input?.mode === 'map' ? 'نگاشت مقادیر' : 'از فایل'}</span><Icon name="chevron" size={16}/></summary>
    <div className="imp-binding-body"><label className="sa-field"><span>روش تعیین {field.label}</span><select className="select" value={input?.mode || 'file'} onChange={event => onChange(event.target.value === 'fixed' ? { mode: 'fixed', value: '' } : event.target.value === 'map' ? { mode: 'map', entries: [], unmatched: 'error' } : undefined)}><option value="file">از ستون فایل</option><option value="fixed">یک مقدار برای همهٔ ردیف‌ها</option><option value="map" disabled={!column}>جایگزینی مقادیر فایل</option></select></label>
    {input?.mode === 'fixed' && <ValueControl adapter={adapter} field={field} value={input.value} onChange={value => onChange({ mode: 'fixed', value })} />}
    {input?.mode === 'map' && <>
      <p className="sa-hint">مقادیر دیده‌شده در ستون {column}؛ مقدار انتخاب‌شده جایگزین مقدار فایل می‌شود.</p>
      {distinct.length === 0 && <p className="sa-hint">فهرست کوتاه مقادیر این ستون در دسترس نیست؛ از مقدار ثابت یا ستون فایل استفاده کنید.</p>}
      {distinct.map(from => <details className="imp-value-map" key={from}><summary dir="auto">{from}</summary><ValueControl adapter={adapter} field={field} value={input.entries.find(entry => entry.from === from)?.value} onChange={value => onChange({ ...input, entries: [...input.entries.filter(entry => entry.from !== from), { from, value }] })}/></details>)}
      <label className="sa-field"><span>مقدار بدون نگاشت</span><select className="select" value={input.unmatched} onChange={event => onChange({ ...input, unmatched: event.target.value === 'keep' ? 'keep' : 'error' })}><option value="error">خطا؛ خودکار چیزی ساخته نشود</option><option value="keep">استفاده از مقدار اصلی فایل و قوانین مقصد</option></select></label>
    </>}
    <p className="sa-hint">مجوز ساخت و به‌روزرسانی همچنان از مرحلهٔ «انتخاب فیلدها» اعمال می‌شود. انتخاب موجود، مورد تازه نمی‌سازد.</p></div>
  </details>
}

export default function FieldInputsPanel({ dest, analysis, settings, change }: Props) {
  const [scope, setScope] = useState<'main' | 'variant'>('main')
  const fields = (scope === 'main' ? dest.fields : dest.variantFields).filter(field => !field.implicit)
  const inputs = (scope === 'main' ? settings.fieldInputs : settings.variantInputs) || {}
  const mapping = scope === 'main' ? settings.mapping : settings.variantMapping
  const setInput = (key: string, input?: FieldInput) => {
    const next: FieldInputs = { ...inputs }; if (input) next[key] = input; else delete next[key]
    const policyKey = scope === 'main' ? 'policies' : 'variantPolicies'
    const field = fields.find(field => field.key === key)!
    change({ [scope === 'main' ? 'fieldInputs' : 'variantInputs']: next, [policyKey]: { ...settings[policyKey], [key]: { create: !!input || !!mapping[key], update: (!!input || !!mapping[key]) && field.updatable !== false && field.updateByDefault !== false } } })
  }
  return <section className="imp-input-panel" aria-labelledby="imp-input-heading"><div><h3 id="imp-input-heading">مقادیر دلخواه و انتخاب از موارد موجود</h3><p className="sa-hint">دسته، هنرمند، برند و سایر فیلدها را خودتان مشخص کنید؛ انتخاب شما بر ستون فایل اولویت دارد.</p></div>
    {settings.variants.mode !== 'none' && dest.variantFields.length > 0 && <label className="sa-field"><span>فیلدهای مورد نظر</span><select className="select" value={scope} onChange={event => setScope(event.target.value === 'variant' ? 'variant' : 'main')}><option value="main">{dest.entity}</option><option value="variant">{dest.variantLabel}</option></select></label>}
    <div className="imp-binding-grid">{fields.map(field => <BindingRow key={scope + field.key} adapter={dest.id} field={field} input={inputs[field.key]} column={mapping[field.key] || ''} distinct={analysis.distinct[mapping[field.key]] || []} onChange={input => setInput(field.key, input)}/>)}</div>
  </section>
}
