import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

/**
 * Tells the author what was decided about a delete they asked for: the item was put back, or deleted for good.
 * One notice per request (the time the request was made is part of its key, so a second request on the same item
 * is told separately). Nobody is told about their own decision, and an item nobody asked to delete tells nobody.
 * The decision has already been made when this runs: a notice that cannot be written is logged, never thrown.
 */
export async function tellTrashDecision(input: { askedById: number | null | undefined; askedAt: Date | null | undefined; decidedById: number; decision: 'restored' | 'deleted'; kind: string; id: number; title: string; href: string }) {
  if (!input.askedById || !input.askedAt || input.askedById === input.decidedById) return
  const title = input.title.trim().slice(0, 120) || '—'
  const restored = input.decision === 'restored'
  try {
    await createInboxEvent({
      userId: input.askedById,
      kind: 'TRASH_DECISION',
      dedupeKey: `trash:${input.kind}:${input.id}:${input.askedAt.getTime()}:${input.decision}`,
      titleFa: restored ? 'درخواست حذف شما پذیرفته نشد' : 'مطلب شما حذف شد',
      titleEn: restored ? 'Your delete request was declined' : 'Your item was deleted',
      bodyFa: restored ? `«${title}» از سطل زباله برگشت و دوباره همان‌طور که بود در دسترس است.` : `درخواست حذف «${title}» تأیید و برای همیشه حذف شد.`,
      bodyEn: restored ? `"${title}" was put back as it was.` : `"${title}" was deleted for good.`,
      href: input.href,
    })
  } catch (error) { logEvent('error', 'content.trash_notice_failed', { kind: input.kind, id: input.id, decision: input.decision, error }) }
}
