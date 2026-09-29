'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import CoverField from './CoverField'
import FileUpload, { CopyToServer } from '@/components/admin/FileUpload'
import AiAutofill from './AiAutofill'
import PublishReview, { previewValue, type ReviewRow } from './PublishReview'
import type { AutofillField } from '@/modules/ai/domain/autofill'
import { playbackKind } from '@/modules/media/domain/media'
import { toEmbedUrl } from '@/modules/site/domain/builder'

/**
 * Admin list + editor for the media library (/api/admin/media-library): music,
 * film & series, games and VIP plans. Nested editors cover download links,
 * seasons/episodes, cast, screenshots, system requirements and perks.
 */

type Opt = { value: string; label: string }
export type MediaField = {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'image' | 'date' | 'datetime' | 'links' | 'records' | 'seasons' | 'requirements' | 'picklist' | 'terms'
  /** For `terms`: the section taxonomy (software, games, music, cinema). */
  taxonomy?: string
  options?: Opt[]
  /** Options loaded from another media resource (e.g. artists for albums). */
  source?: { type: string; label: (row: any) => string; empty?: string }
  recordKeys?: { key: string; label: string; dir?: 'ltr' | 'rtl'; wide?: boolean }[]
  wide?: boolean
  dir?: 'ltr' | 'rtl'
  required?: boolean
  placeholder?: string
  table?: boolean | ((row: any) => ReactNode)
  hint?: string
  /** Adds "upload from computer" next to a URL field (the file is stored on this server); the value is the section folder. */
  upload?: string
  /** File types the upload button offers, e.g. "audio/*". */
  accept?: string
}

type Props = {
  type: string
  title: string
  subtitle?: string
  fields: MediaField[]
  publicPath?: (row: any) => string | null
  titleKey?: string
}

const API = '/api/admin/media-library'

function emptyValue(field: MediaField): unknown {
  switch (field.type) {
    case 'checkbox': return false
    case 'links': case 'records': case 'seasons': case 'picklist': return []
    case 'requirements': return { min: {}, rec: {} }
    case 'terms': return { ids: [], primary: null }
    case 'select': return field.options?.[0]?.value ?? ''
    default: return ''
  }
}

