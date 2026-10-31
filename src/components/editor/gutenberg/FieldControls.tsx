'use client'

import { useEffect, useState } from 'react'
import { Button, RangeControl, SelectControl, TextControl, TextareaControl, ToggleControl } from '@wordpress/components'
import LibraryPicker from '@/components/media/LibraryPicker'
import RemoteCopy from '@/components/media/RemoteCopy'
import { uploadFile } from '@/components/admin/FileUpload'
import { BREAKPOINTS, defaultProps, fieldDefault, type AssetValue, type FieldSchema, type FieldSpec } from '@/modules/editor/domain/fields'
import type { RichTextDoc } from '@/modules/editor/domain/rich-text'
import RichTextField from './RichTextField'

// The settings panel of a block is built from the fields its type declares: a new block type needs no panel of its own.

const LABELS: Record<string, string> = {
  form: 'فرم', file: 'فایل رسانه', poster: 'تصویر کاور', audioKind: 'نوع فایل صوتی',
  source: 'انتخاب محتوا', limit: 'حداکثر تعداد نمایش', showSummary: 'نمایش خلاصه', id: 'شناسهٔ مورد',
  width: 'پهنا', space: 'فاصلهٔ بالا و پایین', tone: 'زمینه', anchor: 'لنگر (نشانی درون صفحه)', align: 'چینش', columns: 'تعداد ستون', gap: 'فاصلهٔ میان اجزا', span: 'پهنای ستون',
  direction: 'جهت چیدن', size: 'اندازه', line: 'نوع خط', content: 'متن', dir: 'جهت متن', text: 'متن', level: 'سطح تیتر', image: 'تصویر', link: 'پیوند', rounded: 'گوشهٔ گرد', images: 'تصویرها',
  embed: 'نشانی ویدئو', title: 'عنوان', ratio: 'نسبت تصویر', label: 'نوشته', href: 'نشانی', variant: 'ظاهر', newTab: 'باز شدن در زبانهٔ تازه', cite: 'گوینده', items: 'موردها', question: 'پرسش', answer: 'پاسخ', open: 'باز بودن',
}
const SCREEN: Record<string, string> = { desktop: 'رایانه', tablet: 'تبلت', mobile: 'موبایل' }
const SOURCE_LABELS: Record<string, string> = { latest: 'تازه‌ترین‌ها', selected: 'انتخاب دستی', music: 'موسیقی', podcast: 'پادکست', voice: 'پیام صوتی' }
export const labelOf = (name: string) => LABELS[name] || name

/** The form block's choice: the site's published forms by title; a plain address where the list cannot be read. */
function FormPicker({ value, onChange, label }: { value: string; onChange: (next: string) => void; label: string }) {
  const [forms, setForms] = useState<{ slug: string; title: string }[] | null>(null)
  useEffect(() => {
    let live = true
    void fetch('/api/admin/forms', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (live) setForms(data ? (data.forms || []).filter((form: { published?: boolean }) => form.published).map((form: { slug: string; title: string }) => ({ slug: form.slug, title: form.title })) : []) })
      .catch(() => { if (live) setForms([]) })
    return () => { live = false }
  }, [])
  if (forms && forms.length) return <SelectControl __nextHasNoMarginBottom label={label} value={value} options={[{ label: 'انتخاب فرم…', value: '' }, ...forms.map((form) => ({ label: `${form.title} (${form.slug})`, value: form.slug }))]} onChange={onChange} help="فرم‌ها را در «فرم‌ها و پاسخ‌ها» بسازید؛ فقط فرم‌های منتشرشده اینجا هستند." />
  return <TextControl __nextHasNoMarginBottom label={label} value={value} onChange={onChange} help="نشانی فرم (مثلاً contact)؛ در متن هم می‌توانید [form slug=&quot;contact&quot;] بنویسید." />
}

