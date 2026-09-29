'use client'

import { useEffect, useState } from 'react'
import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { categoryOptions, postCategories } from '@/modules/site/domain/categories'
import { useI18n } from '@/i18n/LocaleProvider'
import AiWritingAssistant from './AiWritingAssistant'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'

export default function AdminPostsPage() {
  const { t, locale } = useI18n()
  const [cats, setCats] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/admin/cms?type=postcats').then((r) => (r.ok ? r.json() : [])).then(setCats)
  }, [])

  const fields: FieldDef[] = [
    { key: 'slug', label: t.slug, required: true, dir: 'ltr' },
    { key: 'title', label: t.title, required: true },
    { key: 'titleEn', label: t.englishTitle, dir: 'ltr' },
    { key: 'excerpt', label: t.excerpt, type: 'textarea', hideInTable: true },
    { key: 'excerptEn', label: `${t.excerpt} EN`, type: 'textarea', hideInTable: true },
    { key: 'content', label: t.content, type: 'richtext', hideInTable: true },
    { key: 'contentEn', label: t.englishContent, type: 'richtext', hideInTable: true, dir: 'ltr' },
    { key: 'cover', label: t.cover, type: 'image', hideInTable: true },
    {
      key: 'categoryIds',
      label: locale === 'fa' ? 'دسته‌بندی‌ها' : 'Categories',
      type: 'multiselect',
      options: categoryOptions(cats, locale),
    },
    {
      key: 'status',
      label: t.status,
      type: 'select',
      options: [
        { value: 'PUBLISHED', label: t.published },
        { value: 'DRAFT', label: t.draft },
      ],
    },
    { key: 'featured', label: t.special, type: 'checkbox' },
    { key: 'access', label: locale === 'fa' ? 'دسترسی' : 'Access', type: 'select', options: [{ value: 'PUBLIC', label: locale === 'fa' ? 'همه' : 'Everyone' }, { value: 'MEMBERS', label: locale === 'fa' ? 'فقط اعضای ویژه (VIP)' : 'VIP members only' }] },
  ]

  return (
    <AdminCrud
      type="posts"
      fields={fields}
      renderEditorExtra={(form, setForm, editId) => <><AiWritingAssistant form={form} setForm={setForm} /><PaidAccessPanel ownerType="post" ownerId={editId} noun="این مقاله" /></>}
      extraRows={(row) => ({
        categoryIds: postCategories<any>(row).map(c => locale === 'fa' ? c.name : c.nameEn || c.name).join('، ') || '—',
        author: row.author?.name || row.author?.email || '—',
      })}
    />
  )
}
