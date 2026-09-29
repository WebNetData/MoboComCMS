'use client'

import { useMemo, useState } from 'react'

export type VariantField = { key: string; label: string; kind: string; options: string[]; required: boolean; variant?: boolean }
export type VariantRow = { id?: number; sku: string; name: string; attributes: Record<string, string>; price: string; compareAt: string; stock: string; active: boolean }

const digits = (value: string) => value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '')
const comboKey = (attributes: Record<string, string>, fields: VariantField[]) => fields.map((field) => attributes[field.key] || '').join('\u0001')
const comboName = (attributes: Record<string, string>, fields: VariantField[]) => fields.map((field) => attributes[field.key]).filter(Boolean).join(' · ')

/** Every combination of the chosen values ({color: [a, b], size: [x]} → a·x, b·x). */
function combinations(fields: VariantField[], picked: Record<string, string[]>) {
  let out: Record<string, string>[] = [{}]
  for (const field of fields) {
    const values = picked[field.key] || []
    if (!values.length) continue
    out = out.flatMap((base) => values.map((value) => ({ ...base, [field.key]: value })))
  }
  return out.filter((row) => Object.keys(row).length)
}

/**
 * Seller-side variants (Digikala style): pick the colors, sizes, … the product
 * comes in, generate every combination, then give each its own price and
 * stock. Existing variants keep their id (and with it order history).
 */
