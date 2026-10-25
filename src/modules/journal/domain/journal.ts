// Journal (مجله) rules: Liona home layout settings and article health. Pure.

import { clampInt, normalizeIds, normalizeRails, parseSettingsInput } from '@/shared/section-layout'

/** Keys match the sections of the Liona journal home. */
export const JOURNAL_RAILS = {
  hero: 'اسلایدر اصلی و دایره‌های دسته',
  trending: 'اخبار ترند',
  latest: 'جدیدترین مطالب',
  categories: 'دسته‌بندی‌های مجله',
  news: 'آخرین اخبار',
  weekly: 'محبوب‌ترین‌های هفته (زبانه‌ای)',
  archive: 'آرشیو بهترین‌ها',
  blocks: 'بلوک‌های دسته‌بندی',
  panel: 'پنل مطالب محبوب یک دسته',
  social: 'انتخاب سردبیر',
} as const
export type JournalRail = keyof typeof JOURNAL_RAILS

export type JournalSettings = {
  rails: { key: JournalRail; enabled: boolean }[]
  /** First id = main story, the rest fill the list beside it. Empty = newest. */
  heroIds: number[]
  /** «انتخاب سردبیر» posts; empty = featured posts, then most viewed. */
  editorIds: number[]
  /** Categories for the two blocks and the panel, in that order; empty = busiest categories. */
  blockCategoryIds: number[]
  /** Posts per page on category, search and archive listings. */
  pageSize: number
  /** Publish member comments without review. */
  autoApproveComments: boolean
  /** A magazine author's article goes live only after the section's manager approves it. */
  reviewAuthorPosts: boolean
}

export const DEFAULT_JOURNAL_SETTINGS: JournalSettings = {
  rails: (Object.keys(JOURNAL_RAILS) as JournalRail[]).map((key) => ({ key, enabled: true })),
  heroIds: [],
  editorIds: [],
  blockCategoryIds: [],
  pageSize: 24,
  autoApproveComments: false,
  reviewAuthorPosts: false,
}

export function normalizeJournalSettings(input: unknown): JournalSettings {
  const raw = parseSettingsInput(input)
  return {
    rails: normalizeRails(raw.rails, JOURNAL_RAILS),
    heroIds: normalizeIds(raw.heroIds, 5),
    editorIds: normalizeIds(raw.editorIds, 4),
    blockCategoryIds: normalizeIds(raw.blockCategoryIds, 3),
    pageSize: clampInt(raw.pageSize, 12, 48, DEFAULT_JOURNAL_SETTINGS.pageSize),
    autoApproveComments: raw.autoApproveComments === true,
    reviewAuthorPosts: raw.reviewAuthorPosts === true,
  }
}

export const JOURNAL_HEALTH = {
  cover: 'بدون تصویر شاخص',
  excerpt: 'بدون خلاصه',
  category: 'بدون دسته‌بندی',
  short: 'متن کوتاه (کمتر از ۱۵۰ واژه)',
} as const
export type JournalHealth = keyof typeof JOURNAL_HEALTH

/** Scheduled posts remain private until their publication instant. */
export const livePostWhere = (now = new Date()) => ({ status: 'PUBLISHED' as const, publishedAt: { lte: now } })
export const isLivePost = (post: { status: string; publishedAt: Date }, now = new Date()) => post.status === 'PUBLISHED' && post.publishedAt <= now

// ------------------------------------------------------------------ editorial review

/** Written, waiting for the section's manager; never public (public readers ask for PUBLISHED). */
export const PENDING_REVIEW = 'PENDING'
/** The statuses a form may send for an article; the trash is entered and left only through its own actions. */
export const POST_FORM_STATUSES = ['DRAFT', PENDING_REVIEW, 'PUBLISHED'] as const
export type PostFormStatus = typeof POST_FORM_STATUSES[number]
export class PostReviewError extends Error { constructor(message: string, readonly status = 403) { super(message) } }
/** A status from a form: one of the three, or absent (the stored one stays; a new article defaults to published). */
export function postFormStatus(value: unknown): PostFormStatus | undefined {
  if (value === undefined) return undefined
  if (!(POST_FORM_STATUSES as readonly unknown[]).includes(value)) throw new PostReviewError('این وضعیت برای نوشته معتبر نیست', 400)
  return value as PostFormStatus
}
/**
 * What an author may not do while review is on: put an article on the site (a new article without a status is a
 * published one), or change an article that is already published, live or scheduled. Null when allowed.
 */
