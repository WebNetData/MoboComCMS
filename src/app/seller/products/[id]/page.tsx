'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { useParams, useRouter } from '@/platform/routing/navigation'
import { call } from '../../SellerContext'
import Variants, { type VariantRow } from './Variants'

type Field = { key: string; label: string; kind: string; options: string[]; required: boolean; variant?: boolean }
type Meta = { categories: { id: number; name: string; parentId: number | null }[]; brands: { id: number; name: string }[] }
type Form = {
  name: string; nameEn: string; slug: string; categoryId: string; brandId: string; kind: string; price: string; compareAtPrice: string; stock: string; sku: string
  image: string; gallery: string[]; shortDescription: string; description: string; weightGrams: string; warranty: string; maxPerOrder: string; specifications: Record<string, string>; variants: VariantRow[]
}
const EMPTY: Form = { name: '', nameEn: '', slug: '', categoryId: '', brandId: '', kind: 'PHYSICAL', price: '', compareAtPrice: '', stock: '', sku: '', image: '', gallery: [], shortDescription: '', description: '', weightGrams: '', warranty: '', maxPerOrder: '', specifications: {}, variants: [] }

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const toHtml = (text: string) => text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map((part) => `<p>${escape(part).replace(/\n/g, '<br>')}</p>`).join('')
const toText = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()

async function upload(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('فقط JPG، PNG یا WebP')
  if (file.size > 15 * 1024 * 1024) throw new Error('حداکثر ۱۵ مگابایت')
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch('/api/seller/media', { method: 'POST', body: form })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'بارگذاری نشد')
  return data.url
}

function Images({ image, gallery, onChange }: { image: string; gallery: string[]; onChange: (image: string, gallery: string[]) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const all = [image, ...gallery].filter(Boolean)
  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setError('')
    const urls = [...all]
    for (const file of [...files].slice(0, 8 - urls.length)) {
      try { urls.push(await upload(file)) } catch (e) { setError(e instanceof Error ? e.message : 'بارگذاری نشد') }
    }
    setBusy(false)
    onChange(urls[0] || '', urls.slice(1))
  }
  const remove = (url: string) => { const rest = all.filter((item) => item !== url); onChange(rest[0] || '', rest.slice(1)) }
  const makeMain = (url: string) => { const rest = all.filter((item) => item !== url); onChange(url, rest) }
  return <div className="sl-images">
    <ul>{all.map((url, index) => <li key={url} className={index === 0 ? 'is-main' : ''}><img src={url} alt="" />{index === 0 ? <span className="sl-main-tag">تصویر اصلی</span> : <button type="button" onClick={() => makeMain(url)}>اصلی شود</button>}<button type="button" className="sl-x" onClick={() => remove(url)} aria-label="حذف تصویر">✕</button></li>)}
      {all.length < 8 && <li className="sl-add"><label>{busy ? 'در حال بارگذاری…' : '+ افزودن تصویر'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(e) => { void add(e.target.files); e.target.value = '' }} /></label></li>}
    </ul>
    <small className="sa-hint">تا ۸ تصویر، زمینهٔ سفید و مربعی پیشنهاد می‌شود (حداقل ۸۰۰×۸۰۰). تصویرها خودکار فشرده می‌شوند.</small>
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>
}

