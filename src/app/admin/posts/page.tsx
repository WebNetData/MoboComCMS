'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AdminCrud, { type FieldDef, type ListFilter } from '../cms/AdminCrud'
import { JournalShell } from '../journal/shared'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { categoryOptions, postCategories } from '@/modules/site/domain/categories'
import { useI18n } from '@/i18n/LocaleProvider'
import AiWritingAssistant from './AiWritingAssistant'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'
import PostItemLinks from './PostItemLinks'
import PostReviewPanel from './PostReviewPanel'
import PostStylePanel from './PostStylePanel'
import { PostProposalNotice, PostProposalPanel } from './PostProposalPanel'
import ItemAudiencePanel from '@/components/admin/ItemAudiencePanel'

type Texts = ReturnType<typeof useI18n>['t']
const say = (locale: string) => (persian: string, english: string) => (locale === 'fa' ? persian : english)
const sectionsOf = (locale: string) => {
  const L = say(locale)
  return { format: L('قالب و جزئیات قالب', 'Format & its details'), body: L('متن نوشته', 'Article'), cover: L('تصویر شاخص', 'Featured image'), cats: L('دسته‌بندی', 'Categories'), publish: L('انتشار و دسترسی', 'Publishing & access') }
}

/** The article form. An author never features; while the manager reviews authors' articles they draft or send for review. */
function postFields(t: Texts, locale: string, cats: any[], caller: { mine: boolean; authorReview: boolean }): FieldDef[] {
  const L = say(locale), S = sectionsOf(locale)
  // An author's published article (review on) is changed by proposal: its status, time and address stay the editor's.
  const notProposing = (form: Record<string, any>) => !(caller.authorReview && form.status === 'PUBLISHED')
  return [
    { section: S.body, key: 'title', label: t.title, required: true, wide: true },
    { section: S.body, key: 'slug', label: t.slug, required: true, dir: 'ltr', wide: true, showWhen: notProposing },
    { section: S.body, key: 'excerpt', label: t.excerpt, type: 'textarea', hideInTable: true },
    { section: S.body, key: 'content', label: t.content, type: 'richtext', hideInTable: true },
    { section: S.cover, key: 'cover', label: t.cover, type: 'image', hideInTable: true },
    { section: S.cats, key: 'categoryIds', label: L('دسته‌بندی‌ها', 'Categories'), type: 'multiselect', options: categoryOptions(cats, locale) },
    {
      section: S.publish, key: 'status', label: t.status, type: 'select', showWhen: notProposing,
      options: [{ value: 'PUBLISHED', label: t.published }, { value: 'PENDING', label: L('در انتظار بازبینی', 'Waiting for review') }, { value: 'DRAFT', label: t.draft }],
      ...(caller.authorReview ? { formOptions: [{ value: 'DRAFT', label: t.draft }, { value: 'PENDING', label: L('ارسال برای بازبینی', 'Send for review') }] } : {}),
    },
    { section: S.publish, key: 'publishedAt', label: L('زمان انتشار (خالی = اکنون، به وقت دستگاه شما)', 'Publication time (blank = now, your local time)'), type: 'datetime-local', hideInTable: true, showWhen: notProposing },
    ...(caller.mine ? [] : [{ section: S.publish, key: 'featured', label: t.special, type: 'checkbox' as const }]),
    { section: S.publish, key: 'access', label: L('دسترسی', 'Access'), type: 'select', options: [{ value: 'PUBLIC', label: L('همه', 'Everyone') }, { value: 'MEMBERS', label: L('فقط اعضای ویژه (VIP)', 'VIP members only') }] },
  ]
}

/** What the list narrows by; access only while the VIP module is on. */
function postFilters(locale: string, cats: any[], vipOn: boolean): ListFilter[] {
  const L = say(locale)
  return [
    { key: 'state', label: L('وضعیت', 'State'), options: [{ value: 'live', label: L('منتشرشده', 'Live') }, { value: 'scheduled', label: L('زمان‌بندی‌شده', 'Scheduled') }, { value: 'pending', label: L('در انتظار بازبینی', 'Waiting for review') }, { value: 'proposed', label: L('پیشنهاد ویرایش', 'Proposed edit') }, { value: 'draft', label: L('پیش‌نویس', 'Draft') }, { value: 'trashed', label: L('سطل زباله', 'Trash') }] },
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
  // A new article's page style, chosen before it has an id: saved right after the article is created.
  const pendingStyle = useRef('')
  const onSaved = useCallback(async (id: number, created: boolean) => {
    if (!created || !pendingStyle.current) return
    const templateId = pendingStyle.current
    pendingStyle.current = ''
    await fetch('/api/admin/builder/post-template', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: id, templateId }) })
  }, [])
  const S = sectionsOf(locale)
  const categoryName = (id: string) => { const found = cats.find((category) => String(category.id) === id); return found ? (locale === 'fa' ? found.name : found.nameEn || found.name) : `#${id}` }

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
      onSaved={onSaved}
      submitLabel={(form, editId) => (authorReview && editId && form.status === 'PUBLISHED' ? say(locale)('ارسال پیشنهاد ویرایش', 'Send proposed edit') : null)}
      renderAsideExtra={(form, editId) => {
        if (mine) return authorReview && editId && form.status === 'PUBLISHED' ? <PostProposalNotice proposal={form.proposal} /> : null
        return <>
          <PostStylePanel key={`style-${editId ?? 'new'}`} postId={editId} slug={form.slug} live={form.status === 'PUBLISHED'} onPending={(id) => { pendingStyle.current = id }} />
          {editId && form.status === 'PENDING' && <PostReviewPanel key={`review-${editId}`} id={editId} />}
          {editId && form.proposal?.changes && <PostProposalPanel key={`proposal-${editId}-${form.proposal.at}`} id={editId} proposal={form.proposal} live={form} categoryName={categoryName} />}
        </>
      }}
      editorExtraKeys={['itemLinks', 'proposal']}
      // The writing assistant and paid access are the manager's (PLATFORM_DECISIONS, section authors).
      renderEditorExtra={(form, setForm, editId) => <><PostItemLinks form={form} setForm={setForm} />{!mine && <><AiWritingAssistant form={form} setForm={setForm} /><ItemAudiencePanel type="post" id={editId} noun="این مقاله" /><PaidAccessPanel ownerType="post" ownerId={editId} noun="این مقاله" /></>}</>}
      extraRows={(row) => ({
        categoryIds: postCategories<any>(row).map(c => locale === 'fa' ? c.name : c.nameEn || c.name).join('، ') || '—',
        author: row.author?.name || row.author?.email || '—',
      })}
    />
    </JournalShell>
  )
}