export function authorReviewRefusal(input: { reviewing: boolean; current?: { status: string } | null; asked: PostFormStatus | undefined; creating: boolean }): string | null {
  if (!input.reviewing) return null
  if (input.current?.status === 'PUBLISHED') return 'این نوشته منتشر شده است؛ ویرایش آن با سردبیر است'
  const effective = input.asked ?? (input.creating ? 'PUBLISHED' : input.current?.status)
  return effective === 'PUBLISHED' ? 'انتشار نوشته با سردبیر است؛ آن را برای بازبینی بفرستید' : null
}
/** An approved article keeps a future publication time (its schedule); an earlier one becomes now. */
export const approvalPublishedAt = (publishedAt: Date, now = new Date()) => (publishedAt.getTime() > now.getTime() ? publishedAt : now)
export const REVIEW_NOTE_LIMIT = 1000

/** What an author may propose for a published article: its words, picture and categories; never status, time or address. */
export const PROPOSAL_TEXT_FIELDS = ['title', 'titleEn', 'excerpt', 'excerptEn', 'content', 'contentEn', 'cover'] as const
export type ProposalTextField = typeof PROPOSAL_TEXT_FIELDS[number]
export type PostProposalChanges = Partial<Record<ProposalTextField, string>> & { categoryIds?: number[] }
const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, index) => id === b[index])
/**
 * The proposal an author's save makes: each proposable field the save carries that differs from the live article
 * (categories in their chosen order, the first being the main one). Empty when the save changes nothing.
 */
export function proposalChanges(current: Partial<Record<ProposalTextField, string | null>> & { categoryIds: readonly number[] }, asked: Partial<Record<ProposalTextField, unknown>> & { categoryIds?: readonly number[] }): PostProposalChanges {
  const changes: PostProposalChanges = {}
  for (const field of PROPOSAL_TEXT_FIELDS) {
    const value = asked[field]
    if (typeof value === 'string' && value !== (current[field] ?? '')) changes[field] = value
  }
  if (asked.categoryIds && !sameIds(asked.categoryIds, current.categoryIds)) changes.categoryIds = [...asked.categoryIds]
  return changes
}
/** A stored proposal read back; anything not proposable is dropped. */
export function readProposalChanges(json: string): PostProposalChanges {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return {} }
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>, changes: PostProposalChanges = {}
  for (const field of PROPOSAL_TEXT_FIELDS) if (typeof value[field] === 'string') changes[field] = value[field] as string
  if (Array.isArray(value.categoryIds) && value.categoryIds.every((id) => Number.isSafeInteger(id) && (id as number) > 0)) changes.categoryIds = value.categoryIds as number[]
  return changes
}

