import { Prisma } from '@prisma/client'
import { auditAdminStrict } from '@/platform/audit/server'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { CHANNELS, receiptOf } from '@/modules/notifications/domain/policy'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { hostingRenewalHorizon } from '@/modules/hosting/domain/services'
import type { RenewalDueFilter, RenewalInvoiceFilter, RenewalReminderDelivery, RenewalReminderPreview, RenewalReminderResult, RenewalReminderSelection } from '@/modules/hosting/domain/renewal-reminders'
import { findCurrentRenewalInvoices } from './renewal-workspace'

const pageSize = 25
export const renewalReminderBatchLimit = pageSize
const eventKey = (id: number, dueAt: Date) => `hosting:${id}:due:manual:${dueAt.toISOString()}`
const jobKey = (id: number, channel: string) => `notification:${id}:${channel}`

const serviceSelect = {
  id: true, label: true, userId: true, nextDueAt: true,
  user: { select: { email: true, name: true } },
} as const

function dueRange(due: RenewalDueFilter, now: Date): Prisma.DateTimeNullableFilter {
  if (due === 'OVERDUE') return { lte: now }
  if (due === 'NEXT_7') return { gt: now, lte: new Date(now.getTime() + 7 * 86_400_000) }
  return { ...(due === 'NEXT_30' ? { gt: now } : {}), lte: hostingRenewalHorizon(now) }
}

const eligibleServices = (due: RenewalDueFilter, now: Date): Prisma.HostingServiceWhereInput => ({
  status: { in: ['ACTIVE', 'SUSPENDED'] }, cycle: { not: 'HOURLY' }, nextDueAt: dueRange(due, now),
  priceMinor: { gt: 0 }, user: { status: 'ACTIVE', erasedAt: null },
})

type DeliveryJob = { status: string; result: string; attempts: number; lastError: string }
function channelDelivery(channel: typeof CHANNELS[number], job?: DeliveryJob): RenewalReminderDelivery['channels'][number] {
  if (!job) return { channel, status: 'SKIPPED', reason: 'ارسالی برای این مسیر در صف ثبت نشده است.' }
  const receipt = receiptOf(job)
  if (receipt === 'sent') return { channel, status: 'DELIVERED', reason: null }
  if (receipt === 'notSent') return { channel, status: 'SKIPPED', reason: 'نسخه‌ای ارسال نشد. تنظیمات اعلان یا نشانی مقصد را بررسی کنید.' }
  if (receipt === 'failed') {
    const interrupted = job.lastError === 'interrupted on every attempt'
    return { channel, status: 'FAILED', reason: interrupted ? 'پردازش صف در همهٔ تلاش‌ها قطع شد.' : 'درگاه ارسال، تحویل اعلان را تأیید نکرد.' }
  }
  return job.attempts > 0 && job.lastError
    ? { channel, status: 'RETRYING', reason: 'آخرین تلاش ارسال ناموفق بود. صف دوباره تلاش می‌کند.' }
    : { channel, status: 'QUEUED', reason: null }
}

export async function previewRenewalReminders(
  filters: { due: RenewalDueFilter; invoice: RenewalInvoiceFilter; cursor: number },
  now = new Date(),
): Promise<RenewalReminderPreview> {
  const rows = await db.hostingService.findMany({
    where: { ...eligibleServices(filters.due, now), id: { gt: filters.cursor } },
    orderBy: { id: 'asc' }, take: pageSize + 1, select: serviceSelect,
  })
  const page = rows.slice(0, pageSize).flatMap(row => row.nextDueAt ? [{ ...row, nextDueAt: row.nextDueAt }] : [])
  const byOwner = new Map<number, { id: number; nextDueAt: Date }[]>()
  for (const row of page) byOwner.set(row.userId, [...(byOwner.get(row.userId) || []), row])
  const invoices = new Map((await Promise.all([...byOwner].map(async ([userId, terms]) =>
    [...await findCurrentRenewalInvoices(userId, terms, now)]))).flat())
  const matching = page.filter(row => filters.invoice === 'ALL' || (invoices.get(row.id)?.status ?? 'NONE') === filters.invoice)
  const notices = matching.length ? await db.userNotification.findMany({
    where: { kind: 'HOSTING', dedupeKey: { in: matching.map(row => eventKey(row.id, row.nextDueAt)) } },
    select: { id: true, userId: true, dedupeKey: true, createdAt: true },
  }) : []
  const jobs = notices.length ? await db.backgroundJob.findMany({
    where: { kind: 'notification.deliver', dedupeKey: { in: notices.flatMap(row => CHANNELS.map(channel => jobKey(row.id, channel))) } },
    select: { dedupeKey: true, status: true, result: true, lastError: true, attempts: true },
  }) : []
  const byNotice = new Map(notices.map(row => [row.dedupeKey, row]))
  const byJob = new Map(jobs.map(job => [job.dedupeKey, job]))
  return {
    nextCursor: rows.length > pageSize ? page.at(-1)?.id ?? null : null,
    items: matching.map(row => {
      const invoice = invoices.get(row.id) ?? null
      const notice = byNotice.get(eventKey(row.id, row.nextDueAt))
      const delivery = notice?.userId === row.userId ? {
        recordedAt: notice.createdAt.toISOString(),
        channels: CHANNELS.map(channel => channelDelivery(channel, byJob.get(jobKey(notice.id, channel)))),
      } : null
      return {
        id: row.id, label: row.label, userId: row.userId, recipient: row.user.name || row.user.email,
        dueAt: row.nextDueAt.toISOString(), invoice, delivery, eligible: !notice && invoice?.status !== 'PAID',
      }
    }),
  }
}

