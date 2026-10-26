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
import { PostProposalNotice, PostProposalPanel } from './PostProposalPanel'
import { useSectionLists } from '../cms/useSectionLists'
import type { VocabularyEntry } from '@/modules/vocabulary/domain/vocabulary'

type Texts = ReturnType<typeof useI18n>['t']
const say = (locale: string) => (persian: string, english: string) => (locale === 'fa' ? persian : english)
const sectionsOf = (locale: string) => {
  const L = say(locale)
  return { format: L('قالب و جزئیات قالب', 'Format & its details'), body: L('متن نوشته', 'Article'), cover: L('تصویر شاخص', 'Featured image'), cats: L('دسته‌بندی', 'Categories'), publish: L('انتشار و دسترسی', 'Publishing & access') }
}

/** The article form. An author never features; while the manager reviews authors' articles they draft or send for review. */
function postFields(t: Texts, locale: string, cats: any[], caller: { mine: boolean; authorReview: boolean }, formats: VocabularyEntry[]): FieldDef[] {
  const L = say(locale), S = sectionsOf(locale)
  // The post's format (the owner's list) and the facts its family asks for: a review's score, pros, cons and verdict,
  // a video's address, a news item's source, an interview's guest. A hidden fact keeps its value.
  const familyOf = (form: Record<string, any>) => formats.find((entry) => entry.code === form.format)?.family || 'ARTICLE'
  const is = (family: string) => (form: Record<string, any>) => familyOf(form) === family
  const formatOptions = formats.map((entry) => ({ value: entry.code, label: `${entry.icon ? `${entry.icon} ` : ''}${locale === 'fa' ? entry.name : entry.nameEn || entry.name}${entry.active ? '' : L(' (غیرفعال)', ' (inactive)')}` }))
  // An author's published article (review on) is changed by proposal: its status, time and address stay the editor's.
  const notProposing = (form: Record<string, any>) => !(caller.authorReview && form.status === 'PUBLISHED')
  return [
    { section: S.format, key: 'format', label: L('قالب نوشته', 'Format'), type: 'select', options: formatOptions, hint: L('هر قالب فیلدهای مخصوص خودش را دارد؛ قالب‌ها را در «قالب‌ها» مدیریت کنید.', 'Each format has its own fields; manage formats under Formats.') },
    { section: S.format, key: 'fmtScore', label: L('امتیاز (از ۱۰)', 'Score (out of 10)'), type: 'number', hideInTable: true, showWhen: is('REVIEW'), placeholder: '8.5' },
    { section: S.format, key: 'fmtVerdict', label: L('جمع‌بندی در یک جمله', 'Verdict in one sentence'), hideInTable: true, wide: true, showWhen: is('REVIEW') },
    { section: S.format, key: 'fmtPros', label: L('نقاط قوت (هر خط یکی)', 'Pros (one per line)'), type: 'textarea', hideInTable: true, showWhen: is('REVIEW') },
    { section: S.format, key: 'fmtCons', label: L('نقاط ضعف (هر خط یکی)', 'Cons (one per line)'), type: 'textarea', hideInTable: true, showWhen: is('REVIEW') },
    { section: S.format, key: 'fmtVideoUrl', label: L('نشانی ویدیو (آپارات، یوتیوب یا فایل mp4)', 'Video address (Aparat, YouTube or an mp4 file)'), dir: 'ltr', hideInTable: true, wide: true, showWhen: is('VIDEO') },
    { section: S.format, key: 'fmtSourceName', label: L('نام منبع خبر', 'News source'), hideInTable: true, showWhen: is('NEWS') },
    { section: S.format, key: 'fmtSourceUrl', label: L('نشانی منبع', 'Source address'), dir: 'ltr', hideInTable: true, showWhen: is('NEWS') },
    { section: S.format, key: 'fmtGuestName', label: L('نام مهمان', 'Guest'), hideInTable: true, showWhen: is('INTERVIEW') },
    { section: S.format, key: 'fmtGuestRole', label: L('سمت یا معرفی کوتاه مهمان', 'Guest role'), hideInTable: true, showWhen: is('INTERVIEW') },
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
  const S = sectionsOf(locale)
  const formats = useSectionLists('journal', true).POST_FORMAT || []
  const categoryName = (id: string) => { const found = cats.find((category) => String(category.id) === id); return found ? (locale === 'fa' ? found.name : found.nameEn || found.name) : `#${id}` }

  useEffect(() => {
    fetch('/api/admin/cms?type=postcats').then((r) => (r.ok ? r.json() : [])).then(setCats)
  }, [])

  return (
    <JournalShell>
    <AdminCrud
      type="posts"
      fields={postFields(t, locale, cats, { mine, authorReview }, formats)}
      filters={postFilters(locale, cats, vipOn)}
      thumbnailKey="cover"
      aside={[S.publish, S.cats, S.cover]}
      onListMeta={onListMeta}
      submitLabel={(form, editId) => (authorReview && editId && form.status === 'PUBLISHED' ? say(locale)('ارسال پیشنهاد ویرایش', 'Send proposed edit') : null)}
      renderAsideExtra={(form, editId) => {
        if (mine) return authorReview && editId && form.status === 'PUBLISHED' ? <PostProposalNotice proposal={form.proposal} /> : null
        return <>
          {editId && form.status === 'PENDING' && <PostReviewPanel key={`review-${editId}`} id={editId} />}
          {editId && form.proposal?.changes && <PostProposalPanel key={`proposal-${editId}-${form.proposal.at}`} id={editId} proposal={form.proposal} live={form} categoryName={categoryName} />}
        </>
      }}
      editorExtraKeys={['itemLinks', 'proposal']}
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
