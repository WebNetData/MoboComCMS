import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { currentAdminHasPermission, type AuthedUser } from '@/modules/identity/server/access'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { createQuotation } from '@/modules/store/server/quotations'
import { isClosedOpportunity } from '../../domain/crm-opportunities'
import { ChatError } from '../../domain/livechat'
import { crmFollowUpCustomer, mayManageFollowUps } from '../crm-follow-ups'
import { currentOpportunityActor, lockOpportunityUsers } from './access'
import { queueQuotationReminders } from './quotation-reminders'

export { deliverQuotationReminder } from './quotation-reminders'

const quoteFields = {
  id: true, userId: true, title: true, status: true, subtotalMinor: true, discountMinor: true,
  expiresAt: true, currency: true, order: { select: { id: true, status: true, userId: true } },
} as const

function visibleOpportunity(actor: AuthedUser, id: number): Prisma.CrmOpportunityWhereInput {
  return { id, user: crmFollowUpCustomer, ...(mayManageFollowUps(actor) ? {} : { assigneeId: actor.id }) }
}

export async function readQuoteOpportunity(actor: AuthedUser, id: number, tx: Prisma.TransactionClient = db) {
  const row = await tx.crmOpportunity.findFirst({
    where: visibleOpportunity(actor, id), select: { id: true, userId: true, stage: true, version: true },
  })
  if (!row) throw new ChatError('فرصت فروش پیدا نشد', 404)
  return row
}

async function lockQuoteOpportunity(req: NextRequest, viewer: AuthedUser, initial: Awaited<ReturnType<typeof readQuoteOpportunity>>, tx: Prisma.TransactionClient) {
  await lockOpportunityUsers(tx, viewer.id, initial.userId)
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    await tx.$queryRaw`SELECT id FROM "CrmOpportunity" WHERE id = ${initial.id} FOR UPDATE`
  }
  const actor = await currentOpportunityActor(req, tx, viewer.id)
  if (!await isModuleEnabled('store', tx)) throw new ChatError('فروشگاه در دسترس نیست', 404)
  if (!currentAdminHasPermission(actor, 'orders.manage')) throw new ChatError('دسترسی مدیریت سفارش تغییر کرده است', 403)
  const opportunity = await readQuoteOpportunity(actor, initial.id, tx)
  if (opportunity.userId !== initial.userId) throw new ChatError('مشتری فرصت تغییر کرده است', 409)
  return { actor, opportunity }
}

async function hasCurrentQuote(tx: Prisma.TransactionClient, opportunityId: number, now: Date) {
  return Boolean(await tx.crmOpportunityQuotation.findFirst({
    where: {
      opportunityId,
      quotation: { OR: [{ status: 'OPEN', expiresAt: { gt: now } }, { orderId: { not: null } }] },
    },
    select: { quotationId: true },
  }))
}

export async function listOpportunityQuotations(actor: AuthedUser, id: number, now = new Date()) {
  const opportunity = await readQuoteOpportunity(actor, id)
  const where = { opportunityId: id, quotation: { userId: opportunity.userId } }
  const [links, current] = await Promise.all([
    db.crmOpportunityQuotation.findMany({
      where, orderBy: { quotationId: 'desc' }, take: 25, select: { sharedAt: true, quotation: { select: quoteFields } },
    }),
    hasCurrentQuote(db, id, now),
  ])
  const open = !isClosedOpportunity(opportunity.stage)
  return {
    canCreate: open && !current,
    rows: links.map(({ quotation, sharedAt }) => {
      const { id, title, status, subtotalMinor, discountMinor, expiresAt, currency } = quotation
      const order = quotation.order?.userId === opportunity.userId ? quotation.order : null
      const effective = status === 'OPEN' && expiresAt <= now ? 'EXPIRED' : status
      return {
        id, title, status: effective, currency, amountMinor: String(subtotalMinor - discountMinor),
        expiresAt, sharedAt, canShare: open && !sharedAt && effective === 'OPEN' && !order,
        orderId: order?.id ?? null, orderStatus: order?.status ?? null, orderHref: order ? `/admin/store/orders/${order.id}` : null,
      }
    }),
  }
}

