// Hourly (cloud) billing: buying without an upfront charge, one wallet charge per service-hour, low-balance warnings,
// suspension when the wallet is empty and return when it is topped up, deletion by the customer. Spec slice 5.
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { kindMeta } from '@/modules/hosting/domain/catalog'
import { floorHour, hourlyMinHours, hourlyStep, hoursDue, lifecycleSettings, normalizeServiceName, runwayHours } from '@/modules/hosting/domain/services'
import { HostingRefusal, provisionService } from '@/modules/hosting/server/services'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const OPEN = ['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED']
class Insufficient extends Error {}
class Moved extends Error {}

const notify = (userId: number, serviceId: number, key: string, titleFa: string, bodyFa: string) =>
  createInboxEvent({ userId, kind: 'HOSTING', dedupeKey: `hosting:${serviceId}:${key}`, titleFa, titleEn: titleFa, bodyFa, bodyEn: bodyFa, href: `/dashboard/services/${serviceId}` })
    .then(() => 1).catch((error) => { logEvent('error', 'hosting.notify_failed', { serviceId, key, error }); return 0 })

const balanceOf = async (userId: number, currency: string) =>
  (await db.walletAccount.findUnique({ where: { userId_currency: { userId, currency } }, select: { balanceMinor: true } }))?.balanceMinor ?? 0n

async function unpaidSuspension(serviceId: number) {
  const last = await db.hostingAction.findFirst({ where: { serviceId, kind: { in: ['SUSPEND', 'UNSUSPEND'] } }, orderBy: { id: 'desc' }, select: { kind: true, actor: true } })
  return last?.kind === 'SUSPEND' && last.actor === 'SYSTEM'
}

// ============ Buying ============

/**
 * An hourly service is bought without an upfront charge: the wallet must cover the minimum hours (a setting), and
 * every hour is charged once it has run. A repeated request with the same key returns the same service.
 */
export async function createHourlyService(input: { userId: number; productId: number; hostname: unknown; requestKey: string }) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.requestKey)) throw new HostingRefusal('درخواست نامعتبر است', 400, 'IDEMPOTENCY_REQUIRED')
  const key = `hourly:${input.userId}:${input.requestKey}`
  const repeated = await db.hostingAction.findUnique({ where: { idempotencyKey: key }, select: { serviceId: true } })
  if (repeated) return { serviceId: repeated.serviceId, repeated: true }
  const product = await db.hostingProduct.findUnique({ where: { id: input.productId }, include: { prices: true, provider: { select: { id: true, active: true, capacity: true } } } })
  if (!product || !product.active) throw new HostingRefusal('این پلن در حال حاضر فروخته نمی‌شود', 404, 'HOSTING_PRODUCT_NOT_FOUND')
  const price = product.prices.find((row) => row.cycle === 'HOURLY' && row.currency === product.currency)
  if (!price || !kindMeta(product.kind)?.hourly) throw new HostingRefusal('این پلن پرداخت ساعتی ندارد', 400, 'HOSTING_CYCLE')
  const hostname = normalizeServiceName(product.kind, input.hostname)
  if (product.fulfillment === 'DRIVER') {
    if (!product.provider?.active) throw new HostingRefusal('این پلن موقتاً قابل تحویل نیست؛ با پشتیبانی تماس بگیرید', 503, 'HOSTING_PROVIDER_INACTIVE')
    if (product.provider.capacity > 0 && await db.hostingService.count({ where: { providerId: product.provider.id, status: { in: OPEN } } }) >= product.provider.capacity) throw new HostingRefusal('ظرفیت این پلن تکمیل شده است', 409, 'HOSTING_FULL')
  }
  const waiting = await db.hostingService.count({ where: { userId: input.userId, cycle: 'HOURLY', status: { in: ['PENDING', 'PROVISIONING'] } } })
  if (waiting >= 3) throw new HostingRefusal('سه سرویس ساعتی در انتظار تحویل دارید؛ پس از تحویل آن‌ها دوباره سفارش دهید', 429, 'HOSTING_TOO_MANY_WAITING')
  const hours = hourlyMinHours(await getModuleSettings('hosting').catch(() => ({})))
  const needed = price.amountMinor * BigInt(hours)
  const balance = await balanceOf(input.userId, product.currency)
  if (balance < needed) throw new HostingRefusal(`موجودی کیف پول باید دست‌کم هزینهٔ ${hours.toLocaleString('fa-IR')} ساعت (${Number(needed).toLocaleString('fa-IR')} تومان) باشد`, 402, 'INSUFFICIENT_FUNDS')
  try {
    const service = await db.$transaction(async (tx) => {
      const created = await tx.hostingService.create({ data: {
        userId: input.userId, productId: product.id, providerId: product.fulfillment === 'DRIVER' ? product.providerId : null,
        cycle: 'HOURLY', priceMinor: price.amountMinor, stoppedHourlyMinor: product.stoppedHourlyMinor, currency: product.currency, label: product.name, hostname,
      } })
      await tx.hostingAction.create({ data: { serviceId: created.id, actorId: input.userId, actor: 'CUSTOMER', kind: 'NOTE', idempotencyKey: key, detail: 'سفارش ساعتی', finishedAt: new Date() } })
      return created
    })
    // Delivery is the same as for a paid order: a driver creates it, or staff deliver it. A failed driver call is
    // retried by the fulfilment job; the customer is charged nothing until the service has started.
    const { enqueueFulfillment, processFulfillmentJob } = await import('@/modules/fulfillment/server/jobs')
    const job = await enqueueFulfillment({ kind: 'HOSTING_PROVISION', dedupeKey: `HOSTING_PROVISION:service:${service.id}`, payload: { serviceId: service.id } })
    await processFulfillmentJob(job.id)
    return { serviceId: service.id, repeated: false }
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      const again = await db.hostingAction.findUnique({ where: { idempotencyKey: key }, select: { serviceId: true } })
      if (again) return { serviceId: again.serviceId, repeated: true }
    }
    throw error
  }
}

