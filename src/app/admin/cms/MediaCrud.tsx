'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import CoverField from './CoverField'
import FileUpload, { CopyToServer } from '@/components/admin/FileUpload'
import AiAutofill from './AiAutofill'
import { useAiPageRecord } from '@/components/admin/ai/PageContext'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'
import PublishReview, { previewValue, type ReviewRow } from './PublishReview'
import BulkActions, { runBulkAction, type BulkAction } from './BulkActions'
import AdminPagination from './AdminPagination'
import type { AdminPageSize } from '@/modules/content/domain/admin-pagination'
import type { AutofillField } from '@/modules/ai/domain/autofill'
import { TRACK_LANGUAGES, playbackKind } from '@/modules/media/domain/media'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import dynamic from 'next/dynamic'
import { isTaxonomy } from '@/modules/taxonomy/domain/taxonomy'
import { termProjectionChange } from '@/modules/taxonomy/domain/projection'
import { CinemaMetadataLookup } from '@/components/admin/CinemaMetadata'
import { applyCinemaMetadata } from '@/modules/cinema/domain/metadata'
import { OrganizationScope, useAssetOrganization } from '@/components/media/OrganizationScope'
import { imageRole, type AssetOrganization } from '@/modules/downloads/domain/organization'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import PeoplePicker from './PeoplePicker'
import StudioPicker from './StudioPicker'
import { optionsOf, useSectionLists } from './useSectionLists'
import ItemAudiencePanel from '@/components/admin/ItemAudiencePanel'

