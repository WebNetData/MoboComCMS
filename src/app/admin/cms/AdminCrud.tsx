'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import dynamic from 'next/dynamic'
import Link from '@/components/AppLink'
import CoverField from './CoverField'
import CategoryPicker from './CategoryPicker'
import AiAutofill from './AiAutofill'
import PublishReview, { previewValue, type ReviewRow } from './PublishReview'
import BulkActions, { runBulkAction, type BulkAction } from './BulkActions'
import AdminPagination from './AdminPagination'
import type { AdminPageSize } from '@/modules/content/domain/admin-pagination'
import type { AutofillField } from '@/modules/ai/domain/autofill'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

// Left out of the form while the VIP module is off; the stored value is not touched by a save without them.
const VIP_FIELD_KEYS = ['access', 'memberPrice', 'vipGiftDays']

const RichEditor = dynamic(() => import('@/components/editor/ContentEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

export interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'datetime-local' | 'checkbox' | 'select' | 'multiselect' | 'richtext' | 'image'
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
  renderEditorExtra?: (form: Record<string, any>, setForm: React.Dispatch<React.SetStateAction<Record<string, any>>>, editId: number | null) => React.ReactNode
  headerActions?: React.ReactNode
}

function localDateTime(value: unknown): string {
  if (!value) return ''
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AdminCrud({ type, fields: allFields, titleKey = 'title', extraRows, editorExtraKeys = [], renderEditorExtra, headerActions }: Props) {
  const vipOn = useModuleEnabled('membership')
  const fields = useMemo(() => (vipOn ? allFields : allFields.filter((field) => !VIP_FIELD_KEYS.includes(field.key))), [allFields, vipOn])
  const formId = useId()
  const { t, locale } = useI18n()
  const fa = locale === 'fa'
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<AdminPageSize>(20)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [overall, setOverall] = useState(0)
  const [published, setPublished] = useState<number | null>(null)
  // A section author sees only their own items and asks for a delete; a manager decides what waits in the trash.
  const [mine, setMine] = useState(false)
  const [trashed, setTrashed] = useState(0)
  const [optionRows, setOptionRows] = useState<any[] | null>(null)
  const loadId = useRef(0)
  const initialDateValues = useRef<Record<string, string>>({})
  const [rows, setRows] = useState<any[]>([])
  const [form, setForm] = useState<Record<string, any>>({})
  const [editId, setEditId] = useState<number | null>(null)
  // Pages and articles are written in the block editor while its plugin is on; with the plugin off this form is the old one again.
  const [blockEditor, setBlockEditor] = useState(false)
  useEffect(() => {
    if (type !== 'pages' && type !== 'posts') return
    fetch('/api/admin/editor', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((state) => setBlockEditor(state?.enabled === true)).catch(() => setBlockEditor(false))
  }, [type])
  const blockDriven = (type === 'pages' || type === 'posts') && blockEditor
  // The body of an item written in blocks is its document: with the plugin off it is shown as it stands and not sent.
  const blocksLocked = (type === 'pages' || type === 'posts') && !blockEditor
  const [editFormat, setEditFormat] = useState('legacy')
  const [legacyBody, setLegacyBody] = useState(false)
  const [msg, setMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  // Values the assistant proposed; a field counts as "AI" until the editor changes it.
  const [aiValues, setAiValues] = useState<Record<string, unknown>>({})
  const [review, setReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [originalStatus, setOriginalStatus] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkMsg, setBulkMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const requestId = ++loadId.current
    setLoading(true)
    const params = new URLSearchParams({ type, paged: '1', page: String(page), limit: String(pageSize), q: search })
    const res = await fetch(`/api/admin/cms?${params}`).catch(() => null)
    const data = await res?.json().catch(() => null)
    if (requestId !== loadId.current) return
    if (res?.ok && Array.isArray(data?.rows)) {
      setRows(data.rows)
      setTotal(data.total)
      setOverall(data.overall)
      setPublished(data.published)
      setMine(data.mine === true)
      setTrashed(Number(data.trashed) || 0)
      setPages(data.pages)
      if (data.page !== page) setPage(data.page)
      setMsg('')
    } else setMsg(data?.error || t.errGeneric)
    setLoading(false)
  }, [type, page, pageSize, search, t.errGeneric])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setSearch(query.trim()) }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (type !== 'productcats') return
    fetch('/api/admin/cms?type=productcats&options=1').then((res) => res.ok ? res.json() : []).then((data) => setOptionRows(Array.isArray(data) ? data : [])).catch(() => setOptionRows([]))
  }, [type, overall])

  function emptyForm() {
    const f: Record<string, any> = {}
    for (const fl of fields) f[fl.key] = fl.type === 'multiselect' ? [] : fl.type === 'checkbox' ? false : fl.type === 'select' ? fl.options?.[0]?.value || '' : ''
    for (const key of editorExtraKeys) f[key] = key === 'variants' || key === 'faqs' || key === 'gallery' || key === 'itemLinks' || key === 'relationships' || key === 'bundles' ? [] : {}
    setForm(f)
    initialDateValues.current = {}
    setAiValues({})
    setOriginalStatus('')
  }

  function edit(row: any) {
    const f: Record<string, any> = {}
    for (const fl of fields) f[fl.key] = fl.type === 'datetime-local' ? localDateTime(row[fl.key]) : row[fl.key] ?? (fl.type === 'multiselect' ? [] : fl.type === 'checkbox' ? false : '')
    initialDateValues.current = Object.fromEntries(fields.filter((fl) => fl.type === 'datetime-local').map((fl) => [fl.key, f[fl.key]]))
    for (const key of editorExtraKeys) f[key] = row[key] ?? (key === 'variants' || key === 'faqs' || key === 'gallery' || key === 'itemLinks' || key === 'relationships' || key === 'bundles' ? [] : {})
    if (Array.isArray(f.bundles)) f.bundles = f.bundles.map((bundle: any) => ({ ...bundle, clientKey: crypto.randomUUID(), components: bundle.components.map((component: any) => ({ ...component, clientKey: crypto.randomUUID() })) }))
    if (fields.some((x) => x.key === 'categoryId')) f.categoryId = row.categoryId || ''
    setForm(f)
    setEditId(row.id)
    setEditFormat(row.editorFormat === 'blocks-v1' ? 'blocks-v1' : 'legacy')
    setLegacyBody(false)
    setShowForm(true)
    setAiValues({})
    setOriginalStatus(row.status || '')
  }

  // Opened from a public page ("edit this post"): ?edit=<id> loads that one row and opens its form.
  const linked = useRef(false)
  useEffect(() => {
    if (linked.current) return
    linked.current = true
    const id = Number(new URLSearchParams(window.location.search).get('edit'))
    if (!Number.isSafeInteger(id) || id <= 0) return
    fetch(`/api/admin/cms?type=${type}&id=${id}`).then((res) => res.ok ? res.json() : null).then((data) => {
      const row = (Array.isArray(data) ? data : data?.rows || []).find((item: any) => item.id === id)
      if (row) edit(row); else setMsg(t.errGeneric)
    }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isAi = (key: string) => key in aiValues && JSON.stringify(form[key]) === JSON.stringify(aiValues[key])
  const aiUsed = Object.keys(aiValues).some(isAi)
  const publishable = ['posts', 'pages', 'products'].includes(type)
  const hasStatus = fields.some((fl) => fl.key === 'status')
  // Going live (new, draft → published, or with AI-filled fields) needs a final review and confirmation.
  const dateChanged = fields.some((fl) => fl.type === 'datetime-local' && form[fl.key] !== initialDateValues.current[fl.key])
  const scheduledPost = type === 'posts' && form.status === 'PUBLISHED' && form.publishedAt && new Date(String(form.publishedAt)).getTime() > Date.now()
  const needsReview = publishable && (hasStatus ? form.status === 'PUBLISHED' && (!editId || originalStatus !== 'PUBLISHED' || aiUsed || dateChanged) : !editId || aiUsed)
  const aiFields: AutofillField[] = publishable ? fields.flatMap((fl): AutofillField[] => {
    if (['status', 'access', 'featured', 'active'].includes(fl.key)) return []
    const base = { key: fl.key, label: fl.label, dir: fl.dir }
    switch (fl.type || 'text') {
      case 'text': return [{ ...base, type: fl.key === 'slug' ? 'slug' : 'text' }]
      case 'textarea': return [{ ...base, type: 'textarea' }]
      case 'richtext': return [{ ...base, type: 'richtext' }]
      case 'number': return [{ ...base, type: 'number' }]
      case 'checkbox': return [{ ...base, type: 'checkbox' }]
      case 'select': { const options = (fl.optionsFromRows?.(optionRows || rows, editId) || fl.options || []).filter((o) => o.value !== ''); return options.length ? [{ ...base, type: 'select', options }] : [] }
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
    const value = previewValue(form[fl.key], fl.optionsFromRows?.(optionRows || rows, editId) || fl.options)
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
    const payload = { ...form }
    // The body is the block editor's: a new item starts empty, and this form does not send a body it did not edit.
    if (blockDriven) { if (!editId) payload.content = ''; else if (!legacyBody) delete payload.content }
    if (blocksLocked && editId && editFormat === 'blocks-v1') delete payload.content
    for (const fl of fields) if (fl.type === 'datetime-local') {
      if (editId && payload[fl.key] === initialDateValues.current[fl.key]) { delete payload[fl.key]; continue }
      if (payload[fl.key]) {
        const date = new Date(String(payload[fl.key]))
        if (!Number.isFinite(date.getTime())) { setMsg(fa ? 'زمان انتشار معتبر نیست.' : 'Invalid publication date.'); return }
        payload[fl.key] = date.toISOString()
      }
    }
    setSaving(true)
    setMsg('')
    const res = await fetch(`/api/admin/cms?type=${type}`, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { ...payload, id: editId } : payload),
    }).catch(() => null)
    if (!res) { setSaving(false); setMsg(t.errGeneric); return }
    const data = await res.json().catch(() => null)
    setSaving(false)
    setReview(false)
    if (!res.ok) {
      setMsg(data?.error || t.errGeneric)
      return
    }
    // A new page or article goes straight to the block editor for its body.
    if (blockDriven && !editId && data?.id) { window.location.assign(`/admin/editor/${type}/${data.id}`); return }
    setEditId(null)
    setShowForm(false)
    emptyForm()
    load()
  }

  async function remove(id: number) {
    if (bulkBusy) return
    if (!confirm(mine ? 'این مورد به سطل زباله می‌رود و از سایت برداشته می‌شود؛ حذف نهایی یا بازگردانی آن با مدیر بخش است. ادامه می‌دهید؟' : t.confirmDelete)) return
    const res = await fetch(`/api/admin/cms?type=${type}&id=${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) setMsg(data?.error || t.errGeneric)
    else if (data?.trashed) setMsg('به سطل زباله رفت و منتظر تصمیم مدیر بخش است.')
    else setSelected((current) => { const next = new Set(current); next.delete(id); return next })
    load()
  }

  /** A manager puts a trashed item back as it was. */
  async function restore(id: number) {
    if (bulkBusy) return
    const res = await fetch(`/api/admin/cms?type=${type}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, restore: true }) })
    const data = await res.json().catch(() => null)
    setMsg(res.ok ? 'از سطل زباله برگشت.' : data?.error || t.errGeneric)
    load()
  }

  const tableFields = fields.filter((f) => !f.hideInTable)
  const visibleRows = rows
  const bulkEnabled = type === 'posts' || type === 'pages'
  const visibleIds = visibleRows.map((row) => Number(row.id))
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const toggleSelected = (id: number) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAllVisible = () => setSelected((current) => {
    const next = new Set(current)
    if (visibleIds.every((id) => next.has(id))) visibleIds.forEach((id) => next.delete(id))
    else visibleIds.forEach((id) => next.add(id))
    return next
  })
  async function applyBulk(action: BulkAction) {
    const ids = [...selected]
    if (!ids.length || bulkBusy) return
    setBulkBusy(true)
    setBulkProgress(0)
    setBulkMsg(null)
    const result = await runBulkAction('/api/admin/cms', type, ids, action, setBulkProgress)
    setSelected(new Set(result.failed.map((item) => item.id)))
    setBulkBusy(false)
    const label = action === 'delete' ? (fa ? 'حذف' : 'deleted') : action === 'draft' ? (fa ? 'پیش‌نویس' : 'moved to draft') : (fa ? 'منتشر' : 'published')
    setBulkMsg({ tone: result.failed.length ? 'err' : 'ok', text: fa
      ? `${result.succeeded.length.toLocaleString('fa-IR')} مورد ${label} شد.${result.failed.length ? ` ${result.failed.length.toLocaleString('fa-IR')} مورد ناموفق بود: ${result.failed.slice(0, 3).map((item) => `#${item.id} ${item.reason}`).join('، ')}` : ''}`
      : `${result.succeeded.length} items ${label}.${result.failed.length ? ` ${result.failed.length} failed: ${result.failed.slice(0, 3).map((item) => `#${item.id} ${item.reason}`).join(', ')}` : ''}` })
    await load()
  }
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
      <div className="cms-summary"><div><span>{fa ? 'همه موارد' : 'Total'}</span><b>{overall.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>{publicPath && <div><span>{fa ? 'منتشرشده / فعال' : 'Published / active'}</span><b>{(published ?? 0).toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>}{trashed > 0 && <div><span>{mine ? 'در سطل زباله، منتظر مدیر' : 'در سطل زباله، منتظر تصمیم شما'}</span><b>{trashed.toLocaleString('fa-IR')}</b></div>}<label className="cms-search"><span>{fa ? 'جست‌وجو در فهرست' : 'Search entries'}</span><input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={fa ? 'عنوان یا نشانی…' : 'Title or slug…'} /></label></div>

      <AdminPagination fa={fa} page={page} pages={pages} size={pageSize} total={total} shown={rows.length} busy={loading || bulkBusy} onPage={setPage} onSize={(size) => { setPage(1); setPageSize(size) }} />

      {bulkEnabled && <><BulkActions count={selected.size} canPublish fa={fa} busy={bulkBusy} progress={bulkProgress} onApply={applyBulk} onClear={() => setSelected(new Set())} />{bulkMsg && <p className={bulkMsg.tone === 'err' ? 'error-text cms-bulk-message' : 'cms-bulk-message'} role="status">{bulkMsg.text}</p>}</>}

      {showForm && (
        <form onSubmit={save} className="card mb-6 grid-3 items-end">
          {editId && (type === 'posts' || type === 'pages' || type === 'products') && <div className="grid-column-span-3"><a className="text-sm" href={`/admin/history?type=${type}&id=${editId}`} target="_blank" rel="noreferrer">{fa ? 'تاریخچهٔ نسخه‌ها' : 'Version history'}</a></div>}
          {aiFields.length > 0 && <div className="grid-column-span-3"><AiAutofill section={type} fields={aiFields} form={form} onApply={applyAi} /></div>}
          {fields.map((fl) => (
            <div key={fl.key} className={`${fl.type === 'multiselect' || fl.type === 'textarea' || fl.type === 'richtext' || fl.type === 'image' ? 'grid-column-span-3' : ''}${isAi(fl.key) ? ' is-ai' : ''}`}>
              {!['checkbox', 'multiselect', 'image', 'richtext'].includes(fl.type || '') ? <label className="label" htmlFor={`${formId}-${fl.key}`}>{fl.label}{isAi(fl.key) && <span className="ai-badge">پیشنهاد AI</span>}</label> : <span className="label">{fl.label}{isAi(fl.key) && <span className="ai-badge">پیشنهاد AI</span>}</span>}
              {blockDriven && fl.key === 'content' && !legacyBody ? (
                <div className="cms-block-body">
                  {editId ? <a className="btn btn-primary" href={`/admin/editor/${type}/${editId}`}>{fa ? 'نوشتن متن در ویرایشگر بلوکی' : 'Write the body in the block editor'}</a> : <p className="muted text-sm">{fa ? 'پس از ذخیره، برای نوشتن متن به ویرایشگر بلوکی می‌روید.' : 'After saving you go to the block editor to write the body.'}</p>}
                  {editId && editFormat === 'legacy' ? <p className="muted text-sm">{fa ? 'این مورد هنوز با ویرایشگر قدیمی نوشته شده است؛ ویرایشگر بلوکی متن فعلی را به بلوک تبدیل می‌کند و تا ذخیره نکنید چیزی عوض نمی‌شود. ' : 'This item is still written in the old editor; the block editor turns its body into blocks and changes nothing until you save. '}<button type="button" className="link" onClick={() => setLegacyBody(true)}>{fa ? 'ادامه با ویرایشگر قدیمی' : 'Keep using the old editor'}</button></p> : null}
                </div>
              ) : blocksLocked && fl.key === 'content' && editId && editFormat === 'blocks-v1' ? (
                <p className="muted text-sm cms-block-body">{fa ? 'متن این مورد با ویرایشگر بلوکی نوشته شده است و سر جایش است. برای ویرایش آن، افزونهٔ «ویرایشگر بلوکی» را از صفحهٔ افزونه‌ها فعال کنید.' : 'The body of this item is written in blocks and is kept. To edit it, turn the Block editor plugin on.'}</p>
              ) : fl.type === 'multiselect' ? <CategoryPicker label={fl.label} options={fl.options || []} value={form[fl.key] || []} onChange={value => setForm(current => ({ ...current, [fl.key]: value }))} /> : fl.type === 'image' ? <CoverField value={form[fl.key] || ''} title={form[fa ? 'title' : 'titleEn'] || form.title || ''} onChange={value => setForm(current => ({ ...current, [fl.key]: value }))} onBusy={setUploading} /> : fl.type === 'richtext' ? (
                <RichEditor
                  value={form[fl.key] || ''}
                  onChange={(html) => setForm({ ...form, [fl.key]: html })}
                  placeholder={fl.label}
                  dir={fl.dir || (/En$/.test(fl.key) ? 'ltr' : 'rtl')}
                />
              ) : fl.type === 'textarea' ? (
                <textarea id={`${formId}-${fl.key}`} className="textarea" rows={fl.key === 'content' || fl.key === 'contentEn' ? 6 : 3} dir={fl.dir} value={form[fl.key] || ''} onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })} required={fl.required} />
              ) : fl.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm" style={{ minHeight: '2.75rem' }}>
                  <input type="checkbox" checked={form[fl.key] === true} onChange={(e) => setForm({ ...form, [fl.key]: e.target.checked })} />
                  {fl.label}
                </label>
              ) : fl.type === 'select' ? (
                <select id={`${formId}-${fl.key}`} aria-label={fl.label} className="select" value={String(form[fl.key] ?? '')} onChange={(e) => setForm(type === 'products' && fl.key === 'categoryId' ? { ...form, categoryId: e.target.value, specifications: {}, variants: [] } : { ...form, [fl.key]: e.target.value })}>
                  {(fl.optionsFromRows?.(optionRows || rows, editId) || fl.options)?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${formId}-${fl.key}`}
                  className="input"
                  dir={fl.dir}
                  type={fl.type === 'number' ? 'number' : fl.type === 'datetime-local' ? 'datetime-local' : 'text'}
                  step={fl.key === 'price' ? '0.01' : undefined}
                  value={form[fl.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })}
                  required={fl.required}
                />
              )}
            </div>
          ))}
          {renderEditorExtra?.(form, setForm, editId)}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1" disabled={uploading || saving}>{needsReview ? scheduledPost ? (fa ? 'بازبینی و زمان‌بندی' : 'Review & schedule') : (fa ? 'بازبینی و انتشار' : 'Review & publish') : editId ? t.save : t.add}</button>
            <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => { setEditId(null); emptyForm(); setShowForm(false) }}>{t.cancel}</button>
          </div>
          <PublishReview open={review} title={String(form[titleKey] || form.title || '')} rows={reviewRows} busy={saving} scheduled={Boolean(scheduledPost)} onCancel={() => setReview(false)} onConfirm={() => void persist()} />
        </form>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="muted text-center py-6">{t.loading}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                {bulkEnabled && <th><input type="checkbox" aria-label={fa ? 'انتخاب همه موارد نمایش‌داده‌شده' : 'Select all visible items'} checked={allVisibleSelected} disabled={bulkBusy || !visibleIds.length} onChange={toggleAllVisible} /></th>}
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
                const scheduled = type === 'posts' && row.status === 'PUBLISHED' && new Date(row.publishedAt).getTime() > Date.now()
                return (
                  <tr key={row.id} className={selected.has(row.id) ? 'is-selected' : ''}>
                    {bulkEnabled && <td><input type="checkbox" aria-label={`${fa ? 'انتخاب' : 'Select'} ${row[titleKey] || row.title || `#${row.id}`}`} checked={selected.has(row.id)} disabled={bulkBusy} onChange={() => toggleSelected(row.id)} /></td>}
                    <td className="num">{row.id}</td>
                    {tableFields.map((f) => {
                      if (extra[f.key] !== undefined) {
                        return <td key={f.key}>{extra[f.key]}</td>
                      }
                      if (scheduled && f.key === 'status') return <td key={f.key}><span className="badge badge-purple">{fa ? 'زمان‌بندی‌شده' : 'Scheduled'}</span></td>
                      if (f.optionsFromRows) return <td key={f.key}>{f.optionsFromRows(optionRows || rows, null).find(option => option.value === String(row[f.key] ?? ''))?.label || '—'}</td>
                      const v = row[f.key]
                      if (typeof v === 'boolean') return <td key={f.key}>{v ? '✅' : '—'}</td>
                      const str = String(v ?? '')
                      return <td key={f.key} className={str.length > 60 ? 'muted' : ''}>{str.length > 60 ? str.slice(0, 60) + '…' : str || '—'}</td>
                    })}
                    <td>
                      {row.status === 'TRASHED' ? <div className="flex gap-1" data-testid="trash-row">
                        <span className="badge badge-gray">در سطل زباله</span>
                        {mine ? <span className="muted text-sm">منتظر تصمیم مدیر بخش</span> : <>
                          <button className="badge badge-purple" disabled={bulkBusy} onClick={() => restore(row.id)}>بازگردانی</button>
                          <button className="badge badge-red" disabled={bulkBusy} onClick={() => remove(row.id)}>حذف نهایی</button>
                        </>}
                      </div> : <div className="flex gap-1">
                        <button className="badge badge-purple" disabled={uploading || bulkBusy} onClick={() => edit(row)}>{t.edit}</button>
                        {blockDriven && <Link className="badge badge-blue" href={`/admin/editor/${type}/${row.id}`}>{fa ? 'ویرایشگر بلوکی' : 'Block editor'}</Link>}
                        {type === 'pages' && <Link className="badge badge-purple" href={`/admin/builder/${row.id}`}>{fa ? 'صفحه‌ساز' : 'Visual builder'}</Link>}
                        {type === 'posts' && <Link className="badge badge-purple" href={`/admin/builder/post-${row.id}`}>{fa ? 'صفحه‌ساز' : 'Visual builder'}</Link>}
                        {type === 'products' && <Link className="badge badge-purple" href={`/admin/builder/product-${row.id}`}>{fa ? 'صفحه‌ساز' : 'Visual builder'}</Link>}
                        {publicPath && !scheduled && (row.status === 'PUBLISHED' || (row.active === true && (type !== 'products' || row.approval === 'APPROVED'))) && <Link className="badge badge-gray" href={`${publicPath}${row.slug}`} target="_blank" rel="noopener noreferrer">{fa ? 'مشاهده ↗' : 'View ↗'}</Link>}
                        <button className="badge badge-red" disabled={bulkBusy} onClick={() => remove(row.id)}>{mine ? 'درخواست حذف' : t.delete}</button>
                      </div>}
                    </td>
                  </tr>
                )
              })}
              {visibleRows.length === 0 && (
                <tr><td colSpan={tableFields.length + 2 + Number(bulkEnabled)} className="muted text-center py-8">{fa ? 'موردی پیدا نشد.' : 'No entries found.'}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <AdminPagination fa={fa} page={page} pages={pages} size={pageSize} total={total} shown={rows.length} busy={loading || bulkBusy} onPage={setPage} onSize={(size) => { setPage(1); setPageSize(size) }} />
    </div>
  )
}