type CommandActor = Pick<Parameters<typeof auditAdminStrict>[0], 'req' | 'actor'>

async function enqueueRenewalReminder(selection: RenewalReminderSelection, admin: CommandActor, now: Date): Promise<RenewalReminderResult> {
  const { id, userId, dueAt, invoiceNumber } = selection
  return db.$transaction(async tx => {
    // Serialize dispatch for a service with other dispatchers and term changes.
    await tx.$queryRaw`SELECT "id" FROM "HostingService" WHERE "id" = ${id} FOR UPDATE`
    const row = await tx.hostingService.findFirst({ where: { ...eligibleServices('ALL', now), id, userId }, select: serviceSelect })
    if (!row?.nextDueAt || row.nextDueAt.toISOString() !== dueAt) {
      return { id, status: 'SKIPPED', message: 'سرویس، گیرنده یا سررسید تغییر کرده است. پیش‌نمایش را تازه کنید.' }
    }
    const invoice = (await findCurrentRenewalInvoices(userId, [row], now, tx)).get(id)
    if (invoice?.status === 'PAID' || (invoice?.number ?? null) !== invoiceNumber) {
      return { id, status: 'SKIPPED', message: 'فاکتور دوره پرداخت شده یا تغییر کرده است. پیش‌نمایش را تازه کنید.' }
    }
    const dedupeKey = eventKey(id, row.nextDueAt)
    const existing = await tx.userNotification.findUnique({ where: { dedupeKey }, select: { userId: true } })
    if (existing) return existing.userId === userId
      ? { id, status: 'ALREADY_RECORDED', message: 'یادآوری این دوره قبلاً ثبت شده است.' }
      : { id, status: 'SKIPPED', message: 'یادآوری این دوره برای مالک پیشین ثبت شده است.' }
    const titleFa = 'یادآوری تمدید سرویس'
    const timing = row.nextDueAt <= now ? 'سررسید سرویس گذشته است' : 'سررسید سرویس نزدیک است'
    const bodyFa = `«${row.label}» · ${timing}. برای پیگیری تمدید، جزئیات سرویس را ببینید.`
    await createInboxEvent({
      userId, kind: 'HOSTING', dedupeKey, titleFa, bodyFa, titleEn: 'Service renewal reminder',
      bodyEn: 'Open your service to review the current renewal.', href: `/cloud/dashboard/services/${id}`,
    }, tx)
    await auditAdminStrict({
      ...admin, action: 'hosting.renewal.reminder_queue', targetType: 'hosting-service', targetId: id,
      metadata: { dueAt },
    }, tx)
    return { id, status: 'QUEUED', message: 'یادآوری در صندوق مشتری و صف ارسال ثبت شد.' }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function dispatchRenewalReminders(selections: RenewalReminderSelection[], admin: CommandActor, now = new Date()) {
  const results: RenewalReminderResult[] = []
  for (const selection of selections) {
    for (let attempt = 1; ; attempt++) {
      try {
        results.push(await enqueueRenewalReminder(selection, admin, now))
        break
      } catch (error) {
        if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001'))) continue
        logEvent('error', 'hosting.renewal.reminder_queue_failed', { serviceId: selection.id, error })
        results.push({ id: selection.id, status: 'FAILED', message: 'ثبت در صف اعلان انجام نشد. دوباره تلاش کنید.' })
        break
      }
    }
  }
  return results
}
