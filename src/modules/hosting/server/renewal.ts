// Renewal of fixed-term hosting services: the price the customer pays to extend, applying a paid renewal once,
// automatic renewal from the wallet, reminders, suspension and termination by due date. Spec slice 3.
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { cycleMeta } from '@/modules/hosting/domain/catalog'
import { lifecycleSettings, lifecycleStep, renewedDue } from '@/modules/hosting/domain/services'
import { HostingRefusal } from '@/modules/hosting/server/services'

const DAY = 86_400_000
const parseMeta = (value: string): Record<string, unknown> => { try { return JSON.parse(value || '{}') } catch { return {} } }
const notify = (userId: number, serviceId: number, key: string, titleFa: string, bodyFa: string) =>
  createInboxEvent({ userId, kind: 'HOSTING', dedupeKey: `hosting:${serviceId}:${key}`, titleFa, titleEn: titleFa, bodyFa, bodyEn: bodyFa, href: `/dashboard/services/${serviceId}` })
    .then(() => 1).catch((error) => { logEvent('error', 'hosting.notify_failed', { serviceId, key, error }); return 0 })

/** Whether the service's current suspension is the system's, for an unpaid term (not staff, e.g. for abuse). */
async function unpaidSuspension(serviceId: number) {
  const last = await db.hostingAction.findFirst({ where: { serviceId, kind: { in: ['SUSPEND', 'UNSUSPEND'] } }, orderBy: { id: 'desc' }, select: { kind: true, actor: true } })
  return last?.kind === 'SUSPEND' && last.actor === 'SYSTEM'
}

// ============ Checkout ============

/** Extending one of the customer's own services by one term, at the price fixed when it was bought. */
export async function hostingRenewalQuote(serviceId: number, userId: number) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, select: { id: true, status: true, cycle: true, priceMinor: true, currency: true, label: true, nextDueAt: true } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404, 'HOSTING_SERVICE_NOT_FOUND')
  if (!['ACTIVE', 'SUSPENDED'].includes(service.status)) throw new HostingRefusal('این سرویس قابل تمدید نیست', 409, 'HOSTING_NOT_RENEWABLE')
  if (service.cycle === 'HOURLY' || !service.nextDueAt) throw new HostingRefusal('سرویس ساعتی تمدید ندارد و از کیف پول کم می‌شود', 409, 'HOSTING_NOT_RENEWABLE')
  if (service.priceMinor <= 0n) throw new HostingRefusal('مبلغ تمدید این سرویس تعیین نشده است؛ با پشتیبانی تماس بگیرید', 409, 'HOSTING_NO_PRICE')
  return {
    currency: service.currency,
    amountMinor: service.priceMinor,
    label: `تمدید ${service.label}`,
    meta: { kind: 'hosting-renewal', serviceId: service.id, cycle: service.cycle, priceMinor: service.priceMinor.toString(), productName: service.label, dueAt: service.nextDueAt.toISOString(), contentPath: `/dashboard/services/${service.id}` },
  }
}

// ============ Fulfilment ============

/**
 * A paid renewal adds one term to the due date, once per order (the action's unique key). A service suspended by
 * the system for this unpaid term opens again; one suspended by staff stays suspended. If the service was
 * terminated while the payment was on its way, the money goes back to the wallet instead.
 */
