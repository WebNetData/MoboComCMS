// One overview of everything that waits for a staff decision. Every source stays with its own
// module: this file only says which sources exist, who may see each one and where it is decided.

export type QueueSourceKey = 'forum-posts' | 'forum-flags' | 'article-comments' | 'item-reviews' | 'product-reviews' | 'product-questions' | 'community-reports' | 'copyright'

export interface QueueSource {
  key: QueueSourceKey
  /** The feature module that owns the items; the source disappears while it is off. */
  module: string
  /** Any one of these lets a staff member see the source, as on the owning admin page. */
  permissions: readonly string[]
  label: string
  labelEn: string
  /** The owning admin page, where the decision is made. */
  href: string
}

export const QUEUE_SOURCES: readonly QueueSource[] = [
  { key: 'forum-posts', module: 'forum', permissions: ['forum.moderate'], label: 'پیام‌های تالار در انتظار تأیید', labelEn: 'Forum posts awaiting approval', href: '/admin/forum?tab=review' },
  { key: 'forum-flags', module: 'forum', permissions: ['forum.moderate'], label: 'گزارش‌های تالار', labelEn: 'Forum flags', href: '/admin/forum?tab=flags' },
  { key: 'article-comments', module: 'journal', permissions: ['cms.posts'], label: 'دیدگاه‌های مقاله', labelEn: 'Article comments', href: '/admin/comments' },
  { key: 'item-reviews', module: 'reviews', permissions: ['reviews.moderate', 'cms.posts'], label: 'نظرهای محتوا (بازی، فیلم، موزیک، نرم‌افزار)', labelEn: 'Content reviews', href: '/admin/reviews' },
  { key: 'product-reviews', module: 'store', permissions: ['settings.manage', 'cms.products'], label: 'دیدگاه‌های محصول', labelEn: 'Product reviews', href: '/admin/product-feedback' },
  { key: 'product-questions', module: 'store', permissions: ['settings.manage', 'cms.products'], label: 'پرسش‌های محصول', labelEn: 'Product questions', href: '/admin/product-feedback' },
  { key: 'community-reports', module: 'community', permissions: ['community.moderate', 'users.manage'], label: 'گزارش‌های جامعه', labelEn: 'Community reports', href: '/admin/community/reports' },
  { key: 'copyright', module: 'copyright', permissions: ['copyright.manage', 'settings.manage'], label: 'گزارش‌های حق نشر', labelEn: 'Copyright reports', href: '/admin/copyright' },
]

/** Every permission that opens at least one source (the admin menu shows the page for any of them). */
export const QUEUE_PERMISSIONS: readonly string[] = [...new Set(QUEUE_SOURCES.flatMap((source) => source.permissions))]

/** The sources one staff member gets: the owning module is on and they hold one of its permissions. */
export function visibleSources(states: Readonly<Record<string, boolean | undefined>>, can: (permission: string) => boolean): QueueSource[] {
  return QUEUE_SOURCES.filter((source) => states[source.module] !== false && source.permissions.some(can))
}

export interface QueueItem { id: number; text: string; by: string; about: string; at: string }
export interface QueueGroup { key: QueueSourceKey; label: string; labelEn: string; href: string; count: number; oldestAt: string | null; items: QueueItem[] }

/** How long the oldest item of a source has waited: fine under a day, late after three. */
export function waitingTone(oldestAt: string | null, now: Date): 'none' | 'ok' | 'warn' | 'late' {
  if (!oldestAt) return 'none'
  const hours = (now.getTime() - new Date(oldestAt).getTime()) / 3_600_000
  return hours >= 72 ? 'late' : hours >= 24 ? 'warn' : 'ok'
}

/** Sources with something waiting first, the longest wait on top; empty ones keep the catalogue order. */
export function orderGroups(groups: readonly QueueGroup[]): QueueGroup[] {
  const waiting = groups.filter((group) => group.count > 0).sort((a, b) => String(a.oldestAt).localeCompare(String(b.oldestAt)))
  return [...waiting, ...groups.filter((group) => group.count === 0)]
}