// ============ Charging ============

async function suspendForBalance(service: { id: number; userId: number; label: string }, now: Date, terminateDays: number) {
  const claimed = await db.hostingService.updateMany({ where: { id: service.id, status: 'ACTIVE' }, data: { status: 'SUSPENDED', suspendedAt: now } })
  if (claimed.count !== 1) return false
  await db.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'SUSPEND', detail: 'موجودی کیف پول تمام شد', finishedAt: now } })
  await notify(service.userId, service.id, `out-of-credit:${now.getTime()}`, 'سرویس ساعتی شما متوقف شد', `موجودی کیف پول برای «${service.label}» تمام شد. با شارژ کیف پول خودکار دوباره روشن می‌شود؛ پس از ${terminateDays.toLocaleString('fa-IR')} روز حذف می‌شود.`)
  return true
}

/**
 * Charges the hours of one active hourly service that have run and are not charged yet, one transaction per hour:
 * the charged-until mark is claimed, the wallet is debited with a key per hour and the charge row (unique per hour)
 * is written. An empty wallet suspends the service. `includeCurrent` also charges the hour in progress (deletion).
 */
export async function chargeHourlyService(serviceId: number, now = new Date(), options: { includeCurrent?: boolean; terminateDays?: number } = {}) {
  const service = await db.hostingService.findUnique({ where: { id: serviceId } })
  if (!service || service.status !== 'ACTIVE' || service.cycle !== 'HOURLY' || !service.startedAt) return { charged: 0, suspended: false }
  const until = options.includeCurrent ? new Date(floorHour(now).getTime() + HOUR) : now
  const currency = normalizeCurrency(service.currency)
  let previous = service.chargedUntil
  let charged = 0
  for (const hour of hoursDue({ startedAt: service.startedAt, chargedUntil: previous }, until)) {
    const rate = service.powerState === 'STOPPED' ? service.stoppedHourlyMinor : service.priceMinor
    const next = new Date(hour.getTime() + HOUR)
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.hostingService.updateMany({ where: { id: service.id, status: 'ACTIVE', chargedUntil: previous }, data: { chargedUntil: next } })
        if (claimed.count !== 1) throw new Moved()
        let walletTxId: number | null = null
        if (rate > 0n) {
          const moved = await moveWallet({ userId: service.userId, amount: -legacyNumber(rate, currency), currency, type: 'PURCHASE', description: `هزینهٔ ساعتی «${service.label}»`, idempotencyKey: `hosting:usage:${service.id}:${hour.toISOString()}` }, tx)
          if (!moved.ok) throw new Insufficient(moved.message || 'insufficient')
          walletTxId = moved.txId ?? null
        }
        await tx.hostingUsageCharge.create({ data: { serviceId: service.id, userId: service.userId, hourStart: hour, powerState: service.powerState, amountMinor: rate, currency, walletTxId } })
      })
      previous = next
      charged++
    } catch (error) {
      if (error instanceof Moved) break
      if (error instanceof Insufficient) return { charged, suspended: await suspendForBalance(service, now, options.terminateDays ?? 14) }
      throw error
    }
  }
  return { charged, suspended: false }
}