export async function createOpportunityQuotation(req: NextRequest, viewer: AuthedUser, id: number, version: number, input: Record<string, unknown>) {
  const initial = await readQuoteOpportunity(viewer, id)
  if (input.userId !== undefined && input.userId !== initial.userId) throw new ChatError('مشتری پیش‌فاکتور باید مشتری همین فرصت باشد', 409)
  const { id: quotationId } = await createQuotation({
    userId: initial.userId, title: input.title, expiresAt: input.expiresAt, discount: input.discount, lines: input.lines,
  }, viewer.id, async tx => {
    const { opportunity } = await lockQuoteOpportunity(req, viewer, initial, tx)
    if (opportunity.version !== version || isClosedOpportunity(opportunity.stage)) throw new ChatError('فرصت بسته شده یا تغییر کرده است. صفحه را تازه کنید', 409)
    if (await hasCurrentQuote(tx, id, new Date())) throw new ChatError('برای این فرصت پیش‌فاکتور فعال یا سفارش ثبت شده است', 409)
  }, async (tx, quotationId) => {
    await tx.crmOpportunityQuotation.create({ data: { quotationId, opportunityId: id } })
    await auditAdminStrict({ req, actor: viewer, action: 'store.quotation.create', targetType: 'quotation', targetId: quotationId, metadata: { opportunityId: id } }, tx)
  })
  return { id: quotationId }
}

export async function shareOpportunityQuotation(req: NextRequest, viewer: AuthedUser, id: number, quotationId: number) {
  const initial = await readQuoteOpportunity(viewer, id)
  return db.$transaction(async tx => {
    const { actor, opportunity } = await lockQuoteOpportunity(req, viewer, initial, tx)
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      await tx.$queryRaw`SELECT id FROM "StoreQuotation" WHERE id = ${quotationId} FOR UPDATE`
    }
    const row = await tx.crmOpportunityQuotation.findFirst({
      where: { opportunityId: id, quotationId, quotation: { userId: opportunity.userId } }, include: { quotation: true },
    })
    if (!row) throw new ChatError('پیش‌فاکتور این فرصت پیدا نشد', 404)
    if (row.sharedAt) return { id: quotationId, sharedAt: row.sharedAt }
    const now = new Date()
    if (isClosedOpportunity(opportunity.stage) || row.quotation.status !== 'OPEN' || row.quotation.orderId || row.quotation.expiresAt <= now) {
      throw new ChatError('این پیش‌فاکتور دیگر قابل اشتراک نیست', 409)
    }
    if (!await tx.user.count({ where: { id: opportunity.userId, ...crmFollowUpCustomer, status: 'ACTIVE' } })) {
      throw new ChatError('حساب مشتری فعال نیست', 409)
    }
    const changed = await tx.crmOpportunityQuotation.updateMany({
      where: { quotationId, opportunityId: id, sharedAt: null }, data: { sharedAt: now, sharedById: actor.id },
    })
    if (!changed.count) throw new ChatError('وضعیت پیش‌فاکتور تغییر کرد', 409)
    await createInboxEvent({
      userId: opportunity.userId, kind: 'STORE_QUOTATION', dedupeKey: `crm:quotation-share:${quotationId}`,
      titleFa: 'پیش‌فاکتور خرید شما آماده است', titleEn: 'Your quotation is ready',
      bodyFa: 'جزئیات، قیمت و مهلت اعتبار را در پیش‌فاکتور بررسی کنید.',
      href: `/quote/${row.quotation.token}`, channels: [], expiresAt: row.quotation.expiresAt,
    }, tx)
    await queueQuotationReminders(tx, row.quotation, now)
    await auditAdminStrict({ req, actor, action: 'crm.quotation.share', targetType: 'quotation', targetId: quotationId, metadata: { opportunityId: id } }, tx)
    return { id: quotationId, sharedAt: now }
  })
}
