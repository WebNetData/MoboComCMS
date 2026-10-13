'use client'

import dynamic from 'next/dynamic'
import Link from '@/components/AppLink'
import { useParams, useRouter } from '@/platform/routing/navigation'
import { useEffect, useMemo, useState } from 'react'
import CoverField from '../../../cms/CoverField'
import ProductExtrasEditor from '../../../products/ProductExtrasEditor'
import { Notice, StoreShell, fa, send } from '../../shared'
import AiAutofill from '../../../cms/AiAutofill'
import FxPricing from '../FxPricing'
import PublishReview, { previewValue, type ReviewRow } from '../../../cms/PublishReview'
import type { AutofillField } from '@/modules/ai/domain/autofill'
import ProductCodes from './Codes'
import OrderAsk from '../OrderAsk'

const RichEditor = dynamic(() => import('@/components/editor/ContentEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

type Category = { id: number; name: string; parentId: number | null; attributeGroup?: { fields: string; name: string } | null }
type Brand = { id: number; name: string }
type Form = Record<string, any>

const EMPTY: Form = {
  name: '', nameEn: '', slug: '', kind: 'PHYSICAL', price: '', compareAtPrice: '', saleEndsAt: '', currency: 'IRT', stock: -1, sku: '', lowStockAt: 0, maxPerOrder: 0,
  weightGrams: 0, warranty: '', shortDescription: '', description: '', descriptionEn: '', image: '', gallery: [], categoryId: '', brandId: '', access: 'PUBLIC',
  memberPrice: '', vipGiftDays: 0, active: true, featured: false, sortOrder: 0, seoTitle: '', seoDescription: '', specifications: {}, variants: [], faqs: [],
  pricingMode: 'FIXED', fxCurrency: 'USD', fxAmount: '', fxCompareAt: '', fxMemberPrice: '', markupPercent: '', markupFixed: '',
  orderFields: [], openAmount: false, openCurrencies: '', openMin: '', openMax: '',
}

const REVIEW_FIELDS: [string, string, boolean?][] = [['name', 'نام محصول', true], ['nameEn', 'نام انگلیسی'], ['slug', 'نامک'], ['categoryId', 'دسته', true], ['brandId', 'برند'], ['price', 'قیمت', true], ['compareAtPrice', 'قیمت قبل از تخفیف'], ['stock', 'موجودی'], ['image', 'تصویر اصلی', true], ['shortDescription', 'توضیح کوتاه'], ['description', 'توضیحات'], ['warranty', 'گارانتی'], ['faqs', 'پرسش‌های متداول'], ['seoTitle', 'عنوان سئو'], ['seoDescription', 'توضیح متا']]

const SECTIONS = [['general', 'اطلاعات اصلی'], ['pricing', 'قیمت و تخفیف'], ['inventory', 'انبار و ارسال'], ['ask', 'اطلاعات خریدار'], ['media', 'تصاویر'], ['attributes', 'مشخصات و تنوع'], ['seo', 'سئو']] as const

const localInput = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function ProductEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null)
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [aiValues, setAiValues] = useState<Form>({})
  const [review, setReview] = useState(false)
  const [originalActive, setOriginalActive] = useState<boolean | null>(isNew ? null : true)
  // A product that delivers codes takes its stock from its code shelf; the stock field is then read-only.
  const [codesOn, setCodesOn] = useState(false)

  useEffect(() => {
    fetch('/api/admin/cms?type=productcats').then((r) => (r.ok ? r.json() : [])).then(setCategories).catch(() => {})
    fetch('/api/admin/store/brands').then((r) => (r.ok ? r.json() : { brands: [] })).then((body) => setBrands(body.brands || [])).catch(() => {})
    if (isNew) return
    fetch(`/api/admin/cms?type=products&id=${encodeURIComponent(id)}`).then(async (response) => {
      const rows = await response.json().catch(() => [])
      const row = Array.isArray(rows) ? rows[0] : null
      if (!row) { setError('محصول پیدا نشد'); return }
      setOriginalActive(row.active !== false)
      setCodesOn(row.digitalMode === 'CODES')
      setForm({ ...EMPTY, ...row, categoryId: row.categoryId ? String(row.categoryId) : '', brandId: row.brandId ? String(row.brandId) : '', saleEndsAt: localInput(row.saleEndsAt), description: row.description || '', descriptionEn: row.descriptionEn || '' })
    }).catch(() => setError('بارگذاری محصول انجام نشد'))
  }, [id, isNew])

  const update = (key: string, value: unknown) => setForm((current) => (current ? { ...current, [key]: value } : current))
  const discount = useMemo(() => {
    const price = Number(form?.price) || 0
    const list = Number(form?.compareAtPrice) || 0
    return list > price && price > 0 ? Math.floor(((list - price) / list) * 100) : 0
  }, [form?.price, form?.compareAtPrice])

  if (!form) return <StoreShell title="ویرایش محصول">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</StoreShell>

  const categoryOptions = categories.map((category) => ({ value: String(category.id), label: category.name }))
  const brandOptions = brands.map((brand) => ({ value: String(brand.id), label: brand.name }))
  // The assistant fills descriptive fields only; price, stock and images stay with the editor.
  const aiFields: AutofillField[] = [
    { key: 'name', label: 'نام فارسی محصول', type: 'text' },
    { key: 'nameEn', label: 'نام انگلیسی محصول', type: 'text', dir: 'ltr' },
    { key: 'slug', label: 'نامک', type: 'slug' },
    ...(categoryOptions.length ? [{ key: 'categoryId', label: 'دسته', type: 'select' as const, options: categoryOptions }] : []),
    ...(brandOptions.length ? [{ key: 'brandId', label: 'برند', type: 'select' as const, options: brandOptions }] : []),
    { key: 'shortDescription', label: 'توضیح کوتاه (یک تا دو جمله)', type: 'textarea' },
    { key: 'description', label: 'توضیحات کامل و فروش‌محور با تیترهای فرعی', type: 'richtext' },
    { key: 'warranty', label: 'گارانتی (در صورت ذکر در منبع)', type: 'text' },
    { key: 'weightGrams', label: 'وزن به گرم (در صورت ذکر در منبع)', type: 'number' },
    { key: 'faqs', label: 'پرسش‌های متداول خریداران', type: 'records', recordKeys: [{ key: 'question', label: 'پرسش' }, { key: 'answer', label: 'پاسخ' }] },
    { key: 'seoTitle', label: 'عنوان سئو (حداکثر ۶۰ نویسه)', type: 'text' },
    { key: 'seoDescription', label: 'توضیح متا (حداکثر ۱۶۰ نویسه)', type: 'textarea' },
  ]
  const isAi = (key: string) => key in aiValues && JSON.stringify(form[key]) === JSON.stringify(aiValues[key])
  const aiUsed = Object.keys(aiValues).some(isAi)
  const applyAi = (values: Form, filled: string[]) => {
    setSaved('')
    const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key === 'weightGrams' ? Number(value) || 0 : value]))
    setForm((current) => (current ? { ...current, ...next } : current))
    setAiValues((current) => { const out = { ...current }; for (const key of Object.keys(next)) { if (filled.includes(key)) out[key] = next[key]; else delete out[key] } return out })
  }
  // A new product, one switched to active, or AI-written copy is reviewed before it goes on sale.
  const needsReview = form.active !== false && (isNew || originalActive === false || aiUsed)
  const reviewRows: ReviewRow[] = REVIEW_FIELDS.map(([key, label, required]) => {
    const options = key === 'categoryId' ? categoryOptions : key === 'brandId' ? brandOptions : undefined
    const fxPrice = key === 'price' && form.pricingMode === 'FX' ? (form.fxAmount ? `${form.fxAmount} ${form.fxCurrency || 'USD'}${Number(form.markupPercent) ? ` + ${form.markupPercent}٪` : ''}${Number(form.markupFixed) ? ` + ${Number(form.markupFixed).toLocaleString('fa-IR')}` : ''} (نرخ روز)` : '') : null
    const value = fxPrice !== null ? fxPrice : key === 'stock' ? (Number(form.stock) < 0 ? 'نامحدود' : previewValue(String(form.stock))) : previewValue(form[key], options)
    return { key, label, value, state: !value && required ? 'missing' : isAi(key) ? 'ai' : value ? 'ok' : 'empty' }
  })
  const requestSave = () => { if (needsReview) setReview(true); else void save() }

  async function save() {
    if (!form) return
    setReview(false)
    setBusy(true); setError(''); setSaved('')
    const payload: Form = {
      ...form,
      slug: String(form.slug || '').trim() || `p-${Date.now().toString(36)}`,
      price: String(form.price), compareAtPrice: form.compareAtPrice === '' ? '' : String(form.compareAtPrice),
      saleEndsAt: form.saleEndsAt ? new Date(form.saleEndsAt).toISOString() : '',
      categoryId: form.categoryId ? Number(form.categoryId) : null, brandId: form.brandId ? Number(form.brandId) : null,
      stock: Number(form.stock), lowStockAt: Number(form.lowStockAt) || 0, maxPerOrder: Number(form.maxPerOrder) || 0, weightGrams: Number(form.weightGrams) || 0, sortOrder: Number(form.sortOrder) || 0,
      variants: (Array.isArray(form.variants) ? form.variants : []).map((variant: Form) => ({ ...variant, price: Number(variant.price), stock: Number(variant.stock) })),
    }
    for (const key of ['id', 'createdAt', 'updatedAt', 'category', 'priceMinor', 'views', 'soldCount', 'brand', 'repricedAt']) delete payload[key]
    // A foreign-currency product gets its prices from the server (cost × live rate + profit).
    if (payload.pricingMode !== 'FX') payload.openAmount = false
    if (payload.pricingMode !== 'FX') for (const key of ['fxCurrency', 'fxAmount', 'fxCompareAt', 'fxMemberPrice', 'markupPercent', 'markupFixed']) delete payload[key]
    const response = await send<{ id: number }>(`/api/admin/cms?type=products`, isNew ? 'POST' : 'PATCH', isNew ? payload : { ...payload, id: Number(id) })
    setBusy(false)
    if (!response.ok) { setError(response.error); return }
    if (isNew) { router.replace(`/admin/store/products/${response.data.id}?created=1`); return }
    setOriginalActive(form.active !== false)
    setAiValues({})
    setSaved('تغییرات ذخیره شد')
  }

  const field = (key: string, label: string, props: Record<string, unknown> = {}) => <label className="sa-field"><span>{label}</span><input className="input" value={form[key] ?? ''} onChange={(event) => update(key, event.target.value)} {...props} /></label>

  return <StoreShell title={isNew ? 'افزودن محصول' : form.name || 'ویرایش محصول'} actions={<>
    {!isNew && <a href={`/products/${form.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهده در فروشگاه</a>}
    <button type="button" className="btn btn-primary" disabled={busy || uploading} onClick={requestSave}>{busy ? 'در حال ذخیره…' : needsReview ? 'بازبینی و انتشار' : 'ذخیرهٔ تغییرات'}</button>
  </>}>
    <Link href="/admin/store/products" className="sa-link sa-back">بازگشت به محصولات</Link>
    {error && <Notice tone="error">{error}</Notice>}
    {saved && <Notice tone="ok">{saved}</Notice>}
    <AiAutofill section="products" fields={aiFields} form={form} onApply={applyAi} />
    <PublishReview open={review} title={form.name} rows={reviewRows} busy={busy} onCancel={() => setReview(false)} onConfirm={() => void save()} />
    <nav className="sa-jump" aria-label="بخش‌های فرم">{SECTIONS.map(([key, label]) => <a key={key} href={`#sa-${key}`}>{label}</a>)}</nav>
    <form className="sa-editor" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="sa-stack">
        <section id="sa-general" className="sa-card">
          <header className="sa-card-head"><h2>اطلاعات اصلی</h2></header>
          <div className="sa-grid">
            {field('name', 'نام محصول *', { required: true, maxLength: 200 })}
            {field('nameEn', 'نام انگلیسی', { dir: 'ltr' })}
            {field('slug', 'نامک (آدرس صفحه)', { dir: 'ltr', placeholder: 'galaxy-a55' })}
            <label className="sa-field"><span>نوع محصول</span><select className="select" value={form.kind} onChange={(event) => update('kind', event.target.value)}><option value="PHYSICAL">کالای فیزیکی (ارسال با پست/پیک)</option><option value="VIRTUAL">محصول دیجیتال (تحویل آنی)</option></select></label>
          </div>
          <label className="sa-field"><span>معرفی کوتاه (زیر عنوان صفحهٔ محصول و در کارت‌ها)</span><textarea className="input" rows={2} maxLength={600} value={form.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} /><small className="sa-sub num">{fa(String(form.shortDescription || '').length)}/۶۰۰</small></label>
          <div className="sa-field"><span>توضیحات کامل</span><RichEditor value={form.description} onChange={(value: string) => update('description', value)} dir="rtl" /></div>
        </section>

        <section id="sa-pricing" className="sa-card">
          <header className="sa-card-head"><h2>قیمت و تخفیف</h2>{discount > 0 && form.pricingMode !== 'FX' && <span className="sa-tag is-deal">{fa(discount)}٪ تخفیف</span>}</header>
          <div className="px-mode" role="group" aria-label="روش قیمت‌گذاری">
            <button type="button" aria-pressed={form.pricingMode !== 'FX'} onClick={() => update('pricingMode', 'FIXED')}>قیمت ثابت</button>
            <button type="button" aria-pressed={form.pricingMode === 'FX'} onClick={() => setForm((current) => (current ? { ...current, pricingMode: 'FX', currency: current.currency === 'IRR' ? 'IRR' : 'IRT' } : current))}>قیمت ارزی (نرخ روز)</button>
          </div>
          {form.pricingMode === 'FX' ? <FxPricing form={form} update={update} /> : <>
          <div className="sa-grid">
            {field('price', 'قیمت فروش *', { type: 'number', min: 0, step: 'any', required: true })}
            {field('compareAtPrice', 'قیمت قبل از تخفیف (خط‌خورده)', { type: 'number', min: 0, step: 'any' })}
            <label className="sa-field"><span>واحد پول</span><select className="select" value={form.currency} onChange={(event) => update('currency', event.target.value)}><option value="IRT">تومان</option><option value="IRR">ریال</option><option value="USD">دلار</option></select></label>
            <label className="sa-field"><span>پایان پیشنهاد شگفت‌انگیز (شمارش معکوس)</span><input className="input" type="datetime-local" value={form.saleEndsAt} onChange={(event) => update('saleEndsAt', event.target.value)} /></label>
            <span data-vip="" style={{ display: 'contents' }}>{field('memberPrice', 'قیمت ویژهٔ اعضای VIP', { type: 'number', min: 0, step: 'any' })}</span>
            <span data-vip="" style={{ display: 'contents' }}>{field('vipGiftDays', 'روز VIP هدیه با خرید', { type: 'number', min: 0 })}</span>
          </div>
          <p className="sa-hint">قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد. با گذشت زمان پایان پیشنهاد، قیمت خط‌خورده خودکار پنهان می‌شود.</p>
          </>}
        </section>

        <section id="sa-inventory" className="sa-card">
          <header className="sa-card-head"><h2>انبار و ارسال</h2></header>
          <div className="sa-grid">
            {field('sku', 'کد کالا (SKU)', { dir: 'ltr', maxLength: 80 })}
            {codesOn
              ? <label className="sa-field"><span>موجودی</span><input className="input" value={form.stock} readOnly disabled aria-describedby="sa-stock-codes" /><small id="sa-stock-codes" className="sa-sub">برابر با کدهای روی قفسه است (بخش «تحویل خودکار کد»).</small></label>
              : field('stock', 'موجودی (۱- = نامحدود)', { type: 'number', min: -1 })}
            {field('lowStockAt', 'هشدار موجودی کم (۰ = پیش‌فرض فروشگاه)', { type: 'number', min: 0 })}
            {field('maxPerOrder', 'حداکثر تعداد در هر سفارش (۰ = بدون محدودیت)', { type: 'number', min: 0 })}
            {form.kind === 'PHYSICAL' && field('weightGrams', 'وزن بسته (گرم)', { type: 'number', min: 0 })}
            {field('warranty', 'گارانتی / ضمانت', { maxLength: 160, placeholder: 'گارانتی ۱۸ ماهه' })}
          </div>
        </section>

        <OrderAsk form={form} update={update} />

        {!isNew && form.kind === 'VIRTUAL' && <ProductCodes productId={Number(id)} onStock={(stock) => { setCodesOn(stock >= 0); setForm((current) => current && { ...current, stock }) }} />}

        <section id="sa-media" className="sa-card">
          <header className="sa-card-head"><h2>تصاویر</h2></header>
          <div className="sa-field"><span>تصویر اصلی</span><CoverField value={form.image || ''} title={form.name} onChange={(value) => update('image', value)} onBusy={setUploading} /></div>
        </section>

        <section id="sa-attributes" className="sa-card sa-extras">
          <header className="sa-card-head"><h2>گالری، مشخصات، تنوع‌ها و پرسش‌های متداول</h2></header>
          <ProductExtrasEditor form={form} setForm={setForm as never} categories={categories} />
        </section>

        <section id="sa-seo" className="sa-card">
          <header className="sa-card-head"><h2>سئو</h2></header>
          <div className="sa-grid">
            {field('seoTitle', 'عنوان سئو (خالی = نام محصول)', { maxLength: 120 })}
            <label className="sa-field"><span>توضیح متا</span><textarea className="input" rows={2} maxLength={320} value={form.seoDescription} onChange={(event) => update('seoDescription', event.target.value)} /></label>
          </div>
          <div className="sa-serp" aria-label="پیش‌نمایش در نتایج گوگل">
            <small dir="ltr">…/products/{form.slug || 'slug'}</small>
            <b>{form.seoTitle || form.name || 'عنوان محصول'}</b>
            <p>{form.seoDescription || form.shortDescription || 'توضیح متا در نتایج جست‌وجو نمایش داده می‌شود.'}</p>
          </div>
        </section>
      </div>

      <aside className="sa-stack sa-editor-side">
        <section className="sa-card">
          <header className="sa-card-head"><h2>انتشار</h2></header>
          <label className="sa-check"><input type="checkbox" checked={!!form.active} onChange={(event) => update('active', event.target.checked)} />در فروشگاه نمایش داده شود</label>
          <label className="sa-check"><input type="checkbox" checked={!!form.featured} onChange={(event) => update('featured', event.target.checked)} />محصول ویژه</label>
          <label data-vip="" className="sa-field"><span>دسترسی</span><select className="select" value={form.access} onChange={(event) => update('access', event.target.value)}><option value="PUBLIC">همه</option><option value="MEMBERS">فقط اعضای VIP</option></select></label>
          {field('sortOrder', 'ترتیب نمایش', { type: 'number' })}
          <button type="button" className="btn btn-primary w-full" disabled={busy || uploading} onClick={requestSave}>{busy ? 'در حال ذخیره…' : needsReview ? 'بازبینی و انتشار' : 'ذخیره'}</button>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>دسته و برند</h2><Link href="/admin/productcats" className="sa-link">مدیریت دسته‌ها</Link></header>
          <label className="sa-field"><span>دسته‌بندی</span><select className="select" value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">بدون دسته</option>{categories.filter((category) => { const half = (category as { kind?: string }).kind || ''; return !half || half === form.kind || String(category.id) === String(form.categoryId) }).map((category) => <option key={category.id} value={category.id}>{category.parentId ? `— ${category.name}` : category.name}</option>)}</select></label>
          <label className="sa-field"><span>برند</span><select className="select" value={form.brandId} onChange={(event) => update('brandId', event.target.value)}><option value="">بدون برند</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <Link href="/admin/store/brands" className="sa-link">افزودن برند</Link>
        </section>
        {form.image && <section className="sa-card sa-preview"><header className="sa-card-head"><h2>پیش‌نمایش کارت</h2></header><img src={form.image} alt="" /><b>{form.name}</b></section>}
      </aside>
    </form>
  </StoreShell>
}
