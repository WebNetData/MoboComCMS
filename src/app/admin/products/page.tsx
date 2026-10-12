'use client'

import { useEffect, useState } from 'react'
import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'
import ProductExtrasEditor from './ProductExtrasEditor'
import ProductRelationshipsEditor from './ProductRelationshipsEditor'
import ProductBundlesEditor from './ProductBundlesEditor'

export default function AdminProductsPage() {
  const { t, locale } = useI18n()
  const [cats, setCats] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/admin/cms?type=productcats').then((r) => (r.ok ? r.json() : [])).then(setCats)
  }, [])

  const fields: FieldDef[] = [
    { key: 'slug', label: t.slug, required: true, dir: 'ltr' },
    { key: 'name', label: t.title, required: true },
    { key: 'nameEn', label: t.englishTitle, dir: 'ltr' },
    { key: 'description', label: t.description, type: 'richtext', hideInTable: true },
    { key: 'kind', label: locale === 'fa' ? 'نوع محصول' : 'Product type', type: 'select', options: [{ value: 'VIRTUAL', label: 'Virtual / مجازی' }, { value: 'PHYSICAL', label: 'Physical / فیزیکی' }] },
    { key: 'price', label: t.price, type: 'number', required: true },
    { key: 'currency', label: t.currency, type: 'select', options: [{ value: 'IRR', label: locale === 'fa' ? 'ریال (IRR)' : 'Rial (IRR)' }, { value: 'IRT', label: locale === 'fa' ? 'تومان (IRT)' : 'Toman (IRT)' }, { value: 'USD', label: locale === 'fa' ? 'دلار (USD)' : 'US dollar (USD)' }] },
    { key: 'stock', label: `${t.stock} (-1 = ${t.unlimited})`, type: 'number' },
    { key: 'image', label: t.cover, dir: 'ltr', hideInTable: true },
    {
      key: 'categoryId',
      label: t.category,
      type: 'select',
      options: [{ value: '', label: '—' }, ...cats.map((c) => ({ value: String(c.id), label: c.name }))],
    },
    { key: 'access', label: locale === 'fa' ? 'دسترسی' : 'Access', type: 'select', options: [{ value: 'PUBLIC', label: locale === 'fa' ? 'همه' : 'Everyone' }, { value: 'MEMBERS', label: locale === 'fa' ? 'فقط اعضای ویژه (VIP)' : 'VIP members only' }] },
    { key: 'memberPrice', label: locale === 'fa' ? 'قیمت ویژهٔ اعضای VIP (اختیاری)' : 'VIP member price (optional)', type: 'number', hideInTable: true },
    { key: 'vipGiftDays', label: locale === 'fa' ? 'روز VIP هدیه با خرید' : 'VIP gift days with purchase', type: 'number', hideInTable: true },
    { key: 'active', label: t.active, type: 'checkbox' },
    { key: 'featured', label: t.special, type: 'checkbox' },
    { key: 'sortOrder', label: t.sortOrder, type: 'number', hideInTable: true },
  ]

  return (
    <AdminCrud
      type="products"
      fields={fields}
      extraRows={(row) => ({ categoryId: row.category?.name || '—' })}
      editorExtraKeys={['specifications', 'variants', 'faqs', 'gallery', 'relationships', 'bundles']}
      renderEditorExtra={(form, setForm, editId) => <><ProductExtrasEditor form={form} setForm={setForm} categories={cats} /><ProductRelationshipsEditor form={form} setForm={setForm} sourceId={editId} /><ProductBundlesEditor form={form} setForm={setForm} sourceId={editId} /></>}
    />
  )
}