/** Where an article stands in the admin list: live, published for later, a draft, or waiting in the trash. */
export const ADMIN_POST_STATES = ['live', 'scheduled', 'pending', 'proposed', 'draft', 'trashed'] as const
export type AdminPostState = typeof ADMIN_POST_STATES[number]
export function adminPostStateWhere(state: AdminPostState, now = new Date()) {
  if (state === 'live') return livePostWhere(now)
  if (state === 'scheduled') return { status: 'PUBLISHED' as const, publishedAt: { gt: now } }
  if (state === 'pending') return { status: PENDING_REVIEW }
  if (state === 'proposed') return { editProposal: { isNot: null } }
  return { status: state === 'draft' ? 'DRAFT' as const : 'TRASHED' as const }
}
/** The posts list's narrowing asked in the address; an unknown value is refused rather than silently ignored. */
export type AdminPostFilters = { state?: AdminPostState; category?: number; featured?: boolean; access?: 'PUBLIC' | 'MEMBERS' }
export function parseAdminPostFilters(params: URLSearchParams): AdminPostFilters {
  const filters: AdminPostFilters = {}
  const state = params.get('state'), category = params.get('category'), featured = params.get('featured'), access = params.get('access')
  if (state) {
    if (!(ADMIN_POST_STATES as readonly string[]).includes(state)) throw new Error('unknown post state')
    filters.state = state as AdminPostState
  }
  if (category) {
    if (!/^[1-9]\d{0,9}$/.test(category)) throw new Error('invalid category')
    filters.category = Number(category)
  }
  if (featured) {
    if (featured !== '1' && featured !== '0') throw new Error('invalid featured filter')
    filters.featured = featured === '1'
  }
  if (access) {
    if (access !== 'PUBLIC' && access !== 'MEMBERS') throw new Error('invalid access filter')
    filters.access = access
  }
  return filters
}

// ------------------------------------------------------------------ listing SEO

export type JournalListingMeta = { title: string; description: string; canonical: string; index: boolean }
/**
 * Title, description, canonical and indexing of a magazine listing. A category (and each of its pages) and each
 * archive page is a page of its own; a search, and a category that does not exist, are not indexed. Null for the
 * magazine home, whose title and description are the section's SEO settings.
 */
export function journalListingMeta(input: { base: string; categoryAsked?: string; category?: { slug: string; name: string } | null; page?: string; query?: string }): JournalListingMeta | null {
  const parsed = Number(input.page)
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : input.page !== undefined ? 1 : 0
  const pageLabel = page > 1 ? ` — صفحهٔ ${page.toLocaleString('fa-IR')}` : ''
  if (input.query?.trim()) return { title: 'جست‌وجو در مجله', description: 'جست‌وجو در نوشته‌های مجله', canonical: input.base, index: false }
  if (input.categoryAsked) {
    if (!input.category) return { title: 'مجله', description: 'تازه‌ترین مقاله‌ها، اخبار، آموزش‌ها و نقدها', canonical: input.base, index: false }
    return {
      title: `${input.category.name}${pageLabel} — مجله`,
      description: `نوشته‌های مجله در دستهٔ «${input.category.name}»${page > 1 ? `، صفحهٔ ${page.toLocaleString('fa-IR')}` : ''}: آموزش‌ها، خبرها و نقدهای تازه.`,
      canonical: `${input.base}?category=${encodeURIComponent(input.category.slug)}${page > 1 ? `&page=${page}` : ''}`,
      index: true,
    }
  }
  if (page) return { title: page > 1 ? `مجله${pageLabel}` : 'آرشیو مجله', description: `همهٔ نوشته‌های مجله${page > 1 ? `، صفحهٔ ${page.toLocaleString('fa-IR')}` : ''}، از تازه‌ترین.`, canonical: `${input.base}?page=${page}`, index: true }
  return null
}

/** API clients send an absolute ISO time; an explicit blank means publish now. */
export function publicationDateInput(value: unknown, now = new Date()): Date {
  if (value === '' || value === null) return now
  if (typeof value !== 'string') throw new Error('Invalid publication date')
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) throw new Error('Invalid publication date')
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part || 0))
  const local = new Date(0)
  local.setUTCFullYear(year, month - 1, day)
  local.setUTCHours(hour, minute, second)
  if (!year || local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second) throw new Error('Invalid publication date')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid publication date')
  return date
}

export const wordCount = (html: string) => html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length

export function postIssues(post: { cover: string; excerpt: string; content: string; categories: number }): JournalHealth[] {
  const issues: JournalHealth[] = []
  if (!post.cover.trim()) issues.push('cover')
  if (post.excerpt.replace(/<[^>]*>/g, '').trim().length < 30) issues.push('excerpt')
  if (!post.categories) issues.push('category')
  if (wordCount(post.content) < 150) issues.push('short')
  return issues
}