function toFormValue(field: MediaField, value: unknown): unknown {
  if (value === null || value === undefined) return emptyValue(field)
  if (field.type === 'datetime') { const d = new Date(String(value)); return Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' }
  if (field.type === 'date') return String(value).slice(0, 10)
  if (field.type === 'select' || field.type === 'number') return String(value)
  return value
}

export default function MediaCrud({ type, title, subtitle, fields, publicPath, titleKey = 'title' }: Props) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Record<string, any> | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<Record<string, Opt[]>>({})
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set())
  const [review, setReview] = useState(false)
  const [originalStatus, setOriginalStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`${API}?type=${type}`)
    const data = await res.json().catch(() => null)
    if (res.ok) setRows(Array.isArray(data) ? data : [])
    else setMsg({ tone: 'err', text: data?.error || (fa ? 'بارگذاری ناموفق بود' : 'Could not load') })
    setLoading(false)
  }, [type, fa])

  useEffect(() => { load() }, [load])

  const sourceTypes = useMemo(() => [...new Set(fields.flatMap((f) => (f.source ? [f.source.type] : [])))], [fields])
  useEffect(() => {
    if (!form) return
    sourceTypes.forEach(async (sourceType) => {
      const res = await fetch(`${API}?type=${sourceType}`)
      const data = res.ok ? await res.json().catch(() => []) : []
      const field = fields.find((f) => f.source?.type === sourceType)!
      setSources((current) => ({ ...current, [sourceType]: (Array.isArray(data) ? data : []).map((row: any) => ({ value: String(row.id), label: field.source!.label(row) })) }))
    })
  }, [form === null, sourceTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(row?: any) {
    const next: Record<string, any> = {}
    for (const field of fields) next[field.key] = row ? toFormValue(field, row[field.key]) : emptyValue(field)
    setForm(next)
    setEditId(row?.id ?? null)
    setOriginalStatus(row?.status || '')
    setAiKeys(new Set())
    setMsg(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Publishing (a new entry, a draft going live, or anything the assistant filled) goes through a final review.
  const hasStatus = fields.some((field) => field.key === 'status')
  const needsReview = () => !!form && (hasStatus ? form.status === 'PUBLISHED' && (!editId || originalStatus !== 'PUBLISHED' || aiKeys.size > 0) : !editId || aiKeys.size > 0)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form || busy) return
    if (needsReview()) { setReview(true); return }
    await persist()
  }

  async function persist() {
    if (!form || busy) return
    setReview(false)
    setBusy(true); setMsg(null)
    const body: Record<string, unknown> = { ...form }
    for (const field of fields) {
      if (field.type === 'datetime' && body[field.key]) body[field.key] = new Date(String(body[field.key])).toISOString()
      if (field.type === 'select' && field.source && body[field.key] === '') body[field.key] = null
    }
    const res = await fetch(`${API}?type=${type}`, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { ...body, id: editId } : body) })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setMsg({ tone: 'err', text: data?.error || (fa ? 'ذخیره ناموفق بود' : 'Save failed') }); return }
    setForm(null); setEditId(null)
    setMsg({ tone: 'ok', text: fa ? 'ذخیره شد' : 'Saved' })
    load()
  }

  async function remove(row: any) {
    if (!confirm(fa ? `«${row[titleKey] || row.name}» حذف شود؟` : `Delete “${row[titleKey] || row.name}”?`)) return
    const res = await fetch(`${API}?type=${type}&id=${row.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) setMsg({ tone: 'err', text: data?.error || (fa ? 'حذف ناموفق بود' : 'Delete failed') })
    load()
  }

  const set = (key: string, value: unknown) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
    setAiKeys((current) => { if (!current.has(key)) return current; const next = new Set(current); next.delete(key); return next })
  }
  const optionsOf = (field: MediaField) => (field.source ? sources[field.source.type] || [] : field.options)
  // What the assistant may fill: plain values of this section's own fields (never status, access or media).
  const aiFields = useMemo<AutofillField[]>(() => fields.flatMap((field): AutofillField[] => {
    if (['status', 'access', 'featured', 'publishedAt', 'sortOrder'].includes(field.key)) return []
    const base = { key: field.key, label: field.label, hint: field.hint, dir: field.dir }
    switch (field.type || 'text') {
      case 'text': return [{ ...base, type: field.key === 'slug' ? 'slug' : 'text' }]
      case 'textarea': return [{ ...base, type: /HTML/i.test(field.label) ? 'richtext' : 'textarea' }]
      case 'number': return [{ ...base, type: 'number' }]
      case 'checkbox': return [{ ...base, type: 'checkbox' }]
      case 'date': return [{ ...base, type: 'date' }]
      case 'select': { const options = (optionsOf(field) || []).filter((o) => o.value !== ''); return options.length ? [{ ...base, type: 'select', options }] : [] }
      case 'records': return field.recordKeys ? [{ ...base, type: 'records', recordKeys: field.recordKeys.filter((r) => !/image|src|url/i.test(r.key)).map((r) => ({ key: r.key, label: r.label })) }] : []
      default: return []
    }
  }).filter((field) => field.type !== 'records' || (field.recordKeys?.length ?? 0) > 0), [fields, sources]) // eslint-disable-line react-hooks/exhaustive-deps
  const applyAi = (values: Record<string, unknown>, filled: string[]) => {
    setForm((current) => {
      if (!current) return current
      const next = { ...current }
      for (const field of fields) {
        if (!(field.key in values)) continue
        const value = values[field.key]
        next[field.key] = field.type === 'number' || field.type === 'select' ? (value === undefined || value === null ? '' : String(value)) : value
      }
      return next
    })
    setAiKeys((current) => { const next = new Set(current); for (const key of Object.keys(values)) if (!filled.includes(key)) next.delete(key); for (const key of filled) next.add(key); return next })
  }
  const reviewRows: ReviewRow[] = form ? fields.map((field) => {
    const value = previewValue(form[field.key], optionsOf(field))
    return { key: field.key, label: field.label, value, state: !value && field.required ? 'missing' : aiKeys.has(field.key) ? 'ai' : value ? 'ok' : 'empty' }
  }) : []
  const tableFields = fields.filter((f) => f.table)
  const needle = query.trim().toLocaleLowerCase()
  const visible = needle ? rows.filter((row) => [row.title, row.titleEn, row.name, row.nameEn, row.slug, row.originalTitle].join(' ').toLocaleLowerCase().includes(needle)) : rows

  return (
    <div className="cms-workspace mx-workspace">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <span className="content-eyebrow">{fa ? 'کتابخانه رسانه' : 'Media library'}</span>
          <h1 className="h2 mt-3">{title}</h1>
          {subtitle && <p className="muted text-sm mt-3">{subtitle}</p>}
        </div>
        <div className="flex gap-2 items-center">
          {msg && <span className={msg.tone === 'err' ? 'error-text' : 'badge badge-green'}>{msg.text}</span>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => (form ? setForm(null) : open())}>{form ? (fa ? 'انصراف' : 'Cancel') : `+ ${fa ? 'افزودن' : 'Add'}`}</button>
        </div>
      </div>

      {form && (
        <form onSubmit={save} className="card mb-6 mx-form">
          <div className="mx-form-head"><strong>{editId ? (fa ? `ویرایش #${editId}` : `Edit #${editId}`) : (fa ? 'مورد جدید' : 'New entry')}</strong></div>
          <AiAutofill section={type} fields={aiFields} form={form} onApply={applyAi} />
          <div className="mx-grid">
            {fields.map((field) => (
              <div key={field.key} className={`mx-field${field.wide || ['textarea', 'image', 'links', 'records', 'seasons', 'requirements', 'picklist', 'terms'].includes(field.type || '') ? ' is-wide' : ''}${aiKeys.has(field.key) ? ' is-ai' : ''}`}>
                {field.type !== 'checkbox' && <label className="label">{field.label}{field.required ? ' *' : ''}{aiKeys.has(field.key) && <span className="ai-badge">پیشنهاد AI</span>}</label>}
                <FieldInput field={field} value={form[field.key]} onChange={(value) => set(field.key, value)} options={field.source ? [{ value: '', label: field.source.empty || '—' }, ...(sources[field.source.type] || [])] : field.options} fa={fa} onBusy={setBusy} titleHint={form.title || form.name || ''} />
                {field.hint && <small className="muted mx-hint">{field.hint}</small>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary" disabled={busy}>{busy ? '…' : needsReview() ? (fa ? 'بازبینی و انتشار' : 'Review & publish') : editId ? (fa ? 'ذخیره تغییرات' : 'Save changes') : (fa ? 'ایجاد' : 'Create')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setForm(null); setEditId(null) }}>{fa ? 'انصراف' : 'Cancel'}</button>
          </div>
          <PublishReview open={review} title={String(form[titleKey] || form.title || form.name || '')} rows={reviewRows} busy={busy} onCancel={() => setReview(false)} onConfirm={() => void persist()} />
        </form>
      )}

      <div className="cms-summary">
        <div><span>{fa ? 'همه موارد' : 'Total'}</span><b>{rows.length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>
        <div><span>{fa ? 'ویژه اعضای VIP' : 'VIP only'}</span><b>{rows.filter((row) => row.access === 'MEMBERS').length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>
        <label className="cms-search"><span>{fa ? 'جست‌وجو' : 'Search'}</span><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={fa ? 'عنوان یا نشانی…' : 'Title or slug…'} /></label>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="muted text-center py-6">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : (
          <table className="data">
            <thead><tr><th>#</th>{tableFields.map((f) => <th key={f.key}>{f.label}</th>)}<th>{fa ? 'عملیات' : 'Actions'}</th></tr></thead>
            <tbody>
              {visible.map((row) => {
                const href = publicPath?.(row)
                return (
                  <tr key={row.id}>
                    <td className="num">{row.id}</td>
                    {tableFields.map((f) => <td key={f.key}>{typeof f.table === 'function' ? f.table(row) : cell(f, row[f.key], fa)}</td>)}
                    <td><div className="flex gap-1">
                      <button type="button" className="badge badge-purple" onClick={() => open(row)}>{fa ? 'ویرایش' : 'Edit'}</button>
                      {href && <Link className="badge badge-gray" href={href} target="_blank" rel="noopener noreferrer">{fa ? 'مشاهده ↗' : 'View ↗'}</Link>}
                      <button type="button" className="badge badge-red" onClick={() => remove(row)}>{fa ? 'حذف' : 'Delete'}</button>
                    </div></td>
                  </tr>
                )
              })}
              {!visible.length && <tr><td colSpan={tableFields.length + 2} className="muted text-center py-8">{fa ? 'هنوز موردی ثبت نشده.' : 'Nothing here yet.'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function cell(field: MediaField, value: unknown, fa: boolean): ReactNode {
  if (typeof value === 'boolean') return value ? '✅' : '—'
  if (field.key === 'access') return value === 'MEMBERS' ? <span className="badge vip-badge-sm">VIP</span> : <span className="muted">{fa ? 'عمومی' : 'Public'}</span>
  if (field.key === 'status') return value === 'DRAFT' ? <span className="badge badge-gray">{fa ? 'پیش‌نویس' : 'Draft'}</span> : <span className="badge badge-green">{fa ? 'منتشر' : 'Live'}</span>
  if (field.type === 'select') return field.options?.find((o) => o.value === String(value))?.label || String(value ?? '—')
  if (field.type === 'image') return value ? <img src={String(value)} alt="" className="mx-thumb" /> : '—'
  const str = String(value ?? '')
  return str.length > 50 ? `${str.slice(0, 50)}…` : str || '—'
}

function FieldInput({ field, value, onChange, options, fa, onBusy, titleHint }: { field: MediaField; value: any; onChange: (value: unknown) => void; options?: Opt[]; fa: boolean; onBusy: (busy: boolean) => void; titleHint: string }) {
  switch (field.type) {
    case 'checkbox':
      return <label className="flex items-center gap-2 text-sm mx-check"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>
    case 'textarea':
      return <textarea className="textarea" rows={5} dir={field.dir} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} required={field.required} />
    case 'select':
      return <select className="select" aria-label={field.label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>{(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    case 'image':
      return <div className="mx-image"><CoverField value={value || ''} title={titleHint} onChange={onChange} onBusy={onBusy} /><div className="mx-upload-field mt-2"><input className="input" dir="ltr" value={value || ''} placeholder="https://… / /uploads/…" onChange={(e) => onChange(e.target.value)} /><CopyToServer url={value || ''} onCopied={onChange} /></div></div>
    case 'date': case 'datetime':
      return <input className="input" dir="ltr" type={field.type === 'date' ? 'date' : 'datetime-local'} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    case 'links':
      return <LinksEditor value={Array.isArray(value) ? value : []} onChange={onChange} fa={fa} section={field.upload || 'general'} />
    case 'records':
      return <RecordsEditor value={Array.isArray(value) ? value : []} keys={field.recordKeys || [{ key: 'text', label: field.label }]} onChange={onChange} fa={fa} />
    case 'seasons':
      return <SeasonsEditor value={Array.isArray(value) ? value : []} onChange={onChange} fa={fa} />
    case 'requirements':
      return <RequirementsEditor value={value && typeof value === 'object' ? value : { min: {}, rec: {} }} onChange={onChange} fa={fa} />
    case 'terms':
      return <TermPicker taxonomy={field.taxonomy || ''} value={value && typeof value === 'object' && Array.isArray(value.ids) ? value : { ids: [], primary: null }} onChange={onChange} />
    case 'picklist':
      return <PickList value={Array.isArray(value) ? value.map(String) : []} options={options || []} onChange={onChange} fa={fa} />
    default:
      if (field.upload) return <div className="mx-upload-field"><input className="input" dir={field.dir || 'ltr'} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} required={field.required} /><FileUpload section={field.upload} accept={field.accept} onUploaded={(file) => onChange(file.url)} label={fa ? 'بارگذاری از رایانه' : 'Upload'} /></div>
      return <input className="input" dir={field.dir} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} required={field.required} />
  }
}

// ------------------------------------------------------------------ nested editors

type TermOption = { id: number; name: string; depth: number; parentId: number | null; count: number }
type TermValue = { ids: number[]; primary: number | null }

/** Category tree checkboxes with a “main category” choice (used for URLs and breadcrumbs). */
export function TermPicker({ taxonomy, value, onChange }: { taxonomy: string; value: TermValue; onChange: (value: TermValue) => void }) {
  const [options, setOptions] = useState<TermOption[] | null>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/taxonomy?tax=${encodeURIComponent(taxonomy)}&options=1`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { options: [] })).then((d) => alive && setOptions(d.options || [])).catch(() => alive && setOptions([]))
    return () => { alive = false }
  }, [taxonomy])
  const toggle = (id: number) => {
    const ids = value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id]
    onChange({ ids, primary: ids.includes(value.primary ?? -1) ? value.primary : ids[0] ?? null })
  }
  const manage = <Link href={`/admin/taxonomy?tax=${taxonomy}`} target="_blank" className="text-sm">مدیریت دسته‌ها ↗</Link>
  if (!options) return <p className="muted text-sm">در حال بارگذاری دسته‌ها…</p>
  if (!options.length) return <p className="muted text-sm">هنوز دسته‌ای ساخته نشده. {manage}</p>
  const shown = filter.trim() ? options.filter((o) => o.name.includes(filter.trim())) : options
  return <div className="tx-picker">
    <div className="tx-picker-head"><input className="input" type="search" placeholder="جست‌وجوی دسته…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="جست‌وجوی دسته" />{manage}</div>
    <ul role="group" aria-label="دسته‌ها">
      {shown.map((o) => <li key={o.id} style={{ paddingInlineStart: `${(filter ? 0 : o.depth - 1) * 18}px` }}>
        <label><input type="checkbox" checked={value.ids.includes(o.id)} onChange={() => toggle(o.id)} />{o.name}</label>
        {value.ids.includes(o.id) && <button type="button" className={`tx-primary${value.primary === o.id ? ' is-on' : ''}`} aria-pressed={value.primary === o.id} onClick={() => onChange({ ...value, primary: o.id })}>{value.primary === o.id ? '★ دستهٔ اصلی' : '☆ اصلی شود'}</button>}
      </li>)}
    </ul>
    <small className="muted">{value.ids.length ? `${value.ids.length.toLocaleString('fa-IR')} دسته انتخاب شده؛ دستهٔ اصلی در نشانی و مسیر صفحه نمایش داده می‌شود.` : 'حداقل یک دسته انتخاب کنید.'}</small>
  </div>
}

export type LinkRow = { label: string; kind: string; quality: string; size: string; audio: string; subtitle: boolean; url: string; access: string; disabled?: boolean; clicks?: number }
const blankLink = (): LinkRow => ({ label: '', kind: 'DOWNLOAD', quality: '1080p', size: '', audio: '', subtitle: false, url: '', access: 'PUBLIC' })

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

const PLAYBACK_LABEL: Record<string, [string, string, string]> = {
  hls: ['▶ پخش آنلاین (HLS)', '▶ Streams (HLS)', 'is-ok'],
  video: ['▶ قابل پخش آنلاین', '▶ Plays online', 'is-ok'],
  embed: ['▶ پخش با پلیر سایت مبدأ', '▶ Embedded player', 'is-ok'],
  maybe: ['▶ پخش آنلاین اگر کدک H.264/AAC باشد', '▶ Plays if H.264/AAC', 'is-warn'],
  none: ['فقط دانلود', 'Download only', ''],
}

function PlaybackBadge({ url, kind, fa }: { url: string; kind: string; fa: boolean }) {
  const [label, labelEn, tone] = PLAYBACK_LABEL[playbackKind(url, kind, toEmbedUrl)]
  return <span className={`mx-play-badge ${tone}`}>{fa ? label : labelEn}</span>
}

const humanSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`)

export function LinksEditor({ value, onChange, fa, compact, section = 'general' }: { value: LinkRow[]; onChange: (value: LinkRow[]) => void; fa: boolean; compact?: boolean; section?: string }) {
  const update = (index: number, patch: Partial<LinkRow>) => onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <div className={`mx-links${compact ? ' is-compact' : ''}`}>
      {value.map((row, index) => (
        <div key={index} className="mx-link-row">
          <input className="input" placeholder={fa ? 'برچسب (مثلاً نسخه بلوری)' : 'Label (e.g. BluRay)'} value={row.label} onChange={(e) => update(index, { label: e.target.value })} />
          <select className="select" value={row.kind} onChange={(e) => update(index, { kind: e.target.value })} aria-label="kind"><option value="DOWNLOAD">{fa ? 'دانلود' : 'Download'}</option><option value="STREAM">{fa ? 'پخش آنلاین' : 'Stream'}</option></select>
          <input className="input" dir="ltr" placeholder="1080p" value={row.quality} onChange={(e) => update(index, { quality: e.target.value })} />
          <input className="input" dir="ltr" placeholder="2.1 GB" value={row.size} onChange={(e) => update(index, { size: e.target.value })} />
          <select className="select" value={row.audio} onChange={(e) => update(index, { audio: e.target.value })} aria-label="audio"><option value="">{fa ? 'صدا: —' : 'Audio: —'}</option><option value="DUBBED">{fa ? 'دوبله فارسی' : 'Dubbed'}</option><option value="ORIGINAL">{fa ? 'زبان اصلی' : 'Original'}</option></select>
          <label className="mx-mini-check"><input type="checkbox" checked={row.subtitle} onChange={(e) => update(index, { subtitle: e.target.checked })} />{fa ? 'زیرنویس' : 'Subs'}</label>
          <select className="select" value={row.access} onChange={(e) => update(index, { access: e.target.value })} aria-label="access"><option value="PUBLIC">{fa ? 'عمومی' : 'Public'}</option><option value="MEMBERS">VIP</option></select>
          <input className="input mx-link-url" dir="ltr" placeholder="https://dl.example.com/file.mkv" value={row.url} onChange={(e) => update(index, { url: e.target.value })} />
          <FileUpload compact section={section} onUploaded={(file) => update(index, { url: file.url, size: row.size || humanSize(file.size), label: row.label || file.name.replace(/\.[^.]+$/, '') })} label={fa ? 'بارگذاری' : 'Upload'} />
          {row.url && <PlaybackBadge url={row.url} kind={row.kind} fa={fa} />}
          <label className={`mx-mini-check${row.disabled ? ' is-danger' : ''}`} title={fa ? 'لینک غیرفعال در سایت نمایش داده نمی‌شود (لینک خراب یا حذف به‌خاطر حق نشر)' : 'Disabled links are hidden on the site'}><input type="checkbox" checked={!!row.disabled} onChange={(e) => update(index, { disabled: e.target.checked })} />{fa ? 'غیرفعال' : 'Disabled'}</label>
          {!!row.clicks && <span className="muted text-sm" title={fa ? 'تعداد کلیک' : 'Clicks'}>⤓ {row.clicks.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}
          <div className="mx-row-tools">
            <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, -1))} aria-label="up">↑</button>
            <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, 1))} aria-label="down">↓</button>
            <button type="button" className="badge badge-red" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label="remove">✕</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, blankLink()])}>+ {fa ? 'لینک' : 'Link'}</button>
      {!compact && <p className="muted text-sm mx-links-hint">{fa ? 'پخش آنلاین در سایت برای MP4 (H.264/AAC)، WebM و HLS (.m3u8) و لینک‌های یوتیوب/آپارات کار می‌کند. MKV فقط وقتی پخش می‌شود که کدک ویدیو H.264 و صدا AAC باشد (نه x265/HEVC یا AC3/DTS). لینک باید https باشد.' : 'Online playback works for MP4 (H.264/AAC), WebM, HLS (.m3u8) and YouTube/Aparat links. MKV plays only with H.264 + AAC. Links must be https.'}</p>}
    </div>
  )
}

function RecordsEditor({ value, keys, onChange, fa }: { value: Record<string, string>[]; keys: NonNullable<MediaField['recordKeys']>; onChange: (value: Record<string, string>[]) => void; fa: boolean }) {
  return (
    <div className="mx-records">
      {value.map((row, index) => (
        <div key={index} className="mx-record-row">
          {keys.map((k) => <input key={k.key} className={`input${k.wide ? ' is-wide' : ''}`} dir={k.dir} placeholder={k.label} value={row[k.key] || ''} onChange={(e) => onChange(value.map((r, i) => (i === index ? { ...r, [k.key]: e.target.value } : r)))} />)}
          <div className="mx-row-tools">
            <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, -1))}>↑</button>
            <button type="button" className="badge badge-red" onClick={() => onChange(value.filter((_, i) => i !== index))}>✕</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, {}])}>+ {fa ? 'افزودن' : 'Add'}</button>
    </div>
  )
}

