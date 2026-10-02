import { db } from '@/platform/database/prisma'
import { Prisma } from '@prisma/client'

export type InboxEvent = {
  userId: number
  kind: string
  dedupeKey: string
  titleEn: string
  titleFa: string
  bodyEn?: string
  bodyFa?: string
  href: string
}

/** Durable, idempotent customer event. External delivery must never gate settlement. */
export async function createInboxEvent(event: InboxEvent) {
  if (!Number.isInteger(event.userId) || event.userId <= 0 || !/^\/[A-Za-z0-9/_?=&.%-]*$/.test(event.href) || event.href.startsWith('//')) throw new Error('invalid inbox event')
  let row
  try {
    row = await db.$transaction(async (tx) => {
      const created = await tx.userNotification.create({ data: event })
      await tx.backgroundJob.createMany({ data: (['sms', 'email', 'push'] as const).map((channel) => ({
        kind: 'notification.deliver', payload: JSON.stringify({ notificationId: created.id, channel }),
        dedupeKey: `notification:${created.id}:${channel}`,
      })) })
      return created
    })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const existing = await db.userNotification.findUnique({ where: { dedupeKey: event.dedupeKey } })
    if (!existing || existing.userId !== event.userId) throw new Error('inbox dedupe key collision')
    return existing
  }
  return row
}

/** Queue handler: each channel retries independently without repeating a successful channel. */
export async function deliverInboxCopy(notificationId: number, channel: string) {
  if (!Number.isSafeInteger(notificationId) || notificationId <= 0 || !['sms', 'email', 'push'].includes(channel)) throw new Error('invalid notification delivery')
  const event = await db.userNotification.findUnique({ where: { id: notificationId } })
  if (!event) return { skipped: 'removed' }
  if (channel === 'sms') {
    const { notifyUserEvent } = await import('@/modules/sms/server/sms')
    const sent = await notifyUserEvent(event)
    if (sent === false) throw new Error('SMS provider rejected notification')
    return { sent: sent === true }
  }
  if (channel === 'email') {
    const { notifyUserEmail } = await import('@/modules/mail/server/mailer')
    const sent = await notifyUserEmail(event)
    if (sent === false) throw new Error('Email provider rejected notification')
    return { sent: sent === true }
  }
  const { pushToUser } = await import('@/modules/push/server/push')
  const delivered = await pushToUser(event.userId, { title: event.titleFa, body: event.bodyFa, url: event.href, tag: event.kind })
  if (delivered.retryable) throw new Error('Push provider failed to deliver notification')
  return { sent: delivered.sent > 0 }
}

export async function invoicePaidEvent(invoice: { id: number; number: string; userId: number; kind: string }) {
  return createInboxEvent({
    userId: invoice.userId, kind: 'PAYMENT_PAID', dedupeKey: `invoice:${invoice.id}:paid`,
    titleEn: 'Payment confirmed', titleFa: 'پرداخت تأیید شد',
    bodyEn: `Invoice ${invoice.number} was paid. Delivery status is available on the invoice.`,
    bodyFa: `پرداخت فاکتور ${invoice.number} تأیید شد. وضعیت تحویل در فاکتور قابل مشاهده است.`,
    href: `/invoice/${encodeURIComponent(invoice.number)}`,
  })
}

/** Backfills customer notices if a webhook exits after updating an invoice. */
export async function syncRecentInvoiceEvents() {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ['PAID', 'VOID'] }, updatedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
    orderBy: { updatedAt: 'desc' }, take: 500,
    select: { id: true, number: true, userId: true, kind: true, status: true },
  })
  const keys = invoices.map(invoice => `invoice:${invoice.id}:${invoice.status === 'PAID' ? 'paid' : 'closed'}`)
  const existing = await db.userNotification.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } })
  const sent = new Set(existing.map(row => row.dedupeKey))
  for (const invoice of invoices) {
    const key = `invoice:${invoice.id}:${invoice.status === 'PAID' ? 'paid' : 'closed'}`
    if (sent.has(key)) continue
    if (invoice.status === 'PAID') await invoicePaidEvent(invoice)
    else await createInboxEvent({
      userId: invoice.userId, kind: 'PAYMENT_CLOSED', dedupeKey: `invoice:${invoice.id}:closed`,
      titleEn: 'Payment was not completed', titleFa: 'پرداخت تکمیل نشد',
      bodyEn: `Invoice ${invoice.number} is closed. You can review it and start a new purchase if needed.`,
      bodyFa: `فاکتور ${invoice.number} بسته شده است. آن را بررسی کنید و در صورت نیاز خرید تازه‌ای ثبت کنید.`,
      href: `/invoice/${encodeURIComponent(invoice.number)}`,
    })
  }
  return { checked: invoices.length }
}