/** Scheduled every few minutes: charges, warns before the money runs out, resumes and terminates. */
export async function runHostingMetering(now = new Date()) {
  const counters = { services: 0, hours: 0, suspended: 0, resumed: 0, warned: 0, terminated: 0, failed: 0 }
  if (!await isModuleEnabled('hosting')) return counters
  const settings = lifecycleSettings(await getModuleSettings('hosting').catch(() => ({} as Record<string, unknown>)))
  const active = await db.hostingService.findMany({ where: { cycle: 'HOURLY', status: 'ACTIVE', startedAt: { not: null } }, select: { id: true }, orderBy: { id: 'asc' }, take: 5000 })
  for (const row of active) {
    counters.services++
    try {
      const result = await chargeHourlyService(row.id, now, { terminateDays: settings.terminateDays })
      counters.hours += result.charged
      if (result.suspended) counters.suspended++
    } catch (error) { counters.failed++; logEvent('error', 'hosting.metering_failed', { serviceId: row.id, error: String(error) }) }
  }

  // Warnings: a customer's hourly services share one wallet, so the runway is the balance over their total rate.
  const live = await db.hostingService.findMany({ where: { cycle: 'HOURLY', status: 'ACTIVE' }, select: { id: true, userId: true, label: true, currency: true, priceMinor: true, stoppedHourlyMinor: true, powerState: true } })
  const byUser = new Map<string, typeof live>()
  for (const service of live) { const key = `${service.userId}:${service.currency}`; byUser.set(key, [...(byUser.get(key) || []), service]) }
  const day = now.toISOString().slice(0, 10)
  for (const services of byUser.values()) {
    const { userId, currency } = services[0]
    const rate = services.reduce((sum, s) => sum + (s.powerState === 'STOPPED' ? s.stoppedHourlyMinor : s.priceMinor), 0n)
    const hours = runwayHours(await balanceOf(userId, currency), rate)
    const level = hours < 3 ? 3 : hours < 24 ? 24 : 0
    if (!level) continue
    counters.warned += await notify(userId, services[0].id, `low-credit:${level}:${day}`, level === 3 ? 'موجودی کیف پول کمتر از ۳ ساعت است' : 'موجودی کیف پول کمتر از یک روز است', `با مصرف فعلی سرویس‌های ساعتی، موجودی حدود ${Math.max(0, hours).toLocaleString('fa-IR')} ساعت کافی است. برای جلوگیری از توقف، کیف پول را شارژ کنید.`)
  }

  const suspended = await db.hostingService.findMany({ where: { cycle: 'HOURLY', status: 'SUSPENDED' }, select: { id: true, userId: true, label: true, status: true, cycle: true, suspendedAt: true, currency: true, priceMinor: true, stoppedHourlyMinor: true, powerState: true } })
  for (const service of suspended) {
    try {
      const rate = service.powerState === 'STOPPED' ? service.stoppedHourlyMinor : service.priceMinor
      const step = hourlyStep({ ...service, unpaidSuspension: await unpaidSuspension(service.id) }, await balanceOf(service.userId, service.currency), rate, now, settings)
      if (!step) continue
      if (step.kind === 'resume') {
        // The suspended time is not charged: billing starts again at this hour.
        const claimed = await db.hostingService.updateMany({ where: { id: service.id, status: 'SUSPENDED', suspendedAt: service.suspendedAt }, data: { status: 'ACTIVE', suspendedAt: null, chargedUntil: floorHour(now) } })
        if (claimed.count !== 1) continue
        await db.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'UNSUSPEND', detail: 'کیف پول شارژ شد', finishedAt: now } })
        counters.resumed++
        await notify(service.userId, service.id, `resumed:${now.getTime()}`, 'سرویس ساعتی شما دوباره فعال شد', `کیف پول شارژ شد و «${service.label}» دوباره روشن است.`)
      } else if (step.kind === 'warn-terminate') counters.warned += await notify(service.userId, service.id, `terminate-warn:${service.suspendedAt?.toISOString()}`, 'سرویس متوقف‌شدهٔ شما به‌زودی حذف می‌شود', `«${service.label}» تا ${step.days.toLocaleString('fa-IR')} روز دیگر حذف می‌شود. برای نگه داشتن، کیف پول را شارژ کنید.`)
      else if (step.kind === 'terminate') {
        const claimed = await db.hostingService.updateMany({ where: { id: service.id, status: 'SUSPENDED', suspendedAt: service.suspendedAt }, data: { status: 'TERMINATED', terminatedAt: now } })
        if (claimed.count !== 1) continue
        await db.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'TERMINATE', detail: 'کیف پول شارژ نشد', finishedAt: now } })
        counters.terminated++
        await notify(service.userId, service.id, 'terminated', 'سرویس ساعتی شما حذف شد', `«${service.label}» به‌دلیل شارژ نشدن کیف پول حذف شد.`)
      }
    } catch (error) { counters.failed++; logEvent('error', 'hosting.metering_failed', { serviceId: service.id, error: String(error) }) }
  }
  return counters
}