export default function SellerProductEditor() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'
  const [meta, setMeta] = useState<Meta | null>(null)
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null)
  const [info, setInfo] = useState<{ approval: string; approvalNote: string; active: boolean; hasVariants: boolean } | null>(null)
  const [allFields, setAllFields] = useState<Field[]>([])
  const fields = useMemo(() => allFields.filter((field) => !field.variant), [allFields])
  const variantFields = useMemo(() => allFields.filter((field) => field.variant), [allFields])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { fetch('/api/seller/products?meta=1').then((r) => r.json()).then(setMeta).catch(() => undefined) }, [])
  useEffect(() => {
    if (isNew) return
    fetch(`/api/seller/products?id=${id}`, { cache: 'no-store' }).then(async (r) => {
      const row = await r.json()
      if (!r.ok) { setNotice({ ok: false, text: row?.error || 'محصول پیدا نشد' }); return }
      setInfo({ approval: row.approval, approvalNote: row.approvalNote, active: row.active, hasVariants: row.variants.length > 0 })
      setForm({
        name: row.name, nameEn: row.nameEn, slug: row.slug, categoryId: row.categoryId ? String(row.categoryId) : '', brandId: row.brandId ? String(row.brandId) : '', kind: row.kind,
        price: String(row.price), compareAtPrice: row.compareAtPrice === '' ? '' : String(row.compareAtPrice), stock: row.stock < 0 ? '' : String(row.stock), sku: row.sku,
        image: row.image, gallery: row.gallery, shortDescription: row.shortDescription, description: toText(row.description), weightGrams: row.weightGrams ? String(row.weightGrams) : '',
        warranty: row.warranty, maxPerOrder: row.maxPerOrder ? String(row.maxPerOrder) : '', specifications: row.specifications || {},
        variants: (row.variants || []).map((v: { id: number; sku: string; name: string; attributes: Record<string, string>; price: number; compareAt: number | ''; stock: number; active: boolean }) => ({ id: v.id, sku: v.sku, name: v.name, attributes: v.attributes || {}, price: String(v.price), compareAt: v.compareAt === '' ? '' : String(v.compareAt), stock: v.stock < 0 ? '' : String(v.stock), active: v.active })),
      })
    }).catch(() => setNotice({ ok: false, text: 'بارگذاری نشد' }))
  }, [id, isNew])
  useEffect(() => {
    if (!form?.categoryId) { setAllFields([]); return }
    fetch(`/api/seller/products?categoryId=${form.categoryId}`).then((r) => r.json()).then((data) => setAllFields(data.fields || [])).catch(() => setAllFields([]))
  }, [form?.categoryId])

  const categories = useMemo(() => {
    const rows = meta?.categories || []
    const children = (parent: number | null, depth: number): { id: number; label: string }[] => rows.filter((row) => row.parentId === parent).flatMap((row) => [{ id: row.id, label: `${'— '.repeat(depth)}${row.name}` }, ...children(row.id, depth + 1)])
    return children(null, 0)
  }, [meta])

  if (!form) return notice ? <p className="sa-notice is-error">{notice.text}</p> : <div className="sa-skeleton" aria-busy="true" />
  const set = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current))
  const discount = Number(form.compareAtPrice) > Number(form.price) && Number(form.price) > 0 ? Math.round((1 - Number(form.price) / Number(form.compareAtPrice)) * 100) : 0

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setBusy(true); setNotice(null)
    const specifications = Object.fromEntries(Object.entries(form.specifications).filter(([key, value]) => value && fields.some((field) => field.key === key)))
    // Variants: each combination with its own price and stock (empty stock = unlimited).
    const variants = form.variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, attributes: v.attributes, price: v.price, compareAtPrice: v.compareAt, stock: v.stock === '' ? -1 : Number(v.stock), active: v.active }))
    const payload = { ...form, variants, id: isNew ? undefined : Number(id), description: toHtml(form.description), specifications, brandId: form.brandId || null, categoryId: form.categoryId || null }
    if (isNew) delete (payload as Partial<typeof payload>).slug
    const result = await call<{ id: number; approval: string }>('/api/seller/products', isNew ? 'POST' : 'PUT', payload)
    setBusy(false)
    if (!result.ok) { setNotice({ ok: false, text: result.error }); return }
    if (isNew) { router.replace(`/seller/products/${result.data.id}?saved=1`); return }
    setInfo((current) => (current ? { ...current, approval: result.data.approval } : current))
    setNotice({ ok: true, text: result.data.approval === 'PENDING' ? 'ذخیره شد و برای بررسی به مدیر فرستاده شد.' : 'تغییرات ذخیره شد.' })
  }

  return <form className="sa sl-editor" onSubmit={save}>
    <header className="sa-head"><div><Link href="/seller/products" className="sa-back">→ محصولات من</Link><h1>{isNew ? 'افزودن محصول' : form.name}</h1></div>
      <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : isNew ? 'ثبت و ارسال برای بررسی' : 'ذخیرهٔ تغییرات'}</button></div></header>
    {info?.approval === 'PENDING' && <p className="sa-notice is-info">این محصول در صف بررسی مدیر است و پس از تأیید منتشر می‌شود.</p>}
    {info?.approval === 'REJECTED' && <p className="sa-notice is-error">این محصول رد شد{info.approvalNote ? `: ${info.approvalNote}` : ''}. پس از اصلاح و ذخیره دوباره بررسی می‌شود.</p>}
    {notice && <p className={`sa-notice ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">{notice.text}</p>}

    <div className="sa-editor">
      <div className="sa-stack">
        <section className="sa-card sa-form"><header className="sa-card-head"><h2>اطلاعات اصلی</h2></header>
          <label className="sa-field"><span>عنوان محصول *</span><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} required maxLength={200} placeholder="گوشی موبایل سامسونگ مدل Galaxy A55 ظرفیت ۲۵۶ گیگابایت" /></label>
          <div className="sa-cols">
            <label className="sa-field"><span>عنوان انگلیسی</span><input className="input" dir="ltr" value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} /></label>
            <label className="sa-field"><span>نوع کالا</span><select className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value })}><option value="PHYSICAL">کالای فیزیکی (ارسال پستی)</option><option value="VIRTUAL">کالای مجازی (کد، لایسنس، فایل)</option></select></label>
            <label className="sa-field"><span>دسته‌بندی *</span><select className="select" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value, specifications: {}, variants: [] })} required><option value="">انتخاب کنید…</option>{categories.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
            <label className="sa-field"><span>برند</span><select className="select" value={form.brandId} onChange={(e) => set({ brandId: e.target.value })}><option value="">بدون برند / متفرقه</option>{meta?.brands.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          </div>
          <label className="sa-field"><span>خلاصهٔ ویژگی‌ها (زیر عنوان)</span><textarea className="textarea" rows={2} value={form.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} maxLength={600} /></label>
          <label className="sa-field"><span>توضیحات کامل</span><textarea className="textarea" rows={8} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="هر پاراگراف را با یک خط خالی جدا کنید." /></label>
        </section>

        <section className="sa-card sa-form"><header className="sa-card-head"><h2>تصاویر</h2></header>
          <Images image={form.image} gallery={form.gallery} onChange={(image, gallery) => set({ image, gallery })} />
        </section>

        {fields.length > 0 && <section className="sa-card sa-form"><header className="sa-card-head"><h2>مشخصات فنی</h2><small className="sa-sub">طبق دستهٔ انتخاب‌شده</small></header>
          <div className="sa-cols">{fields.map((field) => <label key={field.key} className="sa-field"><span>{field.label}{field.required ? ' *' : ''}</span>
            {field.kind === 'text' || !field.options.length
              ? <input className="input" value={form.specifications[field.key] || ''} onChange={(e) => set({ specifications: { ...form.specifications, [field.key]: e.target.value } })} required={field.required} maxLength={500} />
              : <select className="select" value={form.specifications[field.key] || ''} onChange={(e) => set({ specifications: { ...form.specifications, [field.key]: e.target.value } })} required={field.required}><option value="">—</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
          </label>)}</div>
        </section>}

        {form.categoryId && <section className="sa-card sa-form"><header className="sa-card-head"><h2>تنوع‌ها</h2><small className="sa-sub">رنگ، سایز، ظرفیت… با قیمت و موجودی جدا</small></header>
          <Variants key={`${form.categoryId}:${variantFields.length}`} fields={variantFields} rows={form.variants} basePrice={form.price} onChange={(variants) => set({ variants })} />
        </section>}
      </div>

      <aside className="sa-editor-side sa-stack">
        <section className="sa-card sa-form"><header className="sa-card-head"><h2>قیمت و موجودی</h2></header>
          <label className="sa-field"><span>قیمت فروش (تومان) *</span><input className="input" dir="ltr" inputMode="numeric" value={form.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, '') })} required /></label>
          <label className="sa-field"><span>قیمت قبل از تخفیف (اختیاری)</span><input className="input" dir="ltr" inputMode="numeric" value={form.compareAtPrice} onChange={(e) => set({ compareAtPrice: e.target.value.replace(/[^\d]/g, '') })} />{discount > 0 && <small className="sa-sub">{discount.toLocaleString('fa-IR')}٪ تخفیف نمایش داده می‌شود</small>}</label>
          <label className="sa-field"><span>موجودی انبار</span><input className="input" dir="ltr" inputMode="numeric" value={form.stock} onChange={(e) => set({ stock: e.target.value.replace(/[^\d]/g, '') })} placeholder="خالی = نامحدود" disabled={form.variants.length > 0} />{form.variants.length > 0 && <small className="sa-sub">موجودی هر تنوع جداگانه تعیین می‌شود.</small>}</label>
          <label className="sa-field"><span>حداکثر تعداد در هر سفارش</span><input className="input" dir="ltr" inputMode="numeric" value={form.maxPerOrder} onChange={(e) => set({ maxPerOrder: e.target.value.replace(/[^\d]/g, '') })} placeholder="بدون محدودیت" /></label>
          <label className="sa-field"><span>کد کالا (SKU)</span><input className="input" dir="ltr" value={form.sku} onChange={(e) => set({ sku: e.target.value })} /></label>
        </section>
        <section className="sa-card sa-form"><header className="sa-card-head"><h2>ارسال و گارانتی</h2></header>
          {form.kind === 'PHYSICAL' && <label className="sa-field"><span>وزن با بسته‌بندی (گرم)</span><input className="input" dir="ltr" inputMode="numeric" value={form.weightGrams} onChange={(e) => set({ weightGrams: e.target.value.replace(/[^\d]/g, '') })} /><small className="sa-sub">برای محاسبهٔ هزینهٔ ارسال لازم است.</small></label>}
          <label className="sa-field"><span>گارانتی</span><input className="input" value={form.warranty} onChange={(e) => set({ warranty: e.target.value })} placeholder="گارانتی ۱۸ ماههٔ …" maxLength={160} /></label>
        </section>
      </aside>
    </div>
  </form>
}
