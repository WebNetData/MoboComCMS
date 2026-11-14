'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { DEVICE_COMPATIBILITY_STATUSES } from '@/modules/catalog/domain/device-compatibility'

type DeviceRow = { deviceModel: string; status: string; note: string; source: string }
const STATUS_FA: Record<string, string> = { COMPATIBLE: 'سازگار', INCOMPATIBLE: 'ناسازگار', CONDITIONAL: 'سازگار با شرط' }

export default function ProductDeviceCompatibilityEditor({ form, setForm }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>> }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const rows: DeviceRow[] = Array.isArray(form.deviceCompatibility) ? form.deviceCompatibility : []
  const update = (next: DeviceRow[]) => setForm(current => ({ ...current, deviceCompatibility: next }))
  return <section className="grid-column-span-3 card" aria-labelledby="device-compatibility-heading">
    <h3 id="device-compatibility-heading">{fa ? 'سازگاری با مدل دستگاه' : 'Device model compatibility'}</h3>
    <p className="muted text-sm">{fa ? 'فقط مدل‌هایی را ثبت کنید که با مشخصات واقعی بررسی کرده‌اید. جست‌وجوی فروشگاه تطبیق دقیق پس از یکسان‌سازی نویسه‌ها دارد.' : 'Add only models verified against actual specifications. Store lookup uses exact matching after character normalization.'}</p>
    {rows.map((row, index) => <fieldset className="store-admin-variant" key={index}>
      <legend>{fa ? `مدل ${index + 1}` : `Model ${index + 1}`}</legend>
      <div className="store-admin-grid">
        <label className="store-admin-field"><span>{fa ? 'مدل دقیق دستگاه' : 'Exact device model'}</span><input className="input" maxLength={120} dir="auto" value={row.deviceModel || ''} onChange={event => update(rows.map((item, i) => i === index ? { ...item, deviceModel: event.target.value } : item))} /></label>
        <label className="store-admin-field"><span>{fa ? 'وضعیت سازگاری' : 'Compatibility status'}</span><select className="select" value={row.status || 'COMPATIBLE'} onChange={event => update(rows.map((item, i) => i === index ? { ...item, status: event.target.value } : item))}>{DEVICE_COMPATIBILITY_STATUSES.map(status => <option key={status} value={status}>{fa ? STATUS_FA[status] : status === 'CONDITIONAL' ? 'Conditional' : status === 'INCOMPATIBLE' ? 'Incompatible' : 'Compatible'}</option>)}</select></label>
        <label className="store-admin-field"><span>{fa ? 'شرط یا توضیح' : 'Condition or note'}</span><input className="input" maxLength={500} dir="auto" value={row.note || ''} onChange={event => update(rows.map((item, i) => i === index ? { ...item, note: event.target.value } : item))} /></label>
        <label className="store-admin-field"><span>{fa ? 'منبع بررسی (اختیاری)' : 'Verification source (optional)'}</span><input className="input" maxLength={240} dir="auto" value={row.source || ''} onChange={event => update(rows.map((item, i) => i === index ? { ...item, source: event.target.value } : item))} /></label>
      </div>
      <button type="button" className="btn btn-ghost" aria-label={fa ? `حذف مدل ${row.deviceModel || index + 1}` : `Remove model ${row.deviceModel || index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}>{fa ? 'حذف مدل' : 'Remove model'}</button>
    </fieldset>)}
    <button type="button" className="btn btn-secondary" disabled={rows.length >= 100} onClick={() => update([...rows, { deviceModel: '', status: 'COMPATIBLE', note: '', source: '' }])}>+ {fa ? 'افزودن مدل' : 'Add model'}</button>
  </section>
}
