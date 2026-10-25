'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminCrud, { type FieldDef, type ListFilter } from '../cms/AdminCrud'
import { JournalShell } from '../journal/shared'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { categoryOptions, postCategories } from '@/modules/site/domain/categories'
import { useI18n } from '@/i18n/LocaleProvider'
import AiWritingAssistant from './AiWritingAssistant'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'
import PostItemLinks from './PostItemLinks'
import PostReviewPanel from './PostReviewPanel'

type Texts = ReturnType<typeof useI18n>['t']
const say = (locale: string) => (persian: string, english: string) => (locale === 'fa' ? persian : english)
const sectionsOf = (locale: string) => {
  const L = say(locale)
  return { body: L('متن نوشته', 'Article'), cover: L('تصویر شاخص', 'Featured image'), cats: L('دسته‌بندی', 'Categories'), publish: L('انتشار و دسترسی', 'Publishing & access') }
}

/** The article form. An author never features; while the manager reviews authors' articles they draft or send for review. */
function postFields(t: Texts, locale: string, cats: any[], caller: { mine: boolean; authorReview: boolean }): FieldDef[] {
  const L = say(locale), S = sectionsOf(locale)
  return [
    { section: S.body, key: 'title', label: t.title, required: true, wide: true },
    { section: S.body, key: 'slug', label: t.slug, required: true, dir: 'ltr', wide: true },
    { section: S.body, key: 'excerpt', label: t.excerpt, type: 'textarea', hideInTable: true },
    { section: S.body, key: 'content', label: t.content, type: 'richtext', hideInTable: true },
    { section: S.cover, key: 'cover', label: t.cover, type: 'image', hideInTable: true },
    { section: S.cats, key: 'categoryIds', label: L('دسته‌بندی‌ها', 'Categories'), type: 'multiselect', options: categoryOptions(cats, locale) },
    {
      section: S.publish, key: 'status', label: t.status, type: 'select',
      options: [{ value: 'PUBLISHED', label: t.published }, { value: 'PENDING', label: L('در انتظار بازبینی', 'Waiting for review') }, { value: 'DRAFT', label: t.draft }],
      ...(caller.authorReview ? { formOptions: [{ value: 'DRAFT', label: t.draft }, { value: 'PENDING', label: L('ارسال برای بازبینی', 'Send for review') }] } : {}),
    },
    { section: S.publish, key: 'publishedAt', label: L('زمان انتشار (خالی = اکنون، به وقت دستگاه شما)', 'Publication time (blank = now, your local time)'), type: 'datetime-local', hideInTable: true },
    ...(caller.mine ? [] : [{ section: S.publish, key: 'featured', label: t.special, type: 'checkbox' as const }]),
    { section: S.publish, key: 'access', label: L('دسترسی', 'Access'), type: 'select', options: [{ value: 'PUBLIC', label: L('همه', 'Everyone') }, { value: 'MEMBERS', label: L('فقط اعضای ویژه (VIP)', 'VIP members only') }] },
  ]
}

/** What the list narrows by; access only while the VIP module is on. */
function postFilters(locale: string, cats: any[], vipOn: boolean): ListFilter[] {
  const L = say(locale)
  return [
    { key: 'state', label: L('وضعیت', 'State'), options: [{ value: 'live', label: L('منتشرشده', 'Live') }, { value: 'scheduled', label: L('زمان‌بندی‌شده', 'Scheduled') }, { value: 'pending', label: L('در انتظار بازبینی', 'Waiting for review') }, { value: 'draft', label: L('پیش‌نویس', 'Draft') }, { value: 'trashed', label: L('سطل زباله', 'Trash') }] },
    { key: 'category', label: L('دسته', 'Category'), options: categoryOptions(cats, locale) },
    { key: 'featured', label: L('ویژه', 'Featured'), options: [{ value: '1', label: L('فقط ویژه‌ها', 'Featured only') }, { value: '0', label: L('غیرویژه', 'Not featured') }] },
    ...(vipOn ? [{ key: 'access', label: L('دسترسی', 'Access'), options: [{ value: 'PUBLIC', label: L('عمومی', 'Public') }, { value: 'MEMBERS', label: L('فقط VIP', 'VIP only') }] }] : []),
  ]
}

export default function AdminPostsPage() {
  const { t, locale } = useI18n()
  const [cats, setCats] = useState<any[]>([])
  const vipOn = useModuleEnabled('membership')
  // What the list says about the caller: a magazine author (own articles) and whether the manager reviews them.
  const [mine, setMine] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const onListMeta = useCallback((meta: Record<string, unknown>) => { setMine(meta.mine === true); setReviewing(meta.reviewing === true) }, [])
  const authorReview = mine && reviewing
  const S = sectionsOf(locale)

  useEffect(() => {
    fetch('/api/admin/cms?type=postcats').then((r) => (r.ok ? r.json() : [])).then(setCats)
  }, [])

  return (
    <JournalShell>
    <AdminCrud
      type="posts"
      fields={postFields(t, locale, cats, { mine, authorReview })}
      filters={postFilters(locale, cats, vipOn)}
      thumbnailKey="cover"
      aside={[S.publish, S.cats, S.cover]}
      onListMeta={onListMeta}
      rowLocked={(row) => (authorReview && row.status === 'PUBLISHED' ? say(locale)('منتشرشده؛ ویرایش با سردبیر', 'Published; the editor makes changes') : null)}
      renderAsideExtra={(form, editId) => (!mine && editId && form.status === 'PENDING' ? <PostReviewPanel key={editId} id={editId} /> : null)}
      editorExtraKeys={['itemLinks']}
      // The writing assistant and paid access are the manager's (PLATFORM_DECISIONS, section authors).
      renderEditorExtra={(form, setForm, editId) => <><PostItemLinks form={form} setForm={setForm} />{!mine && <><AiWritingAssistant form={form} setForm={setForm} /><PaidAccessPanel ownerType="post" ownerId={editId} noun="این مقاله" /></>}</>}
      extraRows={(row) => ({
        categoryIds: postCategories<any>(row).map(c => locale === 'fa' ? c.name : c.nameEn || c.name).join('، ') || '—',
        author: row.author?.name || row.author?.email || '—',
      })}
    />
    </JournalShell>
  )
}