export default function Variants({ fields, rows, basePrice, onChange }: { fields: VariantField[]; rows: VariantRow[]; basePrice: string; onChange: (rows: VariantRow[]) => void }) {
  const [picked, setPicked] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {}
    for (const row of rows) for (const [key, value] of Object.entries(row.attributes)) if (value && !(out[key] || []).includes(value)) out[key] = [...(out[key] || []), value]
    return out
  })
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [bulk, setBulk] = useState({ price: '', stock: '' })
  const planned = useMemo(() => combinations(fields, picked), [fields, picked])
  const existing = new Set(rows.map((row) => comboKey(row.attributes, fields)))
  const fresh = planned.filter((attributes) => !existing.has(comboKey(attributes, fields)))

  if (!fields.length) return <p className="sa-hint">دستهٔ انتخاب‌شده ویژگی تنوع (مثل رنگ یا سایز) ندارد؛ این محصول با یک قیمت و موجودی فروخته می‌شود.</p>

  const toggle = (key: string, value: string) => setPicked((current) => {
    const list = current[key] || []
    return { ...current, [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] }
  })
  const addCustom = (key: string) => {
    const value = (custom[key] || '').trim().slice(0, 60)
    if (!value) return
    setPicked((current) => ({ ...current, [key]: [...new Set([...(current[key] || []), value])] }))
    setCustom((current) => ({ ...current, [key]: '' }))
  }
  const generate = () => onChange([...rows, ...fresh.map((attributes) => ({ sku: '', name: comboName(attributes, fields), attributes, price: basePrice, compareAt: '', stock: '', active: true }))])
  const update = (index: number, patch: Partial<VariantRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const applyBulk = () => onChange(rows.map((row) => ({ ...row, ...(bulk.price ? { price: bulk.price } : {}), ...(bulk.stock ? { stock: bulk.stock } : {}) })))
  const valueOptions = (field: VariantField) => [...new Set([...field.options, ...(picked[field.key] || [])])]

  return <div className="sl-var">
    <div className="sl-var-pick">
      {fields.map((field) => <fieldset key={field.key} className="sl-var-field">
        <legend>{field.label}</legend>
        <div className="sl-var-values">
          {valueOptions(field).map((value) => {
            const on = (picked[field.key] || []).includes(value)
            return <label key={value} className={`sl-var-chip${on ? ' is-on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(field.key, value)} />
              {field.kind === 'color' && /^#[0-9a-f]{3,8}$/i.test(value) && <span className="sl-var-swatch" style={{ background: value }} aria-hidden="true" />}
              {value}
            </label>
          })}
          {field.kind !== 'select' && <span className="sl-var-add">
            <input className="input" value={custom[field.key] || ''} onChange={(e) => setCustom((current) => ({ ...current, [field.key]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(field.key) } }} placeholder={`${field.label} دیگر…`} aria-label={`افزودن ${field.label}`} maxLength={60} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addCustom(field.key)}>افزودن</button>
          </span>}
        </div>
      </fieldset>)}
      <div className="sl-var-generate">
        <button type="button" className="btn btn-primary btn-sm" disabled={!fresh.length} onClick={generate}>{fresh.length ? `ساخت ${fresh.length.toLocaleString('fa-IR')} تنوع` : 'ترکیب تازه‌ای انتخاب نشده'}</button>
        <small className="sa-sub">مقدارهای هر ویژگی را انتخاب کنید؛ همهٔ ترکیب‌ها ساخته می‌شوند و بعد قیمت و موجودی هرکدام را تعیین می‌کنید.</small>
      </div>
    </div>

    {rows.length > 0 && <>
      <div className="sl-var-bulk">
        <span>اعمال روی همه:</span>
        <input className="input" dir="ltr" inputMode="numeric" placeholder="قیمت (تومان)" value={bulk.price} onChange={(e) => setBulk({ ...bulk, price: digits(e.target.value) })} aria-label="قیمت همهٔ تنوع‌ها" />
        <input className="input" dir="ltr" inputMode="numeric" placeholder="موجودی" value={bulk.stock} onChange={(e) => setBulk({ ...bulk, stock: digits(e.target.value) })} aria-label="موجودی همهٔ تنوع‌ها" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!bulk.price && !bulk.stock} onClick={applyBulk}>اعمال</button>
      </div>
      <div className="sl-var-table" role="table" aria-label="تنوع‌های محصول">
        <div className="sl-var-row is-head" role="row"><span role="columnheader">تنوع</span><span role="columnheader">قیمت (تومان)</span><span role="columnheader">قبل از تخفیف</span><span role="columnheader">موجودی</span><span role="columnheader">فروش</span><span role="columnheader"><span className="sr-only">حذف</span></span></div>
        {rows.map((row, index) => {
          const discount = Number(row.compareAt) > Number(row.price) && Number(row.price) > 0 ? Math.round((1 - Number(row.price) / Number(row.compareAt)) * 100) : 0
          return <div key={row.id || comboKey(row.attributes, fields) || index} className={`sl-var-row${row.active ? '' : ' is-off'}`} role="row">
            <span role="cell" className="sl-var-name"><b>{row.name || comboName(row.attributes, fields) || '—'}</b>{row.sku && <small dir="ltr">{row.sku}</small>}</span>
            <span role="cell"><input className="input" dir="ltr" inputMode="numeric" value={row.price} onChange={(e) => update(index, { price: digits(e.target.value) })} aria-label={`قیمت ${row.name}`} required /></span>
            <span role="cell"><input className="input" dir="ltr" inputMode="numeric" value={row.compareAt} onChange={(e) => update(index, { compareAt: digits(e.target.value) })} aria-label={`قیمت قبل از تخفیف ${row.name}`} placeholder="—" />{discount > 0 && <small className="sl-var-off">{discount.toLocaleString('fa-IR')}٪</small>}</span>
            <span role="cell"><input className="input" dir="ltr" inputMode="numeric" value={row.stock} onChange={(e) => update(index, { stock: digits(e.target.value) })} aria-label={`موجودی ${row.name}`} placeholder="نامحدود" /></span>
            <span role="cell"><label className="sl-var-switch"><input type="checkbox" checked={row.active} onChange={(e) => update(index, { active: e.target.checked })} /><span>{row.active ? 'فعال' : 'متوقف'}</span></label></span>
            <span role="cell"><button type="button" className="sl-x" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={`حذف ${row.name}`}>✕</button></span>
          </div>
        })}
      </div>
      <p className="sa-hint">با داشتن تنوع، قیمت و موجودی هر تنوع جدا حساب می‌شود و خریدار در صفحهٔ محصول تنوع را انتخاب می‌کند. تنوع حذف‌شده از فروش خارج می‌شود ولی در سفارش‌های قبلی باقی می‌ماند.</p>
    </>}
  </div>
}
