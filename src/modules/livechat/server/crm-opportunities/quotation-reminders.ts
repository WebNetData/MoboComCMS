import { Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'
import { currentAdminHasPermission, adminNeedsTwoFactor, resolveCurrentUser } from '@/modules/identity/server/access'
import { CRM_PERMISSIONS } from '@/modules/livechat/domain/crm-desk'
import { validFollowUpId } from '@/modules/livechat/domain/crm-follow-ups'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { enqueue } from '@/modules/operations/server/enqueue'

const JOB = 'crm.quotation-reminder'
const DAY_MS = 86_400_000
type ReminderKind = 'waiting' | 'expiry'

/** Sharing creates durable internal reminders in the same transaction. */
export async function queueQuotationReminders(
  tx: Prisma.TransactionClient,
  quote: { id: number; expiresAt: Date },
  sharedAt: Date,
) {
  const expiry = quote.expiresAt.getTime() - DAY_MS
  const waiting = sharedAt.getTime() + 3 * DAY_MS
  if (waiting < expiry) {
    await enqueue(JOB, { quotationId: quote.id, kind: 'waiting' }, {
      dedupeKey: `crm:quotation-reminder:${quote.id}:waiting`, runAt: new Date(waiting),
    }, tx)
  }
  await enqueue(JOB, { quotationId: quote.id, kind: 'expiry' }, {
    dedupeKey: `crm:quotation-reminder:${quote.id}:expiry`, runAt: new Date(Math.max(sharedAt.getTime(), expiry)),
  }, tx)
}

/** A reminder is delivered only while the original share, offer and owner's authority are current. */
export async function deliverQuotationReminder(payload: Record<string, unknown>, now = new Date()) {
  const { quotationId, kind } = payload
  if (!validFollowUpId(quotationId) || (kind !== 'waiting' && kind !== 'expiry')) throw new Error('Invalid CRM quotation reminder job')
  const initial = await db.crmOpportunityQuotation.findUnique({
    where: { quotationId },
    select: { opportunityId: true, sharedAt: true, quotation: { select: { userId: true } }, opportunity: { select: { assigneeId: true } } },
  })
  const staffId = initial?.opportunity.assigneeId
  if (!initial?.sharedAt || !staffId) return { skipped: 'removed' }
  return db.$transaction(async tx => {
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      const ids = [...new Set([initial.quotation.userId, staffId])].sort((a, b) => a - b)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`)
      await tx.$queryRaw`SELECT id FROM "CrmOpportunity" WHERE id = ${initial.opportunityId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM "StoreQuotation" WHERE id = ${quotationId} FOR UPDATE`
      await tx.$queryRaw`SELECT "quotationId" FROM "CrmOpportunityQuotation" WHERE "quotationId" = ${quotationId} FOR UPDATE`
    }
    if (!await isModuleEnabled('livechat', tx) || !await isModuleEnabled('store', tx)) return { skipped: 'disabled' }
    const link = await tx.crmOpportunityQuotation.findUnique({
      where: { quotationId },
      select: {
        opportunityId: true, sharedAt: true,
        quotation: { select: { userId: true, status: true, orderId: true, expiresAt: true, customer: { select: { erasedAt: true, role: true } } } },
        opportunity: { select: { userId: true, assigneeId: true, stage: true } },
      },
    })
    if (!link?.sharedAt || link.sharedAt.getTime() !== initial.sharedAt!.getTime() ||
        link.opportunityId !== initial.opportunityId || link.opportunity.assigneeId !== staffId ||
        link.quotation.userId !== initial.quotation.userId || link.opportunity.userId !== link.quotation.userId ||
        link.quotation.customer.erasedAt || link.quotation.customer.role === 'ADMIN' ||
        link.quotation.status !== 'OPEN' || link.quotation.orderId !== null ||
        link.quotation.expiresAt <= now || ['WON', 'LOST'].includes(link.opportunity.stage)) return { skipped: 'changed' }

    const due = kind === 'waiting' ? link.sharedAt.getTime() + 3 * DAY_MS
      : Math.max(link.sharedAt.getTime(), link.quotation.expiresAt.getTime() - DAY_MS)
    if (kind === 'waiting' && Math.max(due, now.getTime()) >= link.quotation.expiresAt.getTime() - DAY_MS) return { skipped: 'changed' }
    if (due > now.getTime()) return { skipped: 'early' }

    const staff = await resolveCurrentUser(staffId, now.getTime(), tx)
    if (!staff || staff.role !== 'ADMIN' || await adminNeedsTwoFactor(staff, tx) ||
        !currentAdminHasPermission(staff, 'orders.manage') ||
        !CRM_PERMISSIONS.some(permission => currentAdminHasPermission(staff, permission))) return { skipped: 'ineligible' }
    const dedupeKey = `crm:quotation-reminder:${quotationId}:${kind}`
    const existing = await tx.userNotification.findUnique({ where: { dedupeKey }, select: { id: true } })
    if (existing) return { delivered: true }
    await createInboxEvent({
      userId: staffId, kind: 'CRM_QUOTATION_REMINDER', dedupeKey,
      titleFa: kind === 'waiting' ? 'پیگیری پیش‌فاکتور' : 'مهلت پیش‌فاکتور نزدیک است',
      titleEn: '', bodyFa: 'فرصت فروش را برای بررسی پیش‌فاکتور باز کنید.', bodyEn: '',
      href: `/admin/crm/opportunities?id=${link.opportunityId}`, channels: [],
    }, tx)
    return { delivered: true }
  })
}