type Episode = { number: number | string; title: string; titleEn: string; summary: string; still: string; runtime: number | string; airDate: string; access: string; links: LinkRow[] }
type Season = { number: number | string; name: string; poster: string; episodes: Episode[] }

function SeasonsEditor({ value, onChange, fa }: { value: Season[]; onChange: (value: Season[]) => void; fa: boolean }) {
  const [open, setOpen] = useState<string>('')
  const setSeason = (index: number, patch: Partial<Season>) => onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const setEpisode = (si: number, ei: number, patch: Partial<Episode>) => setSeason(si, { episodes: value[si].episodes.map((e, i) => (i === ei ? { ...e, ...patch } : e)) })
  return (
    <div className="mx-seasons">
      {value.map((season, si) => (
        <section key={si} className="mx-season">
          <header>
            <strong>{fa ? `فصل ${season.number}` : `Season ${season.number}`}</strong>
            <input className="input" type="number" value={season.number} onChange={(e) => setSeason(si, { number: e.target.value })} aria-label="season number" />
            <input className="input" placeholder={fa ? 'نام فصل (اختیاری)' : 'Season name (optional)'} value={season.name || ''} onChange={(e) => setSeason(si, { name: e.target.value })} />
            <input className="input" dir="ltr" placeholder={fa ? 'پوستر فصل (URL)' : 'Season poster URL'} value={season.poster || ''} onChange={(e) => setSeason(si, { poster: e.target.value })} />
            <button type="button" className="badge badge-red" onClick={() => confirm(fa ? 'این فصل و قسمت‌هایش حذف شود؟' : 'Remove this season and its episodes?') && onChange(value.filter((_, i) => i !== si))}>✕</button>
          </header>
          <div className="mx-episodes">
            {season.episodes.map((episode, ei) => {
              const key = `${si}-${ei}`
              return (
                <div key={ei} className={`mx-episode${open === key ? ' is-open' : ''}`}>
                  <div className="mx-episode-head">
                    <input className="input mx-ep-no" type="number" value={episode.number} onChange={(e) => setEpisode(si, ei, { number: e.target.value })} aria-label="episode number" />
                    <input className="input" placeholder={fa ? 'عنوان قسمت' : 'Episode title'} value={episode.title || ''} onChange={(e) => setEpisode(si, ei, { title: e.target.value })} />
                    <select className="select" value={episode.access || 'PUBLIC'} onChange={(e) => setEpisode(si, ei, { access: e.target.value })} aria-label="access"><option value="PUBLIC">{fa ? 'عمومی' : 'Public'}</option><option value="MEMBERS">VIP</option></select>
                    <span className="muted text-sm">{(episode.links || []).length} {fa ? 'لینک' : 'links'}</span>
                    <button type="button" className="badge badge-purple" onClick={() => setOpen(open === key ? '' : key)}>{open === key ? '▲' : '▼'}</button>
                    <button type="button" className="badge badge-red" onClick={() => setSeason(si, { episodes: season.episodes.filter((_, i) => i !== ei) })}>✕</button>
                  </div>
                  {open === key && (
                    <div className="mx-episode-body">
                      <div className="mx-grid">
                        <input className="input" dir="ltr" placeholder="English title" value={episode.titleEn || ''} onChange={(e) => setEpisode(si, ei, { titleEn: e.target.value })} />
                        <input className="input" type="number" placeholder={fa ? 'مدت (دقیقه)' : 'Runtime (min)'} value={episode.runtime ?? ''} onChange={(e) => setEpisode(si, ei, { runtime: e.target.value })} />
                        <input className="input" type="date" dir="ltr" value={episode.airDate || ''} onChange={(e) => setEpisode(si, ei, { airDate: e.target.value })} />
                        <input className="input" dir="ltr" placeholder={fa ? 'تصویر قسمت (URL)' : 'Still image URL'} value={episode.still || ''} onChange={(e) => setEpisode(si, ei, { still: e.target.value })} />
                      </div>
                      <textarea className="textarea mt-2" rows={2} placeholder={fa ? 'خلاصه قسمت' : 'Episode summary'} value={episode.summary || ''} onChange={(e) => setEpisode(si, ei, { summary: e.target.value })} />
                      <LinksEditor compact value={episode.links || []} onChange={(links) => setEpisode(si, ei, { links })} fa={fa} section="cinema" />
                    </div>
                  )}
                </div>
              )
            })}
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeason(si, { episodes: [...season.episodes, { number: season.episodes.length + 1, title: '', titleEn: '', summary: '', still: '', runtime: '', airDate: '', access: 'PUBLIC', links: [] }] })}>+ {fa ? 'قسمت' : 'Episode'}</button>
              <BulkEpisodes fa={fa} onAdd={(count) => setSeason(si, { episodes: [...season.episodes, ...Array.from({ length: count }, (_, i) => ({ number: season.episodes.length + i + 1, title: '', titleEn: '', summary: '', still: '', runtime: '', airDate: '', access: 'PUBLIC', links: [] }))] })} />
            </div>
          </div>
        </section>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, { number: value.length + 1, name: '', poster: '', episodes: [] }])}>+ {fa ? 'فصل جدید' : 'New season'}</button>
    </div>
  )
}

