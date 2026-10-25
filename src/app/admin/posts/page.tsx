'use client'

import { useEffect, useState } from 'react'
import AdminCrud, { type FieldDef, type ListFilter } from '../cms/AdminCrud'
import { JournalShell } from '../journal/shared'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { categoryOptions, postCategories } from '@/modules/site/domain/categories'
import { useI18n } from '@/i18n/LocaleProvider'
import AiWritingAssistant from './AiWritingAssistant'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'
import PostItemLinks from './PostItemLinks'

export default function AdminPostsPage() {
  const { t, locale } = useI18n()
  const [cats, setCats] = useState<any[]>([])
  const vipOn = useModuleEnabled('membership')

  useEffect(() => {
    fetch('/api/admin/cms?type=postcats').then((r) => (r.ok ? r.json() : [])).then(setCats)
  }, [])

  const S = {
    body: locale === 'fa' ? 'متن نوشته' : 'Article',
    cover: locale === 'fa' ? 'تصویر شاخص' : 'Featured image',
    cats: locale === 'fa' ? 'دسته‌بندی' : 'Categories',
    publish: locale === 'fa' ? 'انتشار و دسترسی' : 'Publishing & access',
  }
  const fields: FieldDef[] = [
    { section: S.body, key: 'title', label: t.title, required: true, wide: true },
    { section: S.body, key: 'slug', label: t.slug, required: true, dir: 'ltr', wide: true },
    { section: S.body, key: 'excerpt', label: t.excerpt, type: 'textarea', hideInTable: true },
    { section: S.body, key: 'content', label: t.content, type: 'richtext', hideInTable: true },
    { section: S.cover, key: 'cover', label: t.cover, type: 'image', hideInTable: true },
    {
      section: S.cats, key: 'categoryIds',
      label: locale === 'fa' ? 'دسته‌بندی‌ها' : 'Categories',
      type: 'multiselect',
      options: categoryOptions(cats, locale),
    },
    {
      section: S.publish, key: 'status',
      label: t.status,
      type: 'select',
      options: [
        { value: 'PUBLISHED', label: t.published },
        { value: 'DRAFT', label: t.draft },
      ],
    },
    { section: S.publish, key: 'publishedAt', label: locale === 'fa' ? 'زمان انتشار (خالی = اکنون، به وقت دستگاه شما)' : 'Publication time (blank = now, your local time)', type: 'datetime-local', hideInTable: true },
    { section: S.publish, key: 'featured', label: t.special, type: 'checkbox' },
    { section: S.publish, key: 'access', label: locale === 'fa' ? 'دسترسی' : 'Access', type: 'select', options: [{ value: 'PUBLIC', label: locale === 'fa' ? 'همه' : 'Everyone' }, { value: 'MEMBERS', label: locale === 'fa' ? 'فقط اعضای ویژه (VIP)' : 'VIP members only' }] },
  ]

  const L = (persian: string, english: string) => (locale === 'fa' ? persian : english)
  const filters: ListFilter[] = [
    { key: 'state', label: L('وضعیت', 'State'), options: [{ value: 'live', label: L('منتشرشده', 'Live') }, { value: 'scheduled', label: L('زمان‌بندی‌شده', 'Scheduled') }, { value: 'draft', label: L('پیش‌نویس', 'Draft') }, { value: 'trashed', label: L('سطل زباله', 'Trash') }] },
    { key: 'category', label: L('دسته', 'Category'), options: categoryOptions(cats, locale) },
    { key: 'featured', label: L('ویژه', 'Featured'), options: [{ value: '1', label: L('فقط ویژه‌ها', 'Featured only') }, { value: '0', label: L('غیرویژه', 'Not featured') }] },
    ...(vipOn ? [{ key: 'access', label: L('دسترسی', 'Access'), options: [{ value: 'PUBLIC', label: L('عمومی', 'Public') }, { value: 'MEMBERS', label: L('فقط VIP', 'VIP only') }] }] : []),
  ]

  return (
    <JournalShell>
    <AdminCrud
      type="posts"
      fields={fields}
      filters={filters}
      thumbnailKey="cover"
      aside={[S.publish, S.cats, S.cover]}
      editorExtraKeys={['itemLinks']}
      renderEditorExtra={(form, setForm, editId) => <><PostItemLinks form={form} setForm={setForm} /><AiWritingAssistant form={form} setForm={setForm} /><PaidAccessPanel ownerType="post" ownerId={editId} noun="این مقاله" /></>}
      extraRows={(row) => ({
        categoryIds: postCategories<any>(row).map(c => locale === 'fa' ? c.name : c.nameEn || c.name).join('، ') || '—',
        author: row.author?.name || row.author?.email || '—',
      })}
    />
    </JournalShell>
  )
}
