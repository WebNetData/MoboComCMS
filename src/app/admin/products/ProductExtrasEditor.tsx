'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

type Attribute = { key: string; label: string; labelEn: string; kind: 'text' | 'select' | 'color'; options: string[]; required: boolean; variant?: boolean }
type Category = { id: number; parentId?: number | null; attributeGroup?: { fields: string; name: string } | null }

function parsed<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value ?? fallback) as T
  try { return JSON.parse(value) as T } catch { return fallback }
}

export default function ProductExtrasEditor({ form, setForm, categories }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>>; categories: Category[] }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  let selected = categories.find(c => c.id === Number(form.categoryId))
  const visited = new Set<number>()
  while (selected && !selected.attributeGroup && selected.parentId && !visited.has(selected.id)) { visited.add(selected.id); selected = categories.find(c => c.id === selected!.parentId) }
  const group = selected?.attributeGroup
  const fields = parsed<Attribute[]>(group?.fields, [])
  const specs = parsed<Record<string, string>>(form.specifications, {})
  const faqs = parsed<any[]>(form.faqs, [])
  const variants = parsed<any[]>(form.variants, [])
  const gallery = parsed<string[]>(form.gallery, [])
  const update = (key: string, value: unknown) => setForm(old => ({ ...old, [key]: value }))

  return <>
    <div className="grid-column-span-3 store-admin-section"><div className="flex justify-between items-center gap-2"><h2>{fa ? 'گالری تصاویر' : 'Product gallery'}</h2><button type="button" className="btn btn-ghost" onClick={() => update('gallery', [...gallery, ''])}>+ {fa ? 'تصویر' : 'Image'}</button></div><p className="muted text-sm">{fa ? 'لینک تصویرهای بیشتر را وارد کنید. تصویر اصلی در فیلد بالای فرم قرار دارد.' : 'Add more image URLs. The primary image is configured above.'}</p>{gallery.map((url, index) => <div className="flex gap-2 items-center mt-3" key={index}><input className="input" dir="ltr" value={url} onChange={e => update('gallery', gallery.map((item, i) => i === index ? e.target.value : item))} placeholder="https://…" /><button type="button" className="btn btn-ghost" onClick={() => update('gallery', gallery.filter((_, i) => i !== index))}>{fa ? 'حذف' : 'Remove'}</button></div>)}</div>
    <div className="grid-column-span-3 store-admin-section">
      <h2>{fa ? 'مشخصات محصول' : 'Product specifications'}</h2>
      <p className="muted text-sm">{group ? `${fa ? 'گروه:' : 'Group:'} ${group.name}` : fa ? 'برای نمایش مشخصات، دسته‌ای با گروه مشخصات انتخاب کنید.' : 'Select a category with an attribute group to edit specifications.'}</p>
      <div className="store-admin-grid">{fields.filter(field => !field.variant).map(field => <label key={field.key} className="store-admin-field"><span>{fa ? field.label : field.labelEn || field.label}{field.required ? ' *' : ''}</span>{field.kind === 'text' ? <input className="input" value={specs[field.key] || ''} onChange={e => update('specifications', { ...specs, [field.key]: e.target.value })} required={field.required} /> : <select className="select" value={specs[field.key] || ''} onChange={e => update('specifications', { ...specs, [field.key]: e.target.value })} required={field.required}><option value="">—</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>}</label>)}</div>
    </div>
    <div className="grid-column-span-3 store-admin-section">
      <div className="flex justify-between items-center gap-2"><h2>{fa ? 'گونه‌های قابل خرید' : 'Purchasable variants'}</h2><button type="button" className="btn btn-ghost" onClick={() => update('variants', [...variants, { sku: '', name: '', nameEn: '', price: form.price || 0, stock: -1, attributes: {} }])}>+ {fa ? 'گونه' : 'Variant'}</button></div>
      <p className="muted text-sm">{fa ? 'برای رنگ، نوع اکانت یا ظرفیتِ دارای قیمت و موجودی جدا گونه بسازید. اگر گونه‌ای نساختید، قیمت اصلی محصول استفاده می‌شود.' : 'Add variants for color, account type, or capacity when they need separate prices or stock. Without variants, the base price applies.'}</p>
      {variants.map((variant, index) => <div className="store-admin-variant" key={variant.id || index}>
        <div className="store-admin-grid">
          {([['sku', 'SKU'], ['name', fa ? 'نام گونه' : 'Variant name'], ['nameEn', 'English name'], ['price', fa ? 'قیمت' : 'Price'], ['memberPrice', fa ? 'قیمت VIP' : 'VIP price'], ['stock', fa ? 'موجودی (-۱ نامحدود)' : 'Stock (-1 unlimited)']] as const).map(([key, label]) => <label key={key} className="store-admin-field"><span>{label}</span><input className="input" type={key === 'price' || key === 'memberPrice' || key === 'stock' ? 'number' : 'text'} step={key === 'price' || key === 'memberPrice' ? '.01' : undefined} value={variant[key] ?? ''} onChange={e => update('variants', variants.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v))} /></label>)}
          {fields.filter(field => field.variant).map(field => <label key={field.key} className="store-admin-field"><span>{fa ? field.label : field.labelEn || field.label}</span>{field.kind === 'text' ? <input className="input" value={parsed<Record<string, string>>(variant.attributes, {})[field.key] || ''} onChange={e => update('variants', variants.map((v, i) => i === index ? { ...v, attributes: { ...parsed<Record<string, string>>(v.attributes, {}), [field.key]: e.target.value } } : v))} /> : <select className="select" value={parsed<Record<string, string>>(variant.attributes, {})[field.key] || ''} onChange={e => update('variants', variants.map((v, i) => i === index ? { ...v, attributes: { ...parsed<Record<string, string>>(v.attributes, {}), [field.key]: e.target.value } } : v))}><option value="">—</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>}</label>)}
        </div><button type="button" className="btn btn-ghost" onClick={() => update('variants', variants.filter((_, i) => i !== index))}>{fa ? 'حذف گونه' : 'Remove variant'}</button>
      </div>)}
    </div>
    <div className="grid-column-span-3 store-admin-section">
      <div className="flex justify-between items-center gap-2"><h2>{fa ? 'پرسش‌های متداول' : 'Frequently asked questions'}</h2><button type="button" className="btn btn-ghost" onClick={() => update('faqs', [...faqs, { question: '', answer: '', questionEn: '', answerEn: '' }])}>+ {fa ? 'پرسش' : 'Question'}</button></div>
      {faqs.map((faq, index) => <div className="store-admin-variant" key={index}><div className="store-admin-grid">{([['question', 'پرسش'], ['answer', 'پاسخ'], ['questionEn', 'Question EN'], ['answerEn', 'Answer EN']] as const).map(([key, label]) => <label key={key} className="store-admin-field"><span>{label}</span><textarea className="textarea" rows={key.startsWith('answer') ? 3 : 2} value={faq[key] || ''} onChange={e => update('faqs', faqs.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v))} /></label>)}</div><button type="button" className="btn btn-ghost" onClick={() => update('faqs', faqs.filter((_, i) => i !== index))}>{fa ? 'حذف' : 'Remove'}</button></div>)}
    </div>
  </>
}