function BulkEpisodes({ fa, onAdd }: { fa: boolean; onAdd: (count: number) => void }) {
  const [count, setCount] = useState('10')
  return <span className="mx-bulk"><input className="input" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} aria-label="count" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => { const n = Math.max(1, Math.min(100, Number(count) || 0)); onAdd(n) }}>{fa ? 'افزودن گروهی قسمت‌ها' : 'Add episodes in bulk'}</button></span>
}

const REQ_KEYS: { key: string; fa: string; en: string }[] = [
  { key: 'os', fa: 'سیستم‌عامل', en: 'OS' }, { key: 'cpu', fa: 'پردازنده', en: 'CPU' }, { key: 'gpu', fa: 'کارت گرافیک', en: 'GPU' },
  { key: 'ram', fa: 'حافظه رم', en: 'RAM' }, { key: 'storage', fa: 'فضای ذخیره‌سازی', en: 'Storage' }, { key: 'directx', fa: 'دایرکت‌ایکس', en: 'DirectX' },
]

export function RequirementsEditor({ value, onChange, fa }: { value: { min: Record<string, string>; rec: Record<string, string> }; onChange: (value: unknown) => void; fa: boolean }) {
  const set = (side: 'min' | 'rec', key: string, v: string) => onChange({ ...value, [side]: { ...(value[side] || {}), [key]: v } })
  return (
    <div className="mx-req">
      <div className="mx-req-head"><span /><b>{fa ? 'حداقل' : 'Minimum'}</b><b>{fa ? 'پیشنهادی' : 'Recommended'}</b></div>
      {REQ_KEYS.map((k) => (
        <div key={k.key} className="mx-req-row">
          <span>{fa ? k.fa : k.en}</span>
          <input className="input" dir="ltr" value={value.min?.[k.key] || ''} onChange={(e) => set('min', k.key, e.target.value)} />
          <input className="input" dir="ltr" value={value.rec?.[k.key] || ''} onChange={(e) => set('rec', k.key, e.target.value)} />
        </div>
      ))}
    </div>
  )
}