// Loaded only when a form with a formatted field is opened.
const RichEditor = dynamic(() => import('@/components/editor/ContentEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

// Left out of the form while the VIP module is off; the stored value is not touched by a save without them.
const VIP_FIELD_KEYS = ['access', 'memberPrice', 'vipGiftDays']

/**
 * Admin list + editor for the media library (/api/admin/media-library): music,
 * film & series, games and VIP plans. Nested editors cover download links,
 * seasons/episodes, cast, screenshots, system requirements and perks.
 */

/** A choice; `alias` is another name the same entry arrives by (the English name an import brings). */
type Opt = { value: string; label: string; alias?: string; foreignName?: string }
export type MediaField = {
  key: string
  label: string
  /** `richtext`: formatted text written in the site's editor and stored as sanitised HTML (the server cleans it on save). */
  type?: 'text' | 'textarea' | 'richtext' | 'number' | 'checkbox' | 'select' | 'image' | 'date' | 'datetime' | 'links' | 'records' | 'seasons' | 'requirements' | 'picklist' | 'terms' | 'people' | 'studio' | 'chips'
  /** For `people`: a director/producer line (`line`) or the cast list with characters and order (`cast`). */
  people?: 'line' | 'cast'
  /** For `image`: the frame the picture is shown in — a portrait poster, a square icon or cover; landscape otherwise. */
  frame?: 'poster' | 'square'
  /** Fields with the same section are shown together under that heading, in the order the section first appears. */
  section?: string
  /** Shown only when this says so for the form being edited (e.g. series-only fields); a hidden field keeps its value. */
  when?: (form: Record<string, any>) => boolean
  /** For `terms`: the section taxonomy (software, games, music, cinema). */
  taxonomy?: string
  options?: Opt[]
  /** Options loaded from another media resource (e.g. artists for albums). */
  source?: { type: string; label: (row: any) => string; empty?: string }
  /** A record's own fields; one with `options` is chosen from them (an app store from the owner's list), or from the
   * field's `source` with `'source'` (a song credit's artist). */
  recordKeys?: { key: string; label: string; dir?: 'ltr' | 'rtl'; wide?: boolean; options?: Opt[] | 'source' }[]
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
  /** Paid content: the item type priced from this editor (software, title, album, track). */
  paywall?: { ownerType: string; noun: string }
}

const API = '/api/admin/media-library'

function emptyValue(field: MediaField): unknown {
  switch (field.type) {
    case 'checkbox': return false
    case 'links': case 'records': case 'seasons': case 'picklist': return []
    case 'people': return field.people === 'cast' ? [] : ''
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

/**
 * What the form shows now and how: a field that does not apply to this item (e.g. a series field on a film) stays
 * out; fields with a section are grouped under it, in the order each section first appears.
 */
function formLayout(fields: MediaField[], form: Record<string, any> | null) {
  const shownFields = form ? fields.filter((field) => !field.when || field.when(form)) : fields
  if (!shownFields.some((field) => field.section)) return { shownFields, sections: [{ title: '', fields: shownFields }] }
  const groups = new Map<string, MediaField[]>()
  for (const field of shownFields) groups.set(field.section || '', [...(groups.get(field.section || '') || []), field])
  return { shownFields, sections: [...groups].map(([title, grouped]) => ({ title, fields: grouped })) }
}

export default function MediaCrud({ type, title, subtitle, fields: allFields, publicPath, titleKey = 'title', paywall }: Props) {
  const vipOn = useModuleEnabled('membership')
  const fields = useMemo(() => (vipOn ? allFields : allFields.filter((field) => !VIP_FIELD_KEYS.includes(field.key))), [allFields, vipOn])
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Record<string, any> | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  useAiPageRecord(type, editId, form !== null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<AdminPageSize>(20)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [overall, setOverall] = useState(0)
  const [vip, setVip] = useState<number | null>(null)
  // A section author sees only their own items and asks for a delete; a manager decides what waits in the trash.
  const [mine, setMine] = useState(false)
  const [trashed, setTrashed] = useState(0)
  const loadId = useRef(0)
  const [sources, setSources] = useState<Record<string, Opt[]>>({})
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set())
  const [review, setReview] = useState(false)
  const [originalStatus, setOriginalStatus] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkProgress, setBulkProgress] = useState(0)
  const sourceChoice=(resource:string,id:unknown)=>(sources[resource]||[]).find(o=>o.value===String(id))
  const sourceLabel=(resource:string,id:unknown)=>sourceChoice(resource,id)?.label||''
  const assetOrganization:AssetOrganization|undefined=form?{artistId:Number(form.artistId)||undefined,artistEn:sourceChoice('music-artists',form.artistId)?.foreignName,titleEn:form.titleEn,section:type==='cinema-titles'?form.kind==='SERIES'?'series':'film':type.startsWith('music-')?'music':type,title:form.originalTitle||form.titleEn||form.title||form.name,category:String(form.category||form.genres||'').split(/[,،]/)[0],artist:type==='music-artists'?form.nameEn||form.name:sourceLabel('music-artists',form.artistId),album:type==='music-albums'?form.titleEn||form.title:sourceLabel('music-albums',form.albumId),artistImage:type==='music-artists'}:undefined

  const load = useCallback(async () => {
    const requestId = ++loadId.current
    setLoading(true)
    const params = new URLSearchParams({ type, paged: '1', page: String(page), limit: String(pageSize), q: search })
    const res = await fetch(`${API}?${params}`).catch(() => null)
    const data = await res?.json().catch(() => null)
    if (requestId !== loadId.current) return
    if (res?.ok && Array.isArray(data?.rows)) {
      setRows(data.rows)
      setTotal(data.total)
      setOverall(data.overall)
      setVip(data.vip)
      setMine(data.mine === true)
      setTrashed(Number(data.trashed) || 0)
      setPages(data.pages)
      if (data.page !== page) setPage(data.page)
    } else setMsg({ tone: 'err', text: data?.error || (fa ? 'بارگذاری ناموفق بود' : 'Could not load') })
    setLoading(false)
  }, [type, fa, page, pageSize, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setSearch(query.trim()) }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const sourceTypes = useMemo(() => [...new Set(fields.flatMap((f) => (f.source ? [f.source.type] : [])))], [fields])
  useEffect(() => {
    if (!form) return
    sourceTypes.forEach(async (sourceType) => {
      const res = await fetch(`${API}?type=${sourceType}&paged=1&limit=all`)
      const data = res.ok ? await res.json().catch(() => []) : []
      const field = fields.find((f) => f.source?.type === sourceType)!
      setSources((current) => ({ ...current, [sourceType]: (Array.isArray(data?.rows) ? data.rows : []).map((row: any) => ({ value: String(row.id), label: field.source!.label(row), foreignName: row.nameEn || row.titleEn || '' })) }))
    })
  }, [form === null, sourceTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a public page ("edit this film"): ?edit=<id> loads that one row and opens its form.
  const linked = useRef(false)
  useEffect(() => {
    if (linked.current) return
    linked.current = true
    const id = Number(new URLSearchParams(window.location.search).get('edit'))
    if (!Number.isSafeInteger(id) || id <= 0) return
    fetch(`${API}?type=${type}&id=${id}`).then((res) => res.ok ? res.json() : null).then((data) => {
      const row = (Array.isArray(data) ? data : data?.rows || []).find((item: any) => item.id === id)
      if (row) open(row); else setMsg({ tone: 'err', text: fa ? 'این مورد پیدا نشد' : 'Item not found' })
    }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    const res = await fetch(`${API}?type=${type}`, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { ...body, id: editId } : body) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy(false)
    if (!res?.ok) { setMsg({ tone: 'err', text: data?.error || (fa ? 'ذخیره ناموفق بود' : 'Save failed') }); return }
    setForm(null); setEditId(null)
    setMsg({ tone: 'ok', text: fa ? 'ذخیره شد' : 'Saved' })
    load()
  }

  async function remove(row: any) {
    if (busy) return
    if (!confirm(mine ? `«${row[titleKey] || row.name}» به سطل زباله می‌رود و از سایت برداشته می‌شود؛ حذف نهایی یا بازگردانی آن با مدیر بخش است. ادامه می‌دهید؟` : fa ? `«${row[titleKey] || row.name}» حذف شود؟` : `Delete “${row[titleKey] || row.name}”?`)) return
    const res = await fetch(`${API}?type=${type}&id=${row.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) setMsg({ tone: 'err', text: data?.error || (fa ? 'حذف ناموفق بود' : 'Delete failed') })
    else if (data?.trashed) setMsg({ tone: 'ok', text: 'به سطل زباله رفت و منتظر تصمیم مدیر بخش است.' })
    else setSelected((current) => { const next = new Set(current); next.delete(row.id); return next })
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
      case 'richtext': return [{ ...base, type: 'richtext' }]
      case 'textarea': return [{ ...base, type: 'textarea' }]
      case 'number': return [{ ...base, type: 'number' }]
      case 'checkbox': return [{ ...base, type: 'checkbox' }]
      case 'date': case 'datetime': return [{ ...base, type: 'date' }]
      // Lists chosen from known values; the system requirements as two rows (minimum, then recommended).
      case 'picklist': case 'chips': { const options = (optionsOf(field) || []).filter((o) => o.value !== '').map((o) => ({ value: o.value, label: o.label })); return options.length ? [{ ...base, type: 'multiselect', options }] : [] }
      case 'requirements': return [{ ...base, type: 'records', hint: 'دقیقاً دو ردیف: اول حداقل، دوم پیشنهادی؛ فقط از منبع', recordKeys: REQ_KEYS.map((k) => ({ key: k.key, label: k.fa })) }]
      case 'select': { const options = (optionsOf(field) || []).filter((o) => o.value !== ''); return options.length ? [{ ...base, type: 'select', options }] : [] }
      case 'records': return field.recordKeys ? [{ ...base, type: 'records', recordKeys: field.recordKeys.filter((r) => !r.options && !/image|src|url/i.test(r.key)).map((r) => ({ key: r.key, label: r.label })) }] : []
      case 'studio': return [{ ...base, type: 'text' }]
      // People are suggested as names (a line) or as name + character rows (the cast), as before the picker.
      case 'people': return field.people === 'cast' ? [{ ...base, type: 'records', recordKeys: [{ key: 'name', label: fa ? 'نام' : 'Name' }, { key: 'role', label: fa ? 'نقش' : 'Character' }] }] : [{ ...base, type: 'text' }]
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
        if (field.type === 'requirements' && Array.isArray(value)) { const [min = {}, rec = {}] = value as Record<string, string>[]; next[field.key] = { min: { ...(current[field.key]?.min || {}), ...min }, rec: { ...(current[field.key]?.rec || {}), ...rec } }; continue }
        if (field.type === 'datetime' && typeof value === 'string') { next[field.key] = `${value}T00:00`; continue }
        if (field.type === 'chips' && Array.isArray(value)) { next[field.key] = value.join(', '); continue }
        next[field.key] = field.type === 'number' || field.type === 'select' ? (value === undefined || value === null ? '' : String(value)) : value
      }
      return next
    })
    setAiKeys((current) => { const next = new Set(current); for (const key of Object.keys(values)) if (!filled.includes(key)) next.delete(key); for (const key of filled) next.add(key); return next })
  }
  const { shownFields, sections } = formLayout(fields, form)
  const reviewRows: ReviewRow[] = form ? shownFields.map((field) => {
    const value = previewValue(form[field.key], optionsOf(field))
    return { key: field.key, label: field.label, value, state: !value && field.required ? 'missing' : aiKeys.has(field.key) ? 'ai' : value ? 'ok' : 'empty' }
  }) : []
  const tableFields = fields.filter((f) => f.table)
  const visible = rows
  /** A manager puts a trashed item back as it was. */
  async function restore(row: any) {
    if (busy) return
    const res = await fetch(`${API}?type=${type}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, restore: true }) })
    const data = await res.json().catch(() => null)
    setMsg(res.ok ? { tone: 'ok', text: 'از سطل زباله برگشت.' } : { tone: 'err', text: data?.error || 'بازگردانی ناموفق بود' })
    load()
  }

  const bulkEnabled = type !== 'vip-plans'
  const visibleIds = visible.map((row) => Number(row.id))
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
    if (!ids.length || busy) return
    setBusy(true)
    setBulkProgress(0)
    setMsg(null)
    const result = await runBulkAction(API, type, ids, action, setBulkProgress)
    setSelected(new Set(result.failed.map((item) => item.id)))
    const label = action === 'delete' ? (fa ? 'حذف' : 'deleted') : action === 'draft' ? (fa ? 'پیش‌نویس' : 'moved to draft') : (fa ? 'منتشر' : 'published')
    setMsg({ tone: result.failed.length ? 'err' : 'ok', text: fa
      ? `${result.succeeded.length.toLocaleString('fa-IR')} مورد ${label} شد.${result.failed.length ? ` ${result.failed.length.toLocaleString('fa-IR')} مورد ناموفق بود: ${result.failed.slice(0, 3).map((item) => `#${item.id} ${item.reason}`).join('، ')}` : ''}`
      : `${result.succeeded.length} items ${label}.${result.failed.length ? ` ${result.failed.length} failed: ${result.failed.slice(0, 3).map((item) => `#${item.id} ${item.reason}`).join(', ')}` : ''}` })
    await load()
    setBusy(false)
  }

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
          <div className="mx-form-head"><strong>{editId ? (fa ? `ویرایش #${editId}` : `Edit #${editId}`) : (fa ? 'مورد جدید' : 'New entry')}</strong>{editId && <a className="mx-form-history" href={`/admin/history?type=${encodeURIComponent(type)}&id=${editId}`} target="_blank" rel="noreferrer">{fa ? 'تاریخچهٔ نسخه‌ها' : 'Version history'}</a>}</div>
          <AiAutofill section={type} fields={aiFields} form={form} onApply={applyAi} />
          {type === 'cinema-titles' && !mine && <CinemaMetadataLookup key={editId ?? 'new'} value={form.imdbId} kind={form.kind} onApply={(values, replace) => { setForm(current => current ? applyCinemaMetadata(current,values,replace,!editId) : current);setAiKeys(current=>new Set([...current,...Object.keys(values)])) }} />}
          {sections.map((section) => {
            const body = section.fields.map((field) => <FieldBox key={field.key} field={field} value={form[field.key]} ai={aiKeys.has(field.key)} organization={assetOrganization}
              options={field.source ? [{ value: '', label: field.source.empty || '—' }, ...(sources[field.source.type] || [])] : field.options} fa={fa} onBusy={setBusy} titleHint={form.title || form.name || ''}
              onChange={(value, projected) => { if (projected) setForm((current) => (current ? { ...current, ...projected, [field.key]: value } : current)); else set(field.key, value) }} />)
            return section.title
              ? <fieldset key={section.title} className="mx-section"><legend className="mx-section-title">{section.title}</legend><div className="mx-grid">{body}</div></fieldset>
              : <div key="fields" className="mx-grid">{body}</div>
          })}
          {paywall && <ItemAudiencePanel type={paywall.ownerType} id={editId} noun={paywall.noun} />}
          {paywall && <PaidAccessPanel ownerType={paywall.ownerType} ownerId={editId} noun={paywall.noun} />}
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : needsReview() ? (fa ? 'بازبینی و انتشار' : 'Review & publish') : editId ? (fa ? 'ذخیره تغییرات' : 'Save changes') : (fa ? 'ایجاد' : 'Create')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setForm(null); setEditId(null) }}>{fa ? 'انصراف' : 'Cancel'}</button>
          </div>
          <PublishReview open={review} title={String(form[titleKey] || form.title || form.name || '')} rows={reviewRows} busy={busy} onCancel={() => setReview(false)} onConfirm={() => void persist()} />
        </form>
      )}

      <div className="cms-summary mx-toolbar">
        <div><span>{fa ? 'همه موارد' : 'Total'}</span><b>{overall.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>
        {vip !== null && <div data-vip=""><span>{fa ? 'ویژه اعضای VIP' : 'VIP only'}</span><b>{vip.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>}
        {trashed > 0 && <div><span>{mine ? 'در سطل زباله، منتظر مدیر' : 'در سطل زباله، منتظر تصمیم شما'}</span><b>{trashed.toLocaleString('fa-IR')}</b></div>}
        <label className="cms-search"><span>{fa ? 'جست‌وجو' : 'Search'}</span><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={fa ? 'عنوان یا نشانی…' : 'Title or slug…'} /></label>
      </div>

      <AdminPagination fa={fa} page={page} pages={pages} size={pageSize} total={total} shown={rows.length} busy={loading || busy} onPage={setPage} onSize={(size) => { setPage(1); setPageSize(size) }} />
      {bulkEnabled && <BulkActions count={selected.size} canPublish={hasStatus} fa={fa} busy={busy} progress={bulkProgress} onApply={applyBulk} onClear={() => setSelected(new Set())} />}
      <div className="card overflow-x-auto">
        {loading ? <p className="muted text-center py-6">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : (
          <table className="data">
            <thead><tr>{bulkEnabled && <th><input type="checkbox" aria-label={fa ? 'انتخاب همه موارد نمایش‌داده‌شده' : 'Select all visible items'} checked={allVisibleSelected} disabled={busy || !visibleIds.length} onChange={toggleAllVisible} /></th>}<th>#</th>{tableFields.map((f) => <th key={f.key}>{f.label}</th>)}<th>{fa ? 'عملیات' : 'Actions'}</th></tr></thead>
            <tbody>
              {visible.map((row) => {
                const href = publicPath?.(row)
                return (
                  <tr key={row.id} className={selected.has(row.id) ? 'is-selected' : ''}>
                    {bulkEnabled && <td><input type="checkbox" aria-label={`${fa ? 'انتخاب' : 'Select'} ${row[titleKey] || row.name || `#${row.id}`}`} checked={selected.has(row.id)} disabled={busy} onChange={() => toggleSelected(row.id)} /></td>}
                    <td className="num">{row.id}</td>
                    {tableFields.map((f) => <td key={f.key}>{typeof f.table === 'function' ? f.table(row) : cell(f, row[f.key], fa)}</td>)}
                    <td>{row.status === 'TRASHED' ? <div className="flex gap-1" data-testid="trash-row">
                      <span className="badge badge-gray">در سطل زباله</span>
                      {mine ? <span className="muted text-sm">منتظر تصمیم مدیر بخش</span> : <>
                        <button type="button" className="badge badge-purple" disabled={busy} onClick={() => restore(row)}>بازگردانی</button>
                        <button type="button" className="badge badge-red" disabled={busy} onClick={() => remove(row)}>حذف نهایی</button>
                      </>}
                    </div> : <div className="flex gap-1">
                      <button type="button" className="badge badge-purple" disabled={busy} onClick={() => open(row)}>{fa ? 'ویرایش' : 'Edit'}</button>
                      {href && <Link className="badge badge-gray" href={href} target="_blank" rel="noopener noreferrer">{fa ? 'مشاهده ↗' : 'View ↗'}</Link>}
                      <button type="button" className="badge badge-red" disabled={busy} onClick={() => remove(row)}>{mine ? 'درخواست حذف' : fa ? 'حذف' : 'Delete'}</button>
                    </div>}</td>
                  </tr>
                )
              })}
              {!visible.length && <tr><td colSpan={tableFields.length + 2 + Number(bulkEnabled)} className="muted text-center py-8">{fa ? 'هنوز موردی ثبت نشده.' : 'Nothing here yet.'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <AdminPagination fa={fa} page={page} pages={pages} size={pageSize} total={total} shown={rows.length} busy={loading || busy} onPage={setPage} onSize={(size) => { setPage(1); setPageSize(size) }} />
    </div>
  )
}

function cell(field: MediaField, value: unknown, fa: boolean): ReactNode {
  if (typeof value === 'boolean') return value ? <span className="mx-yes">{fa ? 'دارد' : 'Yes'}</span> : <span className="mx-no">—</span>
  if (field.key === 'access') return value === 'MEMBERS' ? <span className="badge vip-badge-sm">VIP</span> : <span className="muted">{fa ? 'عمومی' : 'Public'}</span>
  if (field.key === 'status') return value === 'DRAFT' ? <span className="badge badge-gray">{fa ? 'پیش‌نویس' : 'Draft'}</span> : <span className="badge badge-green">{fa ? 'منتشر' : 'Live'}</span>
  if (field.type === 'select') { const label = field.options?.find((o) => o.value === String(value))?.label; return label ? <span className="mx-tag">{label}</span> : String(value ?? '—') }
  if (field.type === 'image') return value ? <img src={String(value)} alt="" className={`mx-thumb${field.frame === 'poster' || field.key === 'poster' ? ' is-poster' : ''}`} /> : <span className={`mx-thumb is-empty${field.frame === 'poster' || field.key === 'poster' ? ' is-poster' : ''}`} aria-hidden="true" />
  const str = String(value ?? '')
  return str.length > 50 ? `${str.slice(0, 50)}…` : str || '—'
}

/** Fields that take the whole width of the form grid. */
const WIDE_TYPES = new Set(['textarea', 'image', 'links', 'records', 'seasons', 'requirements', 'picklist', 'terms', 'people', 'chips'])

/** One field of the form: its label (with the AI-suggestion mark), its input and its hint. */
function FieldBox({ field, value, ai, organization, options, fa, onBusy, titleHint, onChange }: { field: MediaField; value: any; ai: boolean; organization?: AssetOrganization; options?: Opt[]; fa: boolean; onBusy: (busy: boolean) => void; titleHint: string; onChange: (value: unknown, projected?: Record<string, string>) => void }) {
  return <div className={`mx-field${field.wide || WIDE_TYPES.has(field.type || '') ? ' is-wide' : ''}${ai ? ' is-ai' : ''}`}>
    {field.type !== 'checkbox' && <span className="label">{field.label}{field.required ? ' *' : ''}{ai && <span className="ai-badge">پیشنهاد AI</span>}</span>}
    <OrganizationScope value={organization ? { ...organization, quality: field.key === 'audioHqUrl' ? '320' : field.key === 'audioUrl' ? '128' : undefined, video: field.key === 'trailerUrl' } : undefined}><FieldInput field={field} value={value} onChange={onChange} options={options} fa={fa} onBusy={onBusy} titleHint={titleHint} /></OrganizationScope>
    {field.hint && <small className="muted mx-hint">{field.hint}</small>}
  </div>
}

function FieldInput({ field, value, onChange, options, fa, onBusy, titleHint }: { field: MediaField; value: any; onChange: (value: unknown, projected?: Record<string, string>) => void; options?: Opt[]; fa: boolean; onBusy: (busy: boolean) => void; titleHint: string }) {
  switch (field.type) {
    case 'checkbox':
      return <label className="flex items-center gap-2 text-sm mx-check"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>
    case 'richtext':
      return <RichEditor value={String(value || '')} onChange={(next) => onChange(next)} placeholder={field.placeholder} dir={field.dir || 'rtl'} minHeight={170} assetSection={field.upload || 'general'} />
    case 'textarea':
      return <textarea className="textarea" aria-label={field.label} rows={5} dir={field.dir} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} required={field.required} />
    case 'select':
      return <select className="select" aria-label={field.label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>{(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    case 'image':
      return <div className="mx-image"><CoverField value={value || ''} title={titleHint} onChange={onChange} onBusy={onBusy} mode={field.frame ?? (field.key === 'poster' ? 'poster' : 'media')} role={imageRole(field.key === 'image' ? 'cover' : field.key)} /></div>
    case 'date': case 'datetime':
      return <JalaliDateInput withTime={field.type === 'datetime'} aria-label={field.label} value={value || ''} onChange={onChange} />
    case 'links':
      return <LinksEditor value={Array.isArray(value) ? value : []} onChange={onChange} fa={fa} section={field.upload || 'general'} priced={field.upload === 'cinema' || field.upload === 'software' || field.upload === 'games'} />
    case 'records':
      return <RecordsEditor value={Array.isArray(value) ? value : []} keys={field.recordKeys || [{ key: 'text', label: field.label }]} onChange={onChange} fa={fa} sourceOptions={(options || []).filter((o) => o.value !== '')} />
    case 'seasons':
      return <SeasonsEditor value={Array.isArray(value) ? value : []} onChange={onChange} fa={fa} />
    case 'requirements':
      return <RequirementsEditor value={value && typeof value === 'object' ? value : { min: {}, rec: {} }} onChange={onChange} fa={fa} />
    case 'terms':
      return <TermPicker taxonomy={field.taxonomy || ''} value={value && typeof value === 'object' && Array.isArray(value.ids) ? value : { ids: [], primary: null }} onChange={onChange} />
    case 'people':
      return <PeoplePicker mode={field.people || 'line'} value={value} onChange={(next) => onChange(next)} label={field.label} fa={fa} />
    case 'picklist':
      return <PickList value={Array.isArray(value) ? value.map(String) : []} options={options || []} onChange={onChange} fa={fa} />
    case 'studio':
      return <StudioPicker value={String(value ?? '')} onChange={(next) => onChange(next)} label={field.label} fa={fa} />
    case 'chips':
      return <ChipPicker value={value} options={options || []} onChange={onChange} label={field.label} fa={fa} />
    default:
      if (field.key === 'trailerUrl') return <div className="mx-upload-field"><input className="input" aria-label={field.label} dir="ltr" value={value??''} onChange={e=>onChange(e.target.value)} placeholder={field.placeholder}/><CopyToServer kind="file" section="cinema" url={/\.(mp4|webm|mkv|mov)(\?|$)/i.test(String(value))?String(value):''} onCopied={onChange}/></div>
      if (field.upload) return <div className="mx-upload-field"><input className="input" aria-label={field.label} dir={field.dir || 'ltr'} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} required={field.required} /><FileUpload section={field.upload} accept={field.accept} onUploaded={(file) => onChange(file.url)} label={fa ? 'بارگذاری از رایانه' : 'Upload'} /><CopyToServer kind="file" section={field.upload} url={String(value || '')} onCopied={onChange} /></div>
      return <input className="input" aria-label={field.label} dir={field.dir} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} required={field.required} />
  }
}

// ------------------------------------------------------------------ nested editors

type TermOption = { id: number; name: string; slug?: string; facet?: string; depth: number; parentId: number | null; count: number }
type TermValue = { ids: number[]; primary: number | null }

/** Category tree checkboxes with a “main category” choice (used for URLs and breadcrumbs). */
export function TermPicker({ taxonomy, value, onChange }: { taxonomy: string; value: TermValue; onChange: (value: TermValue, projected?: Record<string, string>) => void }) {
  const [options, setOptions] = useState<TermOption[] | null>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/taxonomy?tax=${encodeURIComponent(taxonomy)}&options=1`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { options: [] })).then((d) => alive && setOptions(d.options || [])).catch(() => alive && setOptions([]))
    return () => { alive = false }
  }, [taxonomy])
  const change = (next: TermValue) => onChange(next, options && isTaxonomy(taxonomy) ? termProjectionChange(taxonomy, options, value, next) : {})
  const toggle = (id: number) => {
    const ids = value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id]
    change({ ids, primary: ids.includes(value.primary ?? -1) ? value.primary : ids[0] ?? null })
  }
  const manage = <Link href={`/admin/taxonomy?tax=${taxonomy}`} target="_blank" className="text-sm">مدیریت دسته‌ها ↗</Link>
  if (!options) return <p className="muted text-sm">در حال بارگذاری دسته‌ها…</p>
  if (!options.length) return <p className="muted text-sm">هنوز دسته‌ای ساخته نشده. {manage}</p>
  const shown = filter.trim() ? options.filter((o) => o.name.includes(filter.trim())) : options
  return <div className="tx-picker">
    <div className="tx-picker-head"><input className="input" type="search" placeholder="جست‌وجوی دسته…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="جست‌وجوی دسته" />{manage}</div>
    <ul aria-label="دسته‌ها">
      {shown.map((o) => <li key={o.id} style={{ paddingInlineStart: `${(filter ? 0 : o.depth - 1) * 18}px` }}>
        <label><input type="checkbox" checked={value.ids.includes(o.id)} onChange={() => toggle(o.id)} />{o.name}</label>
        {value.ids.includes(o.id) && <button type="button" className={`tx-primary${value.primary === o.id ? ' is-on' : ''}`} aria-pressed={value.primary === o.id} onClick={() => change({ ...value, primary: o.id })}>{value.primary === o.id ? '★ دستهٔ اصلی' : '☆ اصلی شود'}</button>}
      </li>)}
    </ul>
    <small className="muted">{value.ids.length ? `${value.ids.length.toLocaleString('fa-IR')} دسته انتخاب شده؛ دستهٔ اصلی در نشانی و مسیر صفحه نمایش داده می‌شود.` : 'حداقل یک دسته انتخاب کنید.'} فیلدهای مرتبط مثل ژانر از دسته‌های انتخابی پر می‌شوند؛ ارتباط هر شاخه در مدیریت دسته‌ها قابل تنظیم است.</small>
  </div>
}

export type LinkRow = { label: string; kind: string; quality: string; size: string; audio: string; subtitle: boolean; language?: string; url: string; embedUrl?: string; access: string; platform?: string; architecture?: string; checksum?: string; disabled?: boolean; clicks?: number; price?: string; priceVip?: string; sales?: number }
const blankLink = (): LinkRow => ({ label: '', kind: 'DOWNLOAD', quality: '1080p', size: '', audio: '', subtitle: false, url: '', embedUrl: '', access: 'PUBLIC' })

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

function PlaybackBadge({ url, embedUrl, kind, fa }: { url: string; embedUrl?: string; kind: string; fa: boolean }) {
  const [label, labelEn, tone] = PLAYBACK_LABEL[playbackKind(url, kind, toEmbedUrl, embedUrl)]
  return <span className={`mx-play-badge ${tone}`}>{fa ? label : labelEn}</span>
}

const humanSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`)

export function LinksEditor({ value, onChange, fa, compact, section = 'general', priced = false }: { value: LinkRow[]; onChange: (value: LinkRow[]) => void; fa: boolean; compact?: boolean; section?: string; priced?: boolean }) {
  // The shared link lists: audio sides (dub, original, studios…) and suggested qualities, managed by the owner.
  const linkLists = useSectionLists('media')
  const qualityList = `mx-q-${useId().replace(/:/g, '')}`
  const update = (index: number, patch: Partial<LinkRow>) => onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <div className={`mx-links${compact ? ' is-compact' : ''}`}>
      <datalist id={qualityList}>{(linkLists.QUALITY || []).map((entry) => <option key={entry.code} value={entry.code} />)}</datalist>
      {value.map((row, index) => (
        <div key={index} className="mx-link-row">
          <div className="mx-link-main">
            <input className="input" placeholder={fa ? 'برچسب (مثلاً نسخه بلوری)' : 'Label (e.g. BluRay)'} value={row.label} onChange={(e) => update(index, { label: e.target.value })} />
            <select className="select" value={row.kind} onChange={(e) => update(index, { kind: e.target.value })} aria-label="kind"><option value="DOWNLOAD">{fa ? 'دانلود' : 'Download'}</option><option value="STREAM">{fa ? 'پخش آنلاین' : 'Stream'}</option>{section === 'cinema' && <><option value="SUBTITLE">{fa ? 'فایل زیرنویس' : 'Subtitle file'}</option><option value="AUDIO">{fa ? 'فایل صوت جدا' : 'Separate audio'}</option></>}</select>
            <input aria-label="کیفیت" className="input" dir="ltr" placeholder="1080p" list={qualityList} value={row.quality} onChange={(e) => update(index, { quality: e.target.value })} />
            <input aria-label="حجم فایل" className="input" dir="ltr" placeholder="2.1 GB" value={row.size} onChange={(e) => update(index, { size: e.target.value })} />
            {row.kind === 'SUBTITLE' || row.kind === 'AUDIO' ? <select className="select" value={row.language || ''} onChange={(e) => update(index, { language: e.target.value })} aria-label="language"><option value="">{fa ? 'زبان: —' : 'Language: —'}</option>{Object.entries(TRACK_LANGUAGES).map(([code, name]) => <option key={code} value={code}>{fa ? name.fa : name.en}</option>)}</select> : <><select className="select" value={row.audio} onChange={(e) => update(index, { audio: e.target.value })} aria-label="audio"><option value="">{fa ? 'صدا: —' : 'Audio: —'}</option>{Object.entries(optionsOf(linkLists.AUDIO, row.audio ? [row.audio] : [])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>
            <label className="mx-mini-check"><input type="checkbox" checked={row.subtitle} onChange={(e) => update(index, { subtitle: e.target.checked })} />{fa ? 'زیرنویس' : 'Subs'}</label></>}
            <select className="select" value={row.access} onChange={(e) => update(index, { access: e.target.value })} aria-label="access" data-vip=""><option value="PUBLIC">{fa ? 'عمومی' : 'Public'}</option><option value="MEMBERS">VIP</option></select>
          </div>
          {section === 'software' && <div className="mx-software-link-meta">
            <label><span>{fa ? 'سیستم‌عامل فایل' : 'File OS'}</span><input className="input" list="software-platform-options" value={row.platform || ''} onChange={(e) => update(index, { platform: e.target.value })} placeholder="Windows" /></label>
            <label><span>{fa ? 'معماری پردازنده' : 'CPU architecture'}</span><input className="input" list="software-architecture-options" dir="ltr" value={row.architecture || ''} onChange={(e) => update(index, { architecture: e.target.value })} placeholder="x64" /></label>
            <label><span>SHA-256</span><input className="input" dir="ltr" value={row.checksum || ''} onChange={(e) => update(index, { checksum: e.target.value })} placeholder="64 hex characters" /></label>
          </div>}
          {row.kind === 'STREAM' && <div className="mx-link-file">
            <input aria-label={fa ? 'نشانی Embed (اختیاری)' : 'Optional embed URL'} className="input mx-link-url" dir="ltr" placeholder="https://player.example.com/embed/..." value={row.embedUrl || ''} onChange={(e) => update(index, { embedUrl: e.target.value })} />
          </div>}
          <div className="mx-link-file">
            <input aria-label="نشانی فایل یا صفحه منبع" className="input mx-link-url" dir="ltr" placeholder="https://dl.example.com/file.mkv" value={row.url} onChange={(e) => update(index, { url: e.target.value })} />
            <FileUpload compact section={section} onUploaded={(file) => update(index, { url: file.url, size: row.size || humanSize(file.size), label: row.label || file.name.replace(/\.[^.]+$/, '') })} label={fa ? 'بارگذاری' : 'Upload'} />
          </div>
          <div className="mx-link-foot">
            {priced && <span className={`mx-link-price${row.price ? ' is-on' : ''}`} title={fa ? 'قیمت جدا برای همین لینک (مثلاً نسخهٔ 4K)؛ خالی = تابع قیمت/دسترسی خود مورد' : 'Own price for this link; empty = follows the item'}>
              <input className="input" dir="ltr" inputMode="numeric" placeholder={fa ? 'قیمت جدا (تومان)' : 'Own price (Toman)'} value={row.price ?? ''} onChange={(e) => update(index, { price: e.target.value.replace(/[^\d۰-۹]/g, '') })} aria-label={fa ? 'قیمت جدای لینک' : 'Link price'} />
              {row.price ? <select className="select" value={row.priceVip || 'FREE'} onChange={(e) => update(index, { priceVip: e.target.value })} aria-label="VIP"><option value="FREE">{fa ? 'VIP رایگان' : 'VIP free'}</option><option value="NONE">{fa ? 'VIP هم می‌خرد' : 'VIP pays'}</option></select> : null}
              {!!row.sales && <span className="muted text-sm">🛒 {row.sales.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}
            </span>}
            {row.url && <PlaybackBadge url={row.url} embedUrl={row.embedUrl} kind={row.kind} fa={fa} />}
            <label className={`mx-mini-check${row.disabled ? ' is-danger' : ''}`} title={fa ? 'لینک غیرفعال در سایت نمایش داده نمی‌شود (لینک خراب یا حذف به‌خاطر حق نشر)' : 'Disabled links are hidden on the site'}><input type="checkbox" checked={!!row.disabled} onChange={(e) => update(index, { disabled: e.target.checked })} />{fa ? 'غیرفعال' : 'Disabled'}</label>
            {!!row.clicks && <span className="muted text-sm" title={fa ? 'تعداد کلیک' : 'Clicks'}>⤓ {row.clicks.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}
            <div className="mx-row-tools">
              <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, -1))} aria-label="up">↑</button>
              <button type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, 1))} aria-label="down">↓</button>
              <button type="button" className="badge badge-red" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label="remove">✕</button>
            </div>
          </div>
        </div>
      ))}
      {!value.length && <p className="mx-links-empty">{fa ? 'هنوز لینکی اضافه نشده. برای هر کیفیت یا نسخه یک لینک دانلود یا پخش بسازید.' : 'No links yet. Add one download or stream link per quality or version.'}</p>}
      <button type="button" className="mx-links-add" onClick={() => onChange([...value, { ...blankLink(), ...(priced ? { price: '' } : {}) }])}>+ {fa ? 'افزودن لینک' : 'Add link'}</button>
      {priced && !compact && <p className="muted text-sm mx-links-hint">{fa ? 'قیمت جدا: لینکی که قیمت دارد جداگانه فروخته می‌شود (مثلاً نسخهٔ 4K گران‌تر)؛ خرید کل مورد آن را باز نمی‌کند. خالی بگذارید تا تابع قیمت یا دسترسی خود مورد باشد. ماژول «فروش محتوا» باید روشن باشد.' : 'Own price: a priced link is sold separately; buying the item does not open it.'}</p>}
      {!compact && <p className="muted text-sm mx-links-hint">{fa ? 'پخش مستقیم برای MP4 (H.264/AAC)، WebM و HLS (.m3u8) و Embed برای ارائه‌دهنده‌های شناخته‌شده یا نشانی Embed مجاز کار می‌کند. برای HLS، CORS میزبان باید فعال باشد. MKV فقط وقتی پخش می‌شود که کدک ویدیو H.264 و صدا AAC باشد (نه x265/HEVC یا AC3/DTS). لینک باید https باشد.' : 'Direct playback works for MP4 (H.264/AAC), WebM and HLS (.m3u8); known providers and an explicit embed URL use an iframe. HLS hosts must allow browser CORS. MKV plays only with H.264 + AAC. Links must be https.'}</p>}
    </div>
  )
}

function RecordsEditor({ value, keys, onChange, fa, sourceOptions = [] }: { value: Record<string, string>[]; keys: NonNullable<MediaField['recordKeys']>; onChange: (value: Record<string, string>[]) => void; fa: boolean; sourceOptions?: Opt[] }) {
  const choices = (k: NonNullable<MediaField['recordKeys']>[number]) => (k.options === 'source' ? sourceOptions : k.options)
  return (
    <div className="mx-records">
      {value.map((row, index) => (
        <div key={index} className="mx-record-row">
          {keys.map((k) => <div key={k.key} className={k.wide?'is-wide':undefined}>{choices(k) ? <select className="select" aria-label={k.label} value={row[k.key] || ''} onChange={(e) => onChange(value.map((r, i) => (i === index ? { ...r, [k.key]: e.target.value } : r)))}><option value="">{k.label}…</option>{choices(k)!.some((o) => o.value === row[k.key]) || !row[k.key] ? null : <option value={row[k.key]}>{row[k.key]}</option>}{choices(k)!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input className="input" aria-label={k.label} dir={k.dir} placeholder={k.label} value={row[k.key] || ''} onChange={(e) => onChange(value.map((r, i) => (i === index ? { ...r, [k.key]: e.target.value } : r)))} />}{k.key==='image'&&<CopyToServer url={row[k.key]||''} onCopied={url=>onChange(value.map((r,i)=>i===index?{...r,[k.key]:url}:r))}/>}</div>)}
          <div className="mx-row-tools">
            <button aria-label="جابه‌جایی به بالا" type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, -1))}>↑</button>
            <button aria-label="حذف" type="button" className="badge badge-red" onClick={() => onChange(value.filter((_, i) => i !== index))}>✕</button>
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
  const organization=useAssetOrganization()
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
            <CopyToServer url={season.poster||''} onCopied={poster=>setSeason(si,{poster})}/>
            <button aria-label="حذف فصل" type="button" className="badge badge-red" onClick={() => confirm(fa ? 'این فصل و قسمت‌هایش حذف شود؟' : 'Remove this season and its episodes?') && onChange(value.filter((_, i) => i !== si))}>✕</button>
          </header>
          <div className="mx-episodes">
            {season.episodes.map((episode, ei) => {
              const key = `${si}-${ei}`
              return (
                <div key={ei} className={`mx-episode${open === key ? ' is-open' : ''}`}>
                  <div className="mx-episode-head">
                    <input className="input mx-ep-no" type="number" value={episode.number} onChange={(e) => setEpisode(si, ei, { number: e.target.value })} aria-label="episode number" />
                    <input className="input" placeholder={fa ? 'عنوان قسمت' : 'Episode title'} value={episode.title || ''} onChange={(e) => setEpisode(si, ei, { title: e.target.value })} />
                    <select className="select" value={episode.access || 'PUBLIC'} onChange={(e) => setEpisode(si, ei, { access: e.target.value })} aria-label="access" data-vip=""><option value="PUBLIC">{fa ? 'عمومی' : 'Public'}</option><option value="MEMBERS">VIP</option></select>
                    <span className="muted text-sm">{(episode.links || []).length} {fa ? 'لینک' : 'links'}</span>
                    <button aria-label="باز و بسته کردن قسمت" type="button" className="badge badge-purple" onClick={() => setOpen(open === key ? '' : key)}>{open === key ? '▲' : '▼'}</button>
                    <button aria-label="حذف قسمت" type="button" className="badge badge-red" onClick={() => setSeason(si, { episodes: season.episodes.filter((_, i) => i !== ei) })}>✕</button>
                  </div>
                  {open === key && (
                    <div className="mx-episode-body">
                      <div className="mx-grid">
                        <input aria-label="عنوان انگلیسی قسمت" className="input" dir="ltr" placeholder="English title" value={episode.titleEn || ''} onChange={(e) => setEpisode(si, ei, { titleEn: e.target.value })} />
                        <input className="input" type="number" placeholder={fa ? 'مدت (دقیقه)' : 'Runtime (min)'} value={episode.runtime ?? ''} onChange={(e) => setEpisode(si, ei, { runtime: e.target.value })} />
                        <JalaliDateInput className="input" value={episode.airDate || ''} onChange={(value) => setEpisode(si, ei, { airDate: value })} />
                        <input className="input" dir="ltr" placeholder={fa ? 'تصویر قسمت (URL)' : 'Still image URL'} value={episode.still || ''} onChange={(e) => setEpisode(si, ei, { still: e.target.value })} />
                        <CopyToServer url={episode.still||''} onCopied={still=>setEpisode(si,ei,{still})}/>
                      </div>
                      <div className="mt-2"><p className="text-sm">{fa ? 'خلاصه قسمت' : 'Episode summary'}</p><RichEditor value={episode.summary || ''} onChange={summary => setEpisode(si, ei, { summary })} placeholder={fa ? 'خلاصه قسمت' : 'Episode summary'} compact minHeight={120} assetSection="cinema" /></div>
                      <OrganizationScope value={organization?{...organization,section:'series',season:Number(season.number)}:undefined}><LinksEditor compact value={episode.links || []} onChange={(links) => setEpisode(si, ei, { links })} fa={fa} section="cinema" /></OrganizationScope>
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
          <input aria-label={`حداقل ${k.fa}`} className="input" dir="ltr" value={value.min?.[k.key] || ''} onChange={(e) => set('min', k.key, e.target.value)} />
          <input aria-label={`پیشنهادی ${k.fa}`} className="input" dir="ltr" value={value.rec?.[k.key] || ''} onChange={(e) => set('rec', k.key, e.target.value)} />
        </div>
      ))}
    </div>
  )
}

/**
 * Several values from an owner's list (a software title's platforms): each entry is a toggle, in the list's order. A
 * value the item has that the list no longer offers stays chosen until removed. Stored as a comma list.
 */
function ChipPicker({ value, options, onChange, label, fa }: { value: unknown; options: Opt[]; onChange: (value: string) => void; label: string; fa: boolean }) {
  const chosen = (Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[,،|]/)).map((part) => part.trim()).filter(Boolean)
  // A value matches an option by its code or its alias (an imported English name, shown at once as its entry).
  const same = (a: string, b?: string) => !!b && a.toLowerCase() === b.toLowerCase()
  const names = (option: Opt) => (item: string) => same(item, option.value) || same(item, option.alias)
  const offered = options.filter((option) => option.value)
  const has = (option: Opt) => chosen.some(names(option))
  const toggle = (option: Opt) => onChange((has(option) ? chosen.filter((item) => !names(option)(item)) : [...chosen, option.value]).join(', '))
  const others = chosen.filter((item) => !offered.some((option) => names(option)(item)))
  const drop = (item: string) => onChange(chosen.filter((other) => other !== item).join(', '))
  return <div className="mx-chips" role="group" aria-label={label}>
    {offered.map((option) => <button key={option.value} type="button" className={`mx-chip${has(option) ? ' is-on' : ''}`} aria-pressed={has(option)} onClick={() => toggle(option)}>{option.label}</button>)}
    {others.map((item) => <button key={item} type="button" className="mx-chip is-on is-other" aria-pressed="true" title={fa ? 'در فهرست نیست؛ برای برداشتن بزنید' : 'Not in the list; press to remove'} onClick={() => drop(item)}>{item} ×</button>)}
    {!offered.length && !others.length && <span className="muted">{fa ? 'فهرستی تعریف نشده است.' : 'No list entries yet.'}</span>}
  </div>
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
            <button aria-label="جابه‌جایی به بالا" type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, -1))}>↑</button>
            <button aria-label="جابه‌جایی به پایین" type="button" className="badge badge-gray" onClick={() => onChange(move(value, index, 1))}>↓</button>
            <button aria-label="حذف" type="button" className="badge badge-red" onClick={() => onChange(value.filter((v) => v !== o.value))}>✕</button>
          </span></li>
        ))}
        {!chosen.length && <li className="muted">{fa ? 'هنوز آهنگی انتخاب نشده' : 'No tracks yet'}</li>}
      </ol>
      <input className="input" type="search" placeholder={fa ? 'جست‌وجوی آهنگ برای افزودن…' : 'Search tracks to add…'} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mx-pick-pool">{pool.map((o) => <button key={o.value} type="button" className="badge badge-purple" onClick={() => onChange([...value, o.value])}>+ {o.label}</button>)}</div>
    </div>
  )
}
