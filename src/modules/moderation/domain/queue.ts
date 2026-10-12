// One overview of everything that waits for a staff decision. Every source stays with its own
// module: this file only says which sources exist, who may see each one, where it is decided and,
// for a plain yes or no, which request of the owning admin API carries that decision.

export type QueueSourceKey = 'forum-posts' | 'forum-flags' | 'article-comments' | 'item-reviews' | 'business-experiences' | 'product-reviews' | 'product-questions' | 'community-reports' | 'copyright'

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
  /**
   * Yes/no decisions that can be sent from the overview. Each one is a request to the owning module's
   * own admin API, so its permission, rules, audit entry and follow-ups are that module's. Sources whose
   * decision needs more than a yes or no (an answer, a resolution text, the reported content) have none.
   */
  decisions?: readonly QueueDecision[]
}

export interface QueueDecision {
  key: 'approve' | 'reject'
  label: string
  labelEn: string
  /** Asked before sending when the decision cannot be taken back. */
  confirm?: string
  confirmEn?: string
  request: (id: number) => { url: string; method: 'POST' | 'PATCH'; body: Record<string, unknown> }
}

const yesNo = (approve: QueueDecision['request'], reject: QueueDecision['request'], rejectLabel: [string, string] = ['رد', 'Reject'], confirm?: [string, string]): QueueDecision[] => [
  { key: 'approve', label: 'تأیید و انتشار', labelEn: 'Approve', request: approve },
  { key: 'reject', label: rejectLabel[0], labelEn: rejectLabel[1], request: reject, ...(confirm ? { confirm: confirm[0], confirmEn: confirm[1] } : {}) },
]

export const QUEUE_SOURCES: readonly QueueSource[] = [
  { key: 'forum-posts', module: 'forum', permissions: ['forum.moderate'], label: 'پیام‌های تالار در انتظار تأیید', labelEn: 'Forum posts awaiting approval', href: '/admin/forum?tab=review',
    // The forum deletes a held post it rejects.
    decisions: yesNo((id) => ({ url: '/api/forum/review', method: 'POST', body: { postId: id, decision: 'approve', note: '' } }), (id) => ({ url: '/api/forum/review', method: 'POST', body: { postId: id, decision: 'reject', note: '' } }), ['رد و حذف', 'Reject and delete'], ['این پیام رد و حذف شود؟ این کار برگشت‌پذیر نیست.', 'Reject and delete this post? This cannot be undone.']) },
  { key: 'forum-flags', module: 'forum', permissions: ['forum.moderate'], label: 'گزارش‌های تالار', labelEn: 'Forum flags', href: '/admin/forum?tab=flags' },
  { key: 'article-comments', module: 'journal', permissions: ['cms.posts'], label: 'دیدگاه‌های مقاله', labelEn: 'Article comments', href: '/admin/comments',
    decisions: yesNo((id) => ({ url: '/api/admin/comments', method: 'PATCH', body: { id, status: 'APPROVED' } }), (id) => ({ url: '/api/admin/comments', method: 'PATCH', body: { id, status: 'REJECTED' } })) },
  { key: 'item-reviews', module: 'reviews', permissions: ['reviews.moderate'], label: 'نظرهای محتوا (بازی، فیلم، موزیک، نرم‌افزار)', labelEn: 'Content reviews', href: '/admin/reviews',
    decisions: yesNo((id) => ({ url: '/api/admin/reviews', method: 'POST', body: { id, action: 'approve' } }), (id) => ({ url: '/api/admin/reviews', method: 'POST', body: { id, action: 'reject' } })) },
  // Decided on the business's own page: the decision names the business as well as the experience.
  { key: 'business-experiences', module: 'businesses', permissions: ['businesses.manage'], label: 'تجربه‌های خرید از کسب‌وکارها', labelEn: 'Business experiences', href: '/admin/businesses' },
  { key: 'product-reviews', module: 'store', permissions: ['cms.products'], label: 'دیدگاه‌های محصول', labelEn: 'Product reviews', href: '/admin/product-feedback',
    decisions: yesNo((id) => ({ url: '/api/admin/product-feedback', method: 'PATCH', body: { id, kind: 'review', status: 'APPROVED' } }), (id) => ({ url: '/api/admin/product-feedback', method: 'PATCH', body: { id, kind: 'review', status: 'REJECTED' } })) },
  { key: 'product-questions', module: 'store', permissions: ['cms.products'], label: 'پرسش‌های محصول', labelEn: 'Product questions', href: '/admin/product-feedback' },
  { key: 'community-reports', module: 'community', permissions: ['community.moderate', 'users.manage'], label: 'گزارش‌های جامعه', labelEn: 'Community reports', href: '/admin/community/reports' },
  { key: 'copyright', module: 'copyright', permissions: ['copyright.manage', 'settings.manage'], label: 'گزارش‌های حق نشر', labelEn: 'Copyright reports', href: '/admin/copyright' },
]

/** Every permission that opens at least one source (the admin menu shows the page for any of them). */
export const QUEUE_PERMISSIONS: readonly string[] = [...new Set(QUEUE_SOURCES.flatMap((source) => source.permissions))]

/** The sources one staff member gets: the owning module is on and they hold one of its permissions. */
export function visibleSources(states: Readonly<Record<string, boolean | undefined>>, can: (permission: string) => boolean): QueueSource[] {
  return QUEUE_SOURCES.filter((source) => states[source.module] !== false && source.permissions.some(can))
}

export interface QueueItem {
  id: number
  /** Short plain excerpt for the list. */
  text: string
  /** The whole text (plain, capped), read before a decision is sent from the overview. */
  full: string
  by: string
  about: string
  at: string
}
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

/** How many items one batch may carry: each is still its own request to the owning module. */
export const BATCH_LIMIT = 30

/**
 * What a batch of decisions came to. Every item is decided by its own request, so some may be refused
 * (already decided by someone else, no longer there): the outcome says how many went through and gives the
 * first reasons of those that did not.
 */
export function batchOutcome(results: readonly { ok: boolean; error?: string }[]): { done: number; failed: number; reasons: string[] } {
  const failures = results.filter((result) => !result.ok)
  return { done: results.length - failures.length, failed: failures.length, reasons: [...new Set(failures.map((result) => result.error || '').filter(Boolean))].slice(0, 3) }
}

/** The ids of a batch: those picked that are still in the list, each once, capped. */
export const batchIds = (picked: readonly number[], present: readonly number[]): number[] => [...new Set(picked)].filter((id) => present.includes(id)).slice(0, BATCH_LIMIT)