export async function applyHostingRenewal(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true, totalMinor: true, currency: true, invoice: { select: { id: true, number: true } } } })
  if (!order || order.status !== 'PAID') throw new Error('hosting renewal order is not paid')
  const meta = parseMeta(order.meta)
  const serviceId = Number(meta.serviceId)
  if (meta.kind !== 'hosting-renewal' || !serviceId) throw new Error('hosting renewal order has no service')
  const key = `renew:order:${order.id}`
  if (await db.hostingAction.findUnique({ where: { idempotencyKey: key } })) return { applied: false, repeated: true }
  const service = await db.hostingService.findUnique({ where: { id: serviceId } })
  if (!service || service.userId !== order.userId) throw new Error('hosting renewal service is missing or not the buyer\'s')

  if (service.status === 'TERMINATED' || !service.nextDueAt) {
    const refund = await moveWallet({ userId: order.userId, amount: legacyNumber(order.totalMinor, normalizeCurrency(order.currency)), currency: order.currency, type: 'REFUND', description: `برگشت تمدید ${service.label} (سرویس حذف شده بود)`, orderId: order.id, invoiceId: order.invoice?.id ?? null, idempotencyKey: `hosting-renew-refund:${order.id}` })
    if (!refund.ok) throw new Error(`renewal refund failed: ${refund.message || ''}`)
    await db.hostingAction.create({ data: { serviceId: service.id, actorId: order.userId, actor: 'SYSTEM', kind: 'RENEW', status: 'FAILED', idempotencyKey: key, detail: 'سرویس حذف شده بود؛ مبلغ به کیف پول برگشت', finishedAt: new Date() } })
    await notify(order.userId, service.id, `renew-refund:${order.id}`, 'تمدید انجام نشد و مبلغ برگشت', `«${service.label}» پیش از پرداخت حذف شده بود؛ مبلغ تمدید به کیف پول شما برگشت.`)
    return { applied: false, refunded: true }
  }

  const reopen = service.status === 'SUSPENDED' && await unpaidSuspension(service.id)
  const nextDueAt = renewedDue(service.nextDueAt, service.cycle)
  const now = new Date()
  await db.$transaction(async (tx) => {
    // The action row first: its unique key makes a second worker roll back instead of adding a second term.
    await tx.hostingAction.create({ data: { serviceId: service.id, actorId: order.userId, actor: 'CUSTOMER', kind: 'RENEW', status: 'DONE', idempotencyKey: key, detail: `تمدید ${cycleMeta(service.cycle)?.label || ''}`.trim(), finishedAt: now } })
    // Claim the due date the term was added to: a concurrent renewal of another order recomputes from the new one.
    const updated = await tx.hostingService.updateMany({ where: { id: service.id, nextDueAt: service.nextDueAt, status: service.status }, data: { nextDueAt, ...(reopen ? { status: 'ACTIVE', suspendedAt: null } : {}) } })
    if (updated.count !== 1) throw new Error('hosting service changed during renewal; retry')
    if (reopen) await tx.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'UNSUSPEND', detail: 'تمدید پرداخت شد', finishedAt: now } })
  })
  await notify(order.userId, service.id, `renewed:${order.id}`, 'سرویس شما تمدید شد', `«${service.label}» تا ${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', dateStyle: 'long' }).format(nextDueAt)} تمدید شد.${reopen ? ' دسترسی دوباره باز شد.' : ''}`)
  return { applied: true, nextDueAt, reopened: reopen }
}

/** Paid renewal orders that never got their job (a crash between payment and enqueue). */
export async function renewalOrdersWithoutDelivery(limit = 20) {
  const orders = await db.order.findMany({ where: { status: 'PAID', meta: { contains: '"kind":"hosting-renewal"' }, invoice: { status: 'PAID' } }, orderBy: { id: 'desc' }, take: 200, select: { id: true, invoice: { select: { id: true } } } })
  if (!orders.length) return []
  const ids = orders.map((order) => order.id)
  const [jobs, actions] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { orderId: { in: ids }, kind: 'HOSTING_RENEW' }, select: { orderId: true } }),
    db.hostingAction.findMany({ where: { idempotencyKey: { in: ids.map((id) => `renew:order:${id}`) } }, select: { idempotencyKey: true } }),
  ])
  const covered = new Set([...jobs.map((job) => job.orderId), ...actions.map((action) => Number(String(action.idempotencyKey).split(':').pop()))])
  return orders.filter((order) => !covered.has(order.id)).slice(0, limit).map((order) => ({ orderId: order.id, invoiceId: order.invoice?.id ?? null }))
}

// ============ Customer ============

export async function setServiceAutoRenew(userId: number, serviceId: number, on: boolean) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, select: { id: true, status: true, cycle: true } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404)
  if (on && (!['ACTIVE', 'SUSPENDED'].includes(service.status) || service.cycle === 'HOURLY')) throw new HostingRefusal('تمدید خودکار برای این سرویس نیست', 409)
  await db.hostingService.update({ where: { id: service.id }, data: { autoRenew: on } })
  await db.hostingAction.create({ data: { serviceId: service.id, actorId: userId, actor: 'CUSTOMER', kind: 'NOTE', detail: on ? 'تمدید خودکار از کیف پول روشن شد' : 'تمدید خودکار خاموش شد', finishedAt: new Date() } })
  return { autoRenew: on }
}

// ============ Scheduled ============

