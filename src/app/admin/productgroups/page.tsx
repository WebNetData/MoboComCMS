'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

type Field = { key: string; label: string; labelEn: string; kind: 'text' | 'select' | 'color'; options: string[]; required: boolean; variant: boolean }
type Group = { id: number; name: string; nameEn: string; appliesTo: string; fields: string }
const emptyField = (): Field => ({ key: '', label: '', labelEn: '', kind: 'text', options: [], required: false, variant: false })

export default function ProductGroupsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [rows, setRows] = useState<Group[]>([])
  const [id, setId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [appliesTo, setAppliesTo] = useState('ANY')
  const [fields, setFields] = useState<Field[]>([])
  const [error, setError] = useState('')
  const load = useCallback(() => { fetch('/api/admin/cms?type=productgroups').then(r => r.ok ? r.json() : []).then(setRows) }, [])
  useEffect(load, [load])
  function edit(row: Group) { setId(row.id); setName(row.name); setNameEn(row.nameEn); setAppliesTo(row.appliesTo); try { setFields(JSON.parse(row.fields)) } catch { setFields([]) } setError('') }
  function reset() { setId(null); setName(''); setNameEn(''); setAppliesTo('ANY'); setFields([]); setError('') }
  function change(index: number, patch: Partial<Field>) { setFields(current => current.map((field, i) => i === index ? { ...field, ...patch } : field)) }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('')
    const res = await fetch('/api/admin/cms?type=productgroups', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, nameEn, appliesTo, fields }) })
    if (!res.ok) { const body = await res.json().catch(() => null); setError(body?.error || 'Save failed'); return }
    reset(); load()
  }
  async function remove(groupId: number) {
    if (!confirm(fa ? 'گروه حذف شود؟' : 'Delete this group?')) return
    const res = await fetch(`/api/admin/cms?type=productgroups&id=${groupId}`, { method: 'DELETE' })
    if (!res.ok) { const body = await res.json().catch(() => null); setError(body?.error || 'Delete failed'); return }
    load()
  }
  return <div className="cms-workspace"><div className="mb-6"><span className="content-eyebrow">MOBOCOMCMS / STORE</span><h1 className="h2 mt-3">{fa ? 'گروه‌های مشخصات محصول' : 'Product attribute groups'}</h1><p className="muted text-sm mt-3">{fa ? 'برای هر خانواده محصول، ویژگی‌های مربوط به همان خانواده را بسازید؛ سپس گروه را به دسته وصل کنید.' : 'Define the fields for a family of products, then assign the group to a category.'}</p></div>
    <form onSubmit={save} className="card store-admin-section"><div className="store-admin-grid"><label className="store-admin-field"><span>{fa ? 'نام گروه' : 'Group name'}</span><input className="input" required value={name} onChange={e => setName(e.target.value)} /></label><label className="store-admin-field"><span>English name</span><input className="input" value={nameEn} onChange={e => setNameEn(e.target.value)} /></label><label className="store-admin-field"><span>{fa ? 'برای نوع محصول' : 'Applies to'}</span><select className="select" value={appliesTo} onChange={e => setAppliesTo(e.target.value)}><option value="ANY">{fa ? 'همه' : 'All products'}</option><option value="VIRTUAL">{fa ? 'مجازی' : 'Virtual'}</option><option value="PHYSICAL">{fa ? 'فیزیکی' : 'Physical'}</option></select></label></div>
      <div className="flex justify-between items-center gap-2 mt-6"><h2>{fa ? 'فیلدهای مشخصات' : 'Attribute fields'}</h2><button type="button" className="btn btn-ghost" onClick={() => setFields(old => [...old, emptyField()])}>+ {fa ? 'فیلد' : 'Field'}</button></div>
      {fields.map((field, index) => <div className="store-admin-variant" key={index}>
        <div className="store-admin-grid">
          <label className="store-admin-field"><span>Key (Latin)</span><input className="input" dir="ltr" required pattern="[a-z][a-z0-9_]*" value={field.key} onChange={e => change(index, { key: e.target.value })} /></label>
          <label className="store-admin-field"><span>{fa ? 'عنوان فارسی' : 'Persian label'}</span><input className="input" required value={field.label} onChange={e => change(index, { label: e.target.value })} /></label>
          <label className="store-admin-field"><span>English label</span><input className="input" value={field.labelEn} onChange={e => change(index, { labelEn: e.target.value })} /></label>
          <label className="store-admin-field"><span>{fa ? 'نوع' : 'Type'}</span><select className="select" value={field.kind} onChange={e => change(index, { kind: e.target.value as Field['kind'] })}><option value="text">Text</option><option value="select">Options</option><option value="color">Color</option></select></label>
          {field.kind !== 'text' && <label className="store-admin-field"><span>{fa ? 'گزینه‌ها، جداشده با ویرگول' : 'Options, comma separated'}</span><input className="input" value={field.options.join(', ')} onChange={e => change(index, { options: e.target.value.split(',').map(x => x.trim()) })} /></label>}
        </div>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={field.required} onChange={e => change(index, { required: e.target.checked })} />{fa ? 'اجباری' : 'Required'}</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={field.variant || false} onChange={e => change(index, { variant: e.target.checked })} />{fa ? 'ویژگی گونهٔ قابل خرید (مانند رنگ یا نوع حساب)' : 'Purchasable variant option (such as color or account type)'}</label>
        <button type="button" className="btn btn-ghost" onClick={() => setFields(old => old.filter((_, i) => i !== index))}>{fa ? 'حذف فیلد' : 'Remove field'}</button>
      </div>)}
      {error && <p className="error-text">{error}</p>}<div className="flex gap-2 mt-6"><button className="btn btn-primary">{id ? fa ? 'ذخیره' : 'Save' : fa ? 'ساخت گروه' : 'Create group'}</button>{id && <button type="button" className="btn btn-ghost" onClick={reset}>{fa ? 'انصراف' : 'Cancel'}</button>}</div>
    </form>
    <div className="store-admin-list mt-6">{rows.map(row => <div className="card" key={row.id}><strong>{fa ? row.name : row.nameEn || row.name}</strong><p className="muted text-sm">{(() => { try { return JSON.parse(row.fields).length } catch { return 0 } })()} {fa ? 'فیلد' : 'fields'}</p><div className="flex gap-2 mt-4"><button className="btn btn-ghost" onClick={() => edit(row)}>{fa ? 'ویرایش' : 'Edit'}</button><button className="btn btn-ghost" onClick={() => remove(row.id)}>{fa ? 'حذف' : 'Delete'}</button></div></div>)}</div>
  </div>
}