function PickList({ value, options, onChange, fa }: { value: string[]; options: Opt[]; onChange: (value: string[]) => void; fa: boolean }) {
  const [q, setQ] = useState('')
  const chosen = value.map((id) => options.find((o) => o.value === id) || { value: id, label: `#${id}` })
  const pool = options.filter((o) => o.value && !value.includes(o.value) && o.label.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())).slice(0, 40)
  return (
    <div className="mx-pick">
      <ol className="mx-pick-list">
        {chosen.map((o, index) => (
          <li key={o.value}><span>{index + 1}. {o.label}</span><span className="mx-row-tools">
            <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, -1))}>↑</button>
            <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, 1))}>↓</button>
            <button type="button" className="badge badge-red" onClick={() => onChange(value.filter((v) => v !== o.value))}>✕</button>
          </span></li>
        ))}
        {!chosen.length && <li className="muted">{fa ? 'هنوز آهنگی انتخاب نشده' : 'No tracks yet'}</li>}
      </ol>
      <input className="input" type="search" placeholder={fa ? 'جست‌وجوی آهنگ برای افزودن…' : 'Search tracks to add…'} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mx-pick-pool">{pool.map((o) => <button key={o.value} type="button" className="badge badge-purple" onClick={() => onChange([...value, o.value])}>+ {o.label}</button>)}</div>
    </div>
  )
}