function AssetControl({ spec, value, onChange, label }: { spec: Extract<FieldSpec, { kind: 'asset' }>; value: AssetValue; onChange: (next: AssetValue) => void; label: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const asset: AssetValue = value && typeof value === 'object' ? value : { src: '', alt: '', caption: '', width: 0, height: 0, mime: '' }
  // The size of an image is read from the image itself, so the page can reserve its place.
  const measure = (src: string) => new Promise<{ width: number; height: number }>((resolve) => { if (spec.accept !== 'image' || !src) return resolve({ width: 0, height: 0 }); const probe = new Image(); probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); probe.onerror = () => resolve({ width: 0, height: 0 }); probe.src = src })
  const setSrc = async (src: string, mime = '') => onChange({ ...asset, src, mime, ...(await measure(src)) })
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError('')
    try { const uploaded = await uploadFile(file, 'pages', () => undefined); await setSrc(uploaded.url, file.type) } catch (cause) { setError(cause instanceof Error ? cause.message : 'بارگذاری انجام نشد') } finally { setBusy(false) }
  }
  return (
    <fieldset className="mc-field-asset">
      <legend>{label}</legend>
      {asset.src && spec.accept === 'image' ? <img className="mc-field-asset-preview" src={asset.src} alt="" /> : null}
      <TextControl __nextHasNoMarginBottom label="نشانی فایل" help="فایلی از کتابخانهٔ رسانهٔ سایت یا یک نشانی https" value={asset.src} onChange={(src) => void setSrc(src.trim())} dir="ltr" />
      <label className="mc-field-upload">
        <span className="components-button is-secondary" aria-disabled={busy}>{busy ? 'در حال بارگذاری…' : 'بارگذاری از رایانه'}</span>
        <input type="file" accept={spec.accept === 'image' ? 'image/*' : spec.accept === 'video' ? 'video/*' : spec.accept === 'audio' ? 'audio/*' : undefined} disabled={busy} onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = '' }} />
      </label>
      <LibraryPicker kind={spec.accept === 'file' ? undefined : spec.accept} onSelect={picked => onChange({ ...asset, src: picked.url, alt: picked.alt, caption: picked.caption, width: picked.width, height: picked.height, mime: picked.mime })} />
      <RemoteCopy url={asset.src} kind={spec.accept === 'image' ? 'image' : 'file'} onCopied={src => void setSrc(src)} />
      {error ? <p className="mc-field-error" role="alert">{error}</p> : null}
      {spec.accept === 'image' ? <TextControl __nextHasNoMarginBottom label="متن جایگزین" help="تصویر چه چیزی را نشان می‌دهد؟ برای نابینایان و موتورهای جست‌وجو" value={asset.alt} onChange={(alt) => onChange({ ...asset, alt })} /> : null}
      <TextControl __nextHasNoMarginBottom label="زیرنویس" value={asset.caption} onChange={(caption) => onChange({ ...asset, caption })} />
    </fieldset>
  )
}

function ListControl({ spec, value, onChange, label }: { spec: Extract<FieldSpec, { kind: 'list' }>; value: Array<Record<string, unknown>>; onChange: (next: Array<Record<string, unknown>>) => void; label: string }) {
  const items = Array.isArray(value) ? value : []
  const move = (from: number, to: number) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next) }
  return (
    <fieldset className="mc-field-list">
      <legend>{label}</legend>
      {items.map((item, index) => (
        <div className="mc-field-list-item" key={index}>
          <div className="mc-field-list-tools">
            <span>{(index + 1).toLocaleString('fa-IR')}</span>
            <Button size="small" variant="tertiary" label="بالاتر" disabled={index === 0} onClick={() => move(index, index - 1)}>↑</Button>
            <Button size="small" variant="tertiary" label="پایین‌تر" disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>↓</Button>
            <Button size="small" variant="tertiary" isDestructive label="حذف" onClick={() => onChange(items.filter((_, at) => at !== index))}>×</Button>
          </div>
          <FieldControls schema={spec.item} values={item} onChange={(patch) => onChange(items.map((current, at) => (at === index ? { ...current, ...patch } : current)))} compact />
        </div>
      ))}
      <Button variant="secondary" disabled={items.length >= spec.max} onClick={() => onChange([...items, defaultProps(spec.item)])}>افزودن</Button>
    </fieldset>
  )
}