async function renewFromWallet(service: { id: number; userId: number; label: string; nextDueAt: Date }) {
  const { executeCheckout } = await import('@/modules/checkout/server/checkout')
  const { getSettings } = await import('@/modules/settings/server')
  // One key per service and due date: a repeated run finds the same order instead of charging again.
  const outcome = await executeCheckout({ userId: service.userId, hostingRenewServiceId: service.id, payWith: 'wallet', idempotencyKey: `hosting-renew-${service.id}-${service.nextDueAt.getTime()}`, siteUrl: (await getSettings()).siteUrl || process.env.NEXTAUTH_URL || '' })
  if (outcome.ok) return true
  await notify(service.userId, service.id, `renew-failed:${service.nextDueAt.toISOString()}`, 'تمدید خودکار انجام نشد', `«${service.label}»: ${outcome.code === 'INSUFFICIENT_FUNDS' ? 'موجودی کیف پول کافی نبود.' : outcome.message} کیف پول را شارژ کنید یا از صفحهٔ سرویس دستی تمدید کنید.`)
  return false
}

/** Reminders, wallet renewals, suspension and termination. Hourly; every step repeats safely. */
export async function runHostingLifecycle(now = new Date()) {
  const counters = { checked: 0, reminded: 0, renewed: 0, suspended: 0, warned: 0, terminated: 0, failed: 0 }
  if (!await isModuleEnabled('hosting')) return counters
  const settings = lifecycleSettings(await getModuleSettings('hosting').catch(() => ({} as Record<string, unknown>)))
  const horizon = new Date(now.getTime() + (Math.max(...settings.reminderDays, 1) + 1) * DAY)
  const rows = await db.hostingService.findMany({
    where: { cycle: { not: 'HOURLY' }, OR: [{ status: 'ACTIVE', nextDueAt: { lte: horizon } }, { status: 'SUSPENDED' }] },
    select: { id: true, userId: true, label: true, status: true, cycle: true, nextDueAt: true, suspendedAt: true, autoRenew: true },
    orderBy: { id: 'asc' }, take: 2000,
  })
  for (const row of rows) {
    counters.checked++
    try {
      const step = lifecycleStep({ ...row, unpaidSuspension: row.status === 'SUSPENDED' ? await unpaidSuspension(row.id) : false }, now, settings)
      if (!step || !row.nextDueAt) continue
      const stamp = row.nextDueAt.toISOString()
      if (step.kind === 'remind') counters.reminded += await notify(row.userId, row.id, `due:${step.days}:${stamp}`, 'زمان تمدید سرویس نزدیک است', `${step.days.toLocaleString('fa-IR')} روز تا سررسید «${row.label}» مانده است.${row.autoRenew ? ' از کیف پول تمدید می‌شود؛ موجودی را بررسی کنید.' : ' از صفحهٔ سرویس تمدید کنید.'}`)
      else if (step.kind === 'renew') { if (await renewFromWallet({ ...row, nextDueAt: row.nextDueAt })) counters.renewed++ }
      else if (step.kind === 'suspend') {
        const claimed = await db.hostingService.updateMany({ where: { id: row.id, status: 'ACTIVE', nextDueAt: row.nextDueAt }, data: { status: 'SUSPENDED', suspendedAt: now } })
        if (claimed.count !== 1) continue
        await db.hostingAction.create({ data: { serviceId: row.id, actor: 'SYSTEM', kind: 'SUSPEND', detail: 'سررسید پرداخت نشد', finishedAt: now } })
        counters.suspended++
        await notify(row.userId, row.id, `suspended:${stamp}`, 'سرویس شما معلق شد', `سررسید «${row.label}» گذشت و پرداخت نشد. با تمدید از صفحهٔ سرویس دوباره فعال می‌شود؛ پس از ${settings.terminateDays.toLocaleString('fa-IR')} روز حذف می‌شود.`)
      } else if (step.kind === 'warn-terminate') counters.warned += await notify(row.userId, row.id, `terminate-warn:${stamp}`, 'سرویس معلق شما به‌زودی حذف می‌شود', `«${row.label}» تا ${step.days.toLocaleString('fa-IR')} روز دیگر حذف می‌شود و اطلاعات آن برنمی‌گردد. برای نگه داشتن، تمدید کنید.`)
      else if (step.kind === 'terminate') {
        const claimed = await db.hostingService.updateMany({ where: { id: row.id, status: 'SUSPENDED', suspendedAt: row.suspendedAt }, data: { status: 'TERMINATED', terminatedAt: now } })
        if (claimed.count !== 1) continue
        await db.hostingAction.create({ data: { serviceId: row.id, actor: 'SYSTEM', kind: 'TERMINATE', detail: 'تمدید نشد', finishedAt: now } })
        counters.terminated++
        await notify(row.userId, row.id, `terminated:${stamp}`, 'سرویس شما حذف شد', `«${row.label}» به‌دلیل تمدید نشدن حذف شد.`)
      }
    } catch (error) {
      counters.failed++
      logEvent('error', 'hosting.lifecycle_failed', { serviceId: row.id, error: String(error) })
    }
  }
  return counters
}

