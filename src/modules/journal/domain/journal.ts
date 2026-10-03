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
}

export const DEFAULT_JOURNAL_SETTINGS: JournalSettings = {
  rails: (Object.keys(JOURNAL_RAILS) as JournalRail[]).map((key) => ({ key, enabled: true })),
  heroIds: [],
  editorIds: [],
  blockCategoryIds: [],
  pageSize: 24,
  autoApproveComments: false,
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