function Field({ name, spec, value, onChange, compact }: { name: string; spec: FieldSpec; value: unknown; onChange: (next: unknown) => void; compact: boolean }) {
  const label = labelOf(name)
  if (name === 'form' && spec.kind === 'string') return <FormPicker value={String(value ?? '')} onChange={onChange} label={label} />
  switch (spec.kind) {
    case 'string': return spec.max > 200 ? <TextareaControl __nextHasNoMarginBottom label={label} value={String(value ?? '')} onChange={onChange} /> : <TextControl __nextHasNoMarginBottom label={label} value={String(value ?? '')} onChange={onChange} />
    case 'enum': return <SelectControl __nextHasNoMarginBottom label={label} value={String(value ?? spec.default)} options={spec.values.map((option) => ({ label: (name === 'source' || name === 'audioKind') ? (SOURCE_LABELS[option] || option) : ({ auto: 'خودکار', rtl: 'راست به چپ', ltr: 'چپ به راست', start: 'شروع', end: 'پایان', center: 'وسط', left: 'چپ', right: 'راست', none: 'بدون' } as Record<string, string>)[option] || option, value: option }))} onChange={(next: string) => onChange(next)} />
    case 'int': return <RangeControl __nextHasNoMarginBottom label={label} value={typeof value === 'number' ? value : spec.default} min={spec.min} max={spec.max} step={1} onChange={(next?: number) => onChange(typeof next === 'number' ? Math.round(next) : spec.default)} />
    case 'boolean': return <ToggleControl __nextHasNoMarginBottom label={label} checked={value === true} onChange={onChange} />
    case 'url': return <TextControl __nextHasNoMarginBottom label={label} help="یک نشانی https، مسیری از همین سایت (‎/blog)، یا ‎#لنگر" value={String(value ?? '')} onChange={(next) => onChange(next.trim())} dir="ltr" />
    case 'embed': return <TextControl __nextHasNoMarginBottom label={label} help="لینک ویدیو در YouTube، آپارات، نماشا، تماشا یا Vimeo" value={String((value as { url?: string } | undefined)?.url ?? '')} onChange={(url) => onChange({ provider: '', url: url.trim() })} dir="ltr" />
    case 'asset': return <AssetControl spec={spec} value={value as AssetValue} onChange={onChange} label={label} />
    case 'richText': return <div className="mc-field-rich"><span className="mc-field-label">{label}</span><RichTextField value={(value as RichTextDoc) || (fieldDefault(spec) as RichTextDoc)} onChange={onChange} label={label} compact={compact} /></div>
    case 'responsive': {
      const each = (value && typeof value === 'object' ? value : fieldDefault(spec)) as Record<string, unknown>
      return (
        <fieldset className="mc-field-responsive">
          <legend>{label}</legend>
          {BREAKPOINTS.map((point) => <Field key={point} name={SCREEN[point]} spec={spec.of} value={each[point]} onChange={(next) => onChange({ ...each, [point]: next })} compact={compact} />)}
        </fieldset>
      )
    }
    case 'list': return <ListControl spec={spec} value={value as Array<Record<string, unknown>>} onChange={onChange} label={label} />
  }
}

/** One control per declared field. `skip` names fields that are edited on the canvas instead. */
export default function FieldControls({ schema, values, onChange, skip = [], compact = false }: { schema: FieldSchema; values: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; skip?: readonly string[]; compact?: boolean }) {
  return (
    <div className="mc-fields">
      {Object.entries(schema).filter(([name]) => !skip.includes(name)).map(([name, spec]) => <Field key={name} name={name} spec={spec} value={values?.[name]} onChange={(next) => onChange({ [name]: next })} compact={compact} />)}
    </div>
  )
}