// ============ Customer ============

/**
 * The customer deletes their own hourly service: hours that ran are charged (the current one in full), then it is
 * terminated. The typed name must match, since nothing comes back after this.
 */
export async function terminateHourlyByCustomer(userId: number, serviceId: number, confirm: unknown, now = new Date()) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, select: { id: true, status: true, cycle: true, hostname: true, label: true } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404)
  if (service.cycle !== 'HOURLY') throw new HostingRefusal('سرویس دوره‌ای با تمدید نکردن در پایان دوره تمام می‌شود', 409)
  if (service.status === 'TERMINATED') throw new HostingRefusal('این سرویس قبلاً حذف شده است', 409)
  const expected = (service.hostname || service.label).trim().toLowerCase()
  if (String(confirm ?? '').trim().toLowerCase() !== expected) throw new HostingRefusal(`برای حذف، «${service.hostname || service.label}» را دقیقاً بنویسید`, 400, 'CONFIRM')
  await chargeHourlyService(service.id, now, { includeCurrent: true })
  const claimed = await db.hostingService.updateMany({ where: { id: service.id, status: { in: OPEN } }, data: { status: 'TERMINATED', terminatedAt: now } })
  if (claimed.count !== 1) throw new HostingRefusal('وضعیت سرویس همزمان تغییر کرد؛ صفحه را تازه کنید', 409)
  await db.hostingAction.create({ data: { serviceId: service.id, actorId: userId, actor: 'CUSTOMER', kind: 'TERMINATE', detail: 'حذف توسط مشتری', finishedAt: now } })
  await db.hostingAction.updateMany({ where: { serviceId: service.id, status: 'WAITING' }, data: { status: 'DONE', finishedAt: now, detail: 'سرویس حذف شد' } })
  return { status: 'TERMINATED' as const }
}

/** What the service page shows for an hourly service: rates, recent hours, totals and the wallet runway. */
export async function hourlyUsage(userId: number, serviceId: number, now = new Date()) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId, cycle: 'HOURLY' }, select: { id: true, currency: true, priceMinor: true, stoppedHourlyMinor: true, powerState: true, chargedUntil: true, status: true } })
  if (!service) return null
  const since48 = new Date(floorHour(now).getTime() - 47 * HOUR)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [recent, month, day, all, balance, live] = await Promise.all([
    db.hostingUsageCharge.findMany({ where: { serviceId: service.id, hourStart: { gte: since48 } }, select: { hourStart: true, amountMinor: true, powerState: true }, orderBy: { hourStart: 'asc' } }),
    db.hostingUsageCharge.aggregate({ where: { serviceId: service.id, hourStart: { gte: monthStart } }, _sum: { amountMinor: true }, _count: true }),
    db.hostingUsageCharge.aggregate({ where: { serviceId: service.id, hourStart: { gte: new Date(now.getTime() - DAY) } }, _sum: { amountMinor: true } }),
    db.hostingUsageCharge.aggregate({ where: { serviceId: service.id }, _sum: { amountMinor: true }, _count: true }),
    balanceOf(userId, service.currency),
    db.hostingService.findMany({ where: { userId, cycle: 'HOURLY', status: 'ACTIVE', currency: service.currency }, select: { priceMinor: true, stoppedHourlyMinor: true, powerState: true } }),
  ])
  const rate = service.powerState === 'STOPPED' ? service.stoppedHourlyMinor : service.priceMinor
  const totalRate = live.reduce((sum, s) => sum + (s.powerState === 'STOPPED' ? s.stoppedHourlyMinor : s.priceMinor), 0n)
  const runway = runwayHours(balance, totalRate)
  const byHour = new Map(recent.map((row) => [row.hourStart.getTime(), row]))
  return {
    rate: Number(rate), runningRate: Number(service.priceMinor), stoppedRate: Number(service.stoppedHourlyMinor), powerState: service.powerState,
    balance: Number(balance), runwayHours: Number.isFinite(runway) ? runway : null, chargedUntil: service.chargedUntil,
    monthTotal: Number(month._sum.amountMinor ?? 0n), monthHours: month._count, dayTotal: Number(day._sum.amountMinor ?? 0n),
    allTotal: Number(all._sum.amountMinor ?? 0n), allHours: all._count,
    hours: Array.from({ length: 48 }, (_, i) => { const at = since48.getTime() + i * HOUR, row = byHour.get(at); return { at: new Date(at).toISOString(), amount: row ? Number(row.amountMinor) : 0, stopped: row?.powerState === 'STOPPED' } }),
  }
}
