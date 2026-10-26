import type { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { plainText } from '@/shared/text/plain'
import { enqueue } from '@/modules/operations/server/enqueue'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { REVIEW_NOTE_LIMIT } from '@/modules/journal/domain/journal'

type Decision = {
  authorId: number | null; decidedById: number; postId: number; title: string
  decision: 'approve' | 'return'; note?: string; proposal?: boolean
}

/** Captured once with the decision; every retry keeps this decision's id and recipient. */
export async function queueReviewDecision(tx: Prisma.TransactionClient, input: Decision) {
  if (!input.authorId || input.authorId === input.decidedById) return null
  const eventId = randomUUID()
  return enqueue('journal.editorial-decision', {
    ...input, title: plainText(input.title, 120) || '—', note: input.note || '',
    proposal: input.proposal === true, eventId,
  }, { dedupeKey: `journal-editorial:${eventId}` }, tx)
}

/** Inbox writes must throw on failure so the existing Operations lease/backoff can retry them. */
export async function deliverReviewDecision(payload: Record<string, unknown>) {
  const validId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0
  if (!validId(payload.authorId) || !validId(payload.decidedById) || !validId(payload.postId)
    || typeof payload.eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.eventId)
    || typeof payload.title !== 'string' || payload.title.length > 120
    || typeof payload.note !== 'string' || payload.note.length > REVIEW_NOTE_LIMIT
    || typeof payload.proposal !== 'boolean' || (payload.decision !== 'approve' && payload.decision !== 'return')) throw new Error('Invalid editorial decision intent')
  if (payload.authorId === payload.decidedById) return { skipped: 'self' }
  const title = plainText(payload.title, 120) || '—', approved = payload.decision === 'approve'
  const note = payload.note ? `\nیادداشت سردبیر: ${payload.note}` : ''
  const noteEn = payload.note ? `\nEditor's note: ${payload.note}` : ''
  const proposal = payload.proposal
  await createInboxEvent({
    userId: Number(payload.authorId), kind: 'POST_REVIEW', dedupeKey: `journal-editorial:${payload.eventId}`,
    titleFa: proposal ? (approved ? 'پیشنهاد ویرایش شما اعمال شد' : 'پیشنهاد ویرایش شما پذیرفته نشد') : (approved ? 'نوشتهٔ شما تأیید شد' : 'نوشتهٔ شما برای اصلاح برگشت'),
    titleEn: proposal ? (approved ? 'Your proposed edit was applied' : 'Your proposed edit was not accepted') : (approved ? 'Your article was approved' : 'Your article was returned for changes'),
    bodyFa: proposal ? (approved ? `تغییرات پیشنهادی شما روی «${title}» اعمال شد.` : `پیشنهاد ویرایش «${title}» کنار گذاشته شد؛ نسخهٔ منتشرشده تغییری نکرد.${note}`) : (approved ? `«${title}» تأیید و منتشر شد.` : `«${title}» به پیش‌نویس برگشت.${note}`),
    bodyEn: proposal ? (approved ? `Your proposed changes to "${title}" were applied.` : `Your proposed edit of "${title}" was set aside; the published version is unchanged.${noteEn}`) : (approved ? `"${title}" was approved and published.` : `"${title}" was returned to draft.${noteEn}`),
    href: `/admin/posts?edit=${payload.postId}`,
  })
  return { delivered: true }
}
