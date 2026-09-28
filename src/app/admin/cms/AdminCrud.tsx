'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import dynamic from 'next/dynamic'
import Link from '@/components/AppLink'
import CoverField from './CoverField'
import CategoryPicker from './CategoryPicker'
import AiAutofill from './AiAutofill'
import PublishReview, { previewValue, type ReviewRow } from './PublishReview'
import type { AutofillField } from '@/modules/ai/domain/autofill'

const RichEditor = dynamic(() => import('@/components/RichEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

export interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'multiselect' | 'richtext' | 'image'
  options?: { value: string; label: string }[]
  optionsFromRows?: (rows: any[], editId: number | null) => { value: string; label: string }[]
  hideInTable?: boolean
  required?: boolean
  dir?: 'ltr' | 'rtl'
}

interface Props {
  type: string
  fields: FieldDef[]
  titleKey?: string
  extraRows?: (row: any) => Record<string, string>
  editorExtraKeys?: string[]
  renderEditorExtra?: (form: Record<string, any>, setForm: React.Dispatch<React.SetStateAction<Record<string, any>>>) => React.ReactNode
  headerActions?: React.ReactNode
}

export default function AdminCrud({ type, fields, titleKey = 'title', extraRows, editorExtraKeys = [], renderEditorExtra, headerActions }: Props) {
  const { t, locale } = useI18n()
  const fa = locale === 'fa'
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [form, setForm] = useState<Record<string, any>>({})
  const [editId, setEditId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  // Values the assistant proposed; a field counts as "AI" until the editor changes it.
  const [aiValues, setAiValues] = useState<Record<string, unknown>>({})
  const [review, setReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [originalStatus, setOriginalStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/cms?type=${type}`)
    if (res.ok) setRows(await res.json())
    setLoading(false)
  }, [type])

  useEffect(() => {
    load()
  }, [load])

  function emptyForm() {
    const f: Record<string, any> = {}
    for (const fl of fields) f[fl.key] = fl.type === 'multiselect' ? [] : fl.type === 'checkbox' ? false : fl.type === 'select' ? fl.options?.[0]?.value || '' : ''
    for (const key of editorExtraKeys) f[key] = key === 'variants' || key === 'faqs' || key === 'gallery' ? [] : {}
    setForm(f)
    setAiValues({})
    setOriginalStatus('')
  }

  function edit(row: any) {
    const f: Record<string, any> = {}
    for (const fl of fields) f[fl.key] = row[fl.key] ?? (fl.type === 'multiselect' ? [] : fl.type === 'checkbox' ? false : '')
    for (const key of editorExtraKeys) f[key] = row[key] ?? (key === 'variants' || key === 'faqs' || key === 'gallery' ? [] : {})
    if (fields.some((x) => x.key === 'categoryId')) f.categoryId = row.categoryId || ''
    setForm(f)
    setEditId(row.id)
    setShowForm(true)
    setAiValues({})
    setOriginalStatus(row.status || '')
  }

  const isAi = (key: string) => key in aiValues && JSON.stringify(form[key]) === JSON.stringify(aiValues[key])
  const aiUsed = Object.keys(aiValues).some(isAi)
  const publishable = ['posts', 'pages', 'products'].includes(type)
  const hasStatus = fields.some((fl) => fl.key === 'status')
  // Going live (new, draft → published, or with AI-filled fields) needs a final review and confirmation.
  const needsReview = publishable && (hasStatus ? form.status === 'PUBLISHED' && (!editId || originalStatus !== 'PUBLISHED' || aiUsed) : !editId || aiUsed)
  const aiFields: AutofillField[] = publishable ? fields.flatMap((fl): AutofillField[] => {
    if (['status', 'access', 'featured', 'active'].includes(fl.key)) return []
    const base = { key: fl.key, label: fl.label, dir: fl.dir }
    switch (fl.type || 'text') {
      case 'text': return [{ ...base, type: fl.key === 'slug' ? 'slug' : 'text' }]
      case 'textarea': return [{ ...base, type: 'textarea' }]
      case 'richtext': return [{ ...base, type: 'richtext' }]
      case 'number': return [{ ...base, type: 'number' }]
      case 'checkbox': return [{ ...base, type: 'checkbox' }]
      case 'select': { const options = (fl.optionsFromRows?.(rows, editId) || fl.options || []).filter((o) => o.value !== ''); return options.length ? [{ ...base, type: 'select', options }] : [] }
      case 'multiselect': return fl.options?.length ? [{ ...base, type: 'multiselect', options: fl.options }] : []
      default: return []
    }
  }) : []
  const applyAi = (values: Record<string, unknown>, filled: string[]) => {
    const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fields.find((fl) => fl.key === key)?.type === 'number' && typeof value === 'number' ? String(value) : value]))
    setForm((current) => ({ ...current, ...next }))
    setAiValues((current) => { const out = { ...current }; for (const key of Object.keys(next)) { if (filled.includes(key)) out[key] = next[key]; else delete out[key] } return out })
  }
  const reviewRows: ReviewRow[] = fields.map((fl) => {
    const value = previewValue(form[fl.key], fl.optionsFromRows?.(rows, editId) || fl.options)
    return { key: fl.key, label: fl.label, value, state: !value && fl.required ? 'missing' : isAi(fl.key) ? 'ai' : value ? 'ok' : 'empty' }
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (uploading) return
    if (needsReview && !review) { setReview(true); return }
    await persist()
  }

  async function persist() {
    if (uploading || saving) return
    setSaving(true)
    setMsg('')
    const res = await fetch(`/api/admin/cms?type=${type}`, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { ...form, id: editId } : form),
    }).catch(() => null)
    if (!res) { setSaving(false); setMsg(t.errGeneric); return }
    const data = await res.json().catch(() => null)
    setSaving(false)
    setReview(false)
    if (!res.ok) {
      setMsg(data?.error || t.errGeneric)
      return
    }
    setEditId(null)
    setShowForm(false)
    emptyForm()
    load()
  }

  async function remove(id: number) {
    if (!confirm(t.confirmDelete)) return
    const res = await fetch(`/api/admin/cms?type=${type}&id=${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) setMsg(data?.error || t.errGeneric)
    load()
  }

  const tableFields = fields.filter((f) => !f.hideInTable)
  const visibleRows = rows.filter(row => [row.title, row.titleEn, row.name, row.nameEn, row.slug].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const names: Record<string, string> = { pages: fa ? 'صفحه‌های سایت' : 'Pages', posts: fa ? 'نوشته‌ها' : 'Articles', products: fa ? 'محصولات فروشگاه' : 'Products', postcats: fa ? 'دسته‌بندی نوشته‌ها' : 'Article categories', productcats: fa ? 'دسته‌بندی محصولات' : 'Product categories' }
  const publicPath = type === 'pages' ? '/p/' : type === 'posts' ? '/blog/' : type === 'products' ? '/products/' : ''

  return (
    <div className="cms-workspace">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><span className="content-eyebrow">{fa ? 'مدیریت محتوا' : 'Content workspace'}</span><h1 className="h2 mt-3">{names[type] || type}</h1><p className="muted text-sm mt-3">{fa ? 'محتوا را بسازید، ویرایش کنید و زمان انتشار را خودتان انتخاب کنید.' : 'Create, edit and publish on your own schedule.'}</p></div>
        <div className="flex gap-2">
          {headerActions}
          {msg && <span className="error-text self-center">{msg}</span>}
          <button className="btn btn-primary" disabled={uploading} onClick={() => { setEditId(null); emptyForm(); setShowForm(!showForm) }}>
            {showForm ? t.cancel : `+ ${t.add}`}
          </button>
        </div>
      </div>
      <div className="cms-summary"><div><span>{fa ? 'همه موارد' : 'Total'}</span><b>{rows.length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>{publicPath && <div><span>{fa ? 'منتشرشده / فعال' : 'Published / active'}</span><b>{rows.filter(row => row.status === 'PUBLISHED' || row.active === true).length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>}<label className="cms-search"><span>{fa ? 'جست‌وجو در فهرست' : 'Search entries'}</span><input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={fa ? 'عنوان یا نشانی…' : 'Title or slug…'} /></label></div>

      {showForm && (
        <form onSubmit={save} className="card mb-6 grid-3 items-end">
          {aiFields.length > 0 && <div className="grid-column-span-3"><AiAutofill section={type} fields={aiFields} form={form} onApply={applyAi} /></div>}
          {fields.map((fl) => (
            <div key={fl.key} className={`${fl.type === 'multiselect' || fl.type === 'textarea' || fl.type === 'richtext' || fl.type === 'image' ? 'grid-column-span-3' : ''}${isAi(fl.key) ? ' is-ai' : ''}`}>
              <label className="label">{fl.label}{isAi(fl.key) && <span className="ai-badge">پیشنهاد AI</span>}</label>
              {fl.type === 'multiselect' ? <CategoryPicker label={fl.label} options={fl.options || []} value={form[fl.key] || []} onChange={value => setForm(current => ({ ...current, [fl.key]: value }))} /> : fl.type === 'image' ? <CoverField value={form[fl.key] || ''} title={form[fa ? 'title' : 'titleEn'] || form.title || ''} onChange={value => setForm(current => ({ ...current, [fl.key]: value }))} onBusy={setUploading} /> : fl.type === 'richtext' ? (
                <RichEditor
                  value={form[fl.key] || ''}
                  onChange={(html) => setForm({ ...form, [fl.key]: html })}
                  placeholder={fl.label}
                  dir={fl.dir || (fl.key.toLowerCase().includes('en') ? 'ltr' : 'rtl')}
                />
              ) : fl.type === 'textarea' ? (
                <textarea className="textarea" rows={fl.key === 'content' || fl.key === 'contentEn' ? 6 : 3} dir={fl.dir} value={form[fl.key] || ''} onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })} required={fl.required} />
              ) : fl.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm" style={{ minHeight: '2.75rem' }}>
                  <input type="checkbox" checked={form[fl.key] === true} onChange={(e) => setForm({ ...form, [fl.key]: e.target.checked })} />
                  {fl.label}
                </label>
              ) : fl.type === 'select' ? (
                <select aria-label={fl.label} className="select" value={String(form[fl.key] ?? '')} onChange={(e) => setForm(type === 'products' && fl.key === 'categoryId' ? { ...form, categoryId: e.target.value, specifications: {}, variants: [] } : { ...form, [fl.key]: e.target.value })}>
                  {(fl.optionsFromRows?.(rows, editId) || fl.options)?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  dir={fl.dir}
                  type={fl.type === 'number' ? 'number' : 'text'}
                  step={fl.key === 'price' ? '0.01' : undefined}
                  value={form[fl.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })}
                  required={fl.required}
                />
              )}
            </div>
          ))}
          {renderEditorExtra?.(form, setForm)}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={uploading || saving}>{needsReview ? (fa ? 'بازبینی و انتشار' : 'Review & publish') : editId ? t.save : t.add}</button>
            <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => { setEditId(null); emptyForm(); setShowForm(false) }}>{t.cancel}</button>
          </div>
          <PublishReview open={review} title={String(form[titleKey] || form.title || '')} rows={reviewRows} busy={saving} onCancel={() => setReview(false)} onConfirm={() => void persist()} />
        </form>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="muted text-center py-6">{t.loading}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                {tableFields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const extra = extraRows ? extraRows(row) : {}
                return (
                  <tr key={row.id}>
                    <td className="num">{row.id}</td>
                    {tableFields.map((f) => {
                      if (extra[f.key] !== undefined) {
                        return <td key={f.key}>{extra[f.key]}</td>
                      }
                      if (f.optionsFromRows) return <td key={f.key}>{f.optionsFromRows(rows, null).find(option => option.value === String(row[f.key] ?? ''))?.label || '—'}</td>
                      const v = row[f.key]
                      if (typeof v === 'boolean') return <td key={f.key}>{v ? '✅' : '—'}</td>
                      const str = String(v ?? '')
                      return <td key={f.key} className={str.length > 60 ? 'muted' : ''}>{str.length > 60 ? str.slice(0, 60) + '…' : str || '—'}</td>
                    })}
                    <td>
                      <div className="flex gap-1">
                        <button className="badge badge-purple" disabled={uploading} onClick={() => edit(row)}>{t.edit}</button>
                        {type === 'pages' && <Link className="badge badge-purple" href={`/admin/builder/${row.id}`}>{fa ? 'صفحه‌ساز' : 'Visual builder'}</Link>}
                        {type === 'posts' && <Link className="badge badge-purple" href={`/admin/builder/post-${row.id}`}>{fa ? 'صفحه‌ساز' : 'Visual builder'}</Link>}
                        {type === 'products' && <Link className="badge badge-purple" href={`/admin/builder/product-${row.id}`}>{fa ? 'صفحه‌ساز' : 'Visual builder'}</Link>}
                        {publicPath && (row.status === 'PUBLISHED' || row.active === true) && <Link className="badge badge-gray" href={`${publicPath}${row.slug}`} target="_blank" rel="noopener noreferrer">{fa ? 'مشاهده ↗' : 'View ↗'}</Link>}
                        <button className="badge badge-red" onClick={() => remove(row.id)}>{t.delete}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {visibleRows.length === 0 && (
                <tr><td colSpan={tableFields.length + 2} className="muted text-center py-8">{fa ? 'موردی پیدا نشد.' : 'No entries found.'}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
