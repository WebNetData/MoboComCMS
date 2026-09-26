import { db } from '@/platform/database/prisma'
import { consumeInventoryReservation, ensureInventoryReservation } from '@/modules/catalog/server/inventory'
import { provisionFromOrder } from '@/modules/subscriptions/server/provision'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { notifySubscriptionReady } from '@/modules/notifications/server/telegram'
import { emitExtensionEvent } from '@/extensions/server/runtime'
import { serverPlugins } from '@/extensions/generated/server-registry'
import { isExtensionEnabled } from '@/extensions/server/state'
import { enqueueExtensionJob, extensionStorage } from '@/extensions/sdk/server'
import { logEvent } from '@/platform/observability/logger'
import { applyPaidRenewal } from '@/modules/subscriptions/server/renewal'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, toMinor } from '@/shared/money'
import { fulfillMembershipOrder, grantGiftForOrder } from '@/modules/membership/server/membership'

export type FulfillmentKind = 'PROVISION_SUBSCRIPTION' | 'RENEW_SUBSCRIPTION' | 'DELIVER_PRODUCT' | 'RESELLER_PROVISION' | 'TRIAL_PROVISION' | 'EXTENSION_JOB' | 'GRANT_MEMBERSHIP'

type JobPayload = Record<string, unknown>

export async function enqueueOrderFulfillment(input: {
  orderId: number
  invoiceId?: number | null
  planId?: number | null
  productId?: number | null
  productHoldMinutes?: number
}) {
  if (input.productId) {
    const order = await db.order.findUnique({ where: { id: input.orderId }, select: { meta: true } })
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(order?.meta || '{}') } catch {}
    const reserved = await ensureInventoryReservation({
      orderId: input.orderId,
      productId: input.productId,
      variantId: Number(meta.variantId) || null,
      holdMinutes: input.productHoldMinutes ?? 60,
    })
    if (!reserved.ok) throw new Error(reserved.message || 'out of stock')
    return enqueueFulfillment({
      kind: 'DELIVER_PRODUCT',
      dedupeKey: `DELIVER_PRODUCT:order:${input.orderId}`,
      orderId: input.orderId,
      invoiceId: input.invoiceId ?? null,
    })
  }
  if (input.planId) {
    const order = await db.order.findUnique({ where: { id: input.orderId }, select: { meta: true } })
    let renewal: Record<string, unknown> = {}
    try { renewal = JSON.parse(order?.meta || '{}') } catch {}
    if (renewal.kind === 'renewal' && Number(renewal.subscriptionId)) {
      return enqueueFulfillment({ kind: 'RENEW_SUBSCRIPTION', dedupeKey: `RENEW_SUBSCRIPTION:order:${input.orderId}`, orderId: input.orderId, invoiceId: input.invoiceId, subscriptionId: Number(renewal.subscriptionId), payload: renewal })
    }
    return enqueueFulfillment({
      kind: 'PROVISION_SUBSCRIPTION',
      dedupeKey: `PROVISION_SUBSCRIPTION:order:${input.orderId}`,
      orderId: input.orderId,
      invoiceId: input.invoiceId ?? null,
    })
  }
  // VIP membership orders carry neither a plan nor a product.
  const order = await db.order.findUnique({ where: { id: input.orderId }, select: { meta: true } })
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(order?.meta || '{}') } catch {}
  if (meta.kind === 'membership') {
    return enqueueFulfillment({ kind: 'GRANT_MEMBERSHIP', dedupeKey: `GRANT_MEMBERSHIP:order:${input.orderId}`, orderId: input.orderId, invoiceId: input.invoiceId ?? null })
  }
  return null
}

export async function enqueueFulfillment(input: {
  kind: FulfillmentKind
  dedupeKey: string
  payload?: JobPayload
  orderId?: number | null
  invoiceId?: number | null
  subscriptionId?: number | null
}) {
  return db.fulfillmentJob.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      payload: JSON.stringify(input.payload || {}),
      orderId: input.orderId ?? null,
      invoiceId: input.invoiceId ?? null,
      subscriptionId: input.subscriptionId ?? null,
    },
    update: {},
  })
}

function retryDelayMs(attempts: number) {
  return Math.min(60 * 60_000, 15_000 * 2 ** Math.min(8, Math.max(0, attempts - 1)))
}

async function handle(job: { id: number; kind: string; orderId: number | null; subscriptionId: number | null; payload: string }) {
  let payload: JobPayload = {}
  try { payload = JSON.parse(job.payload || '{}') } catch {}

  if (job.kind === 'EXTENSION_JOB') {
    const pluginId = String(payload.pluginId || '')
    const jobName = String(payload.jobName || '')
    const jobPayload = payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload) ? payload.payload as Record<string, unknown> : {}
    const plugin = serverPlugins[pluginId]
    const handler = plugin?.jobs?.[jobName]
    if (!plugin || !handler || !(await isExtensionEnabled(pluginId))) throw new Error('extension job handler unavailable')
    await handler(jobPayload, { pluginId, storage: extensionStorage(pluginId), enqueueJob: (nextName, nextPayload, dedupeKey) => enqueueExtensionJob(pluginId, nextName, nextPayload, dedupeKey) })
    return
  }

  if (job.kind === 'DELIVER_PRODUCT') {
    if (!job.orderId) throw new Error('product delivery job has no orderId')
    const result = await consumeInventoryReservation(job.orderId)
    if (!result.ok) throw new Error(result.message || 'inventory delivery failed')
    const order = await db.order.findUnique({ where: { id: job.orderId }, select: { meta: true } })
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(order?.meta || '{}') } catch {}
    await db.productDelivery.upsert({ where: { orderId: job.orderId }, create: { orderId: job.orderId, address: meta.shippingAddress ? JSON.stringify(meta.shippingAddress) : '' }, update: {} })
    await grantGiftForOrder(job.orderId).catch((error) => logEvent('error', 'membership.gift_failed', { orderId: job.orderId, error }))
    return
  }

  if (job.kind === 'GRANT_MEMBERSHIP') {
    if (!job.orderId) throw new Error('membership job has no orderId')
    await fulfillMembershipOrder(job.orderId)
    return
  }

  if (job.kind === 'PROVISION_SUBSCRIPTION') {
    if (!job.orderId) throw new Error('provision job has no orderId')
    const order = await db.order.findUnique({ where: { id: job.orderId } })
    if (!order?.planId) throw new Error('order/plan not found')
    const existing = await db.subscription.findFirst({ where: { orderId: order.id } })
    if (existing && existing.status === 'ACTIVE' && existing.username !== 'pending') return
    const result = await provisionFromOrder({ orderId: order.id, userId: order.userId, planId: order.planId })
    if (!result.ok) throw new Error(result.message || 'provisioning failed')
    await grantGiftForOrder(order.id).catch((error) => logEvent('error', 'membership.gift_failed', { orderId: order.id, error }))
    return
  }

  if (job.kind === 'RESELLER_PROVISION') {
    if (!job.orderId) throw new Error('reseller provision job has no orderId')
    const order = await db.order.findUnique({ where: { id: job.orderId } })
    const customerUserId = Number(payload.customerUserId)
    const resellerId = Number(payload.resellerId)
    const planId = Number(payload.planId || order?.planId)
    if (!order || !customerUserId || !resellerId || !planId) throw new Error('reseller provision payload is incomplete')
    const existing = await db.subscription.findFirst({ where: { orderId: order.id } })
    if (existing && existing.status === 'ACTIVE' && existing.username !== 'pending') {
      const { deliverResellerSale } = await import('@/modules/reseller/server/reseller-bot-sales')
      await deliverResellerSale(order.id).catch(() => {})
      return
    }
    const { provisionSubscription } = await import('@/modules/subscriptions/server/provision')
    const result = await provisionSubscription({
      userId: customerUserId,
      planId,
      orderId: order.id,
      username: typeof payload.username === 'string' ? payload.username : undefined,
      resellerId,
      trafficGB: Number(payload.trafficGB),
      days: Number(payload.days),
      deviceLimit: Number(payload.deviceLimit),
    })
    if (!result.ok || !result.subscriptionId) throw new Error(result.message || 'reseller provisioning failed')
    await notifySubscriptionReady(result.subscriptionId).catch(() => {})
    const { deliverResellerSale } = await import('@/modules/reseller/server/reseller-bot-sales')
    await deliverResellerSale(order.id).catch(() => {})
    return
  }

  if (job.kind === 'TRIAL_PROVISION') {
    if (!job.orderId) throw new Error('trial job has no orderId')
    const claim = await db.trialClaim.findUnique({ where: { orderId: job.orderId } })
    const order = await db.order.findUnique({ where: { id: job.orderId } })
    if (!claim || !order?.planId || order.userId !== claim.userId || order.status !== 'PAID') throw new Error('trial claim is invalid')
    let terms: { trafficGB?: number; days?: number; deviceLimit?: number } = {}
    try { terms = JSON.parse(order.meta || '{}') } catch {}
    const { provisionSubscription } = await import('@/modules/subscriptions/server/provision')
    const result = await provisionSubscription({ userId: claim.userId, planId: order.planId, orderId: order.id, trafficGB: Number(terms.trafficGB), days: Number(terms.days), deviceLimit: Number(terms.deviceLimit) })
    if (!result.ok || !result.subscriptionId) throw new Error(result.message || 'trial provisioning failed')
    await db.trialClaim.update({ where: { id: claim.id }, data: { status: 'ACTIVE', subscriptionId: result.subscriptionId } })
    return
  }

  if (job.kind === 'RENEW_SUBSCRIPTION') {
    const subId = await applyPaidRenewal(job)
    await notifySubscriptionReady(subId, 'renewed').catch(() => {})
    return
  }

  throw new Error(`unknown fulfillment kind: ${job.kind}`)
}

/** Claim a job with a lease so crashed workers become retryable. */
export async function processFulfillmentJob(jobId: number) {
  const leaseCutoff = new Date(Date.now() - 5 * 60_000)
  const claim = await db.fulfillmentJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: new Date() } },
        { status: 'PROCESSING', lockedAt: { lt: leaseCutoff } },
      ],
    },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 }, lastError: '' },
  })
  if (claim.count !== 1) return { ok: true as const, skipped: true }

  const job = await db.fulfillmentJob.findUnique({ where: { id: jobId } })
  if (!job) return { ok: false as const, message: 'job disappeared' }
  try {
    await handle(job)
    await db.fulfillmentJob.update({ where: { id: job.id }, data: { status: 'DONE', completedAt: new Date(), lockedAt: null, lastError: '' } })
    logEvent('info', 'fulfillment.completed', { jobId: job.id, kind: job.kind, orderId: job.orderId, invoiceId: job.invoiceId, subscriptionId: job.subscriptionId, attempts: job.attempts })
    await emitExtensionEvent('fulfillment.completed', { jobId: job.id, kind: job.kind, orderId: job.orderId, invoiceId: job.invoiceId, subscriptionId: job.subscriptionId })
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.fulfillmentJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lockedAt: null, lastError: message.slice(0, 2000), availableAt: new Date(Date.now() + retryDelayMs(job.attempts)) },
    })
    if (job.invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: job.invoiceId }, select: { number: true, userId: true, status: true } }).catch(() => null)
      if (invoice?.status === 'PAID') await createInboxEvent({
        userId: invoice.userId, kind: 'DELIVERY_DELAYED', dedupeKey: `fulfillment:${job.id}:delayed`,
        titleEn: 'Service activation delayed', titleFa: 'فعال‌سازی سرویس با تأخیر روبه‌رو شد',
        bodyEn: `Payment for invoice ${invoice.number} is confirmed. We are retrying delivery.`,
        bodyFa: `پرداخت فاکتور ${invoice.number} تأیید شده است. تحویل سرویس دوباره تلاش می‌شود.`,
        href: `/invoice/${encodeURIComponent(invoice.number)}`,
      }).catch(() => {})
    }
    logEvent('error', 'fulfillment.failed', { jobId: job.id, kind: job.kind, orderId: job.orderId, invoiceId: job.invoiceId, subscriptionId: job.subscriptionId, attempts: job.attempts, error })
    return { ok: false as const, message }
  }
}

export async function processFulfillmentBatch(limit = 20) {
  const cutoff = new Date(Date.now() - 5 * 60_000)
  const jobs = await db.fulfillmentJob.findMany({
    where: {
      OR: [
        { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: new Date() } },
        { status: 'PROCESSING', lockedAt: { lt: cutoff } },
      ],
    },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(100, limit)),
  })
  let done = 0
  let failed = 0
  for (const job of jobs) {
    const result = await processFulfillmentJob(job.id)
    if (result.ok) done++
    else failed++
  }
  return { checked: jobs.length, done, failed }
}

/** Heal the gap if a webhook committed payment but crashed before enqueueing delivery. */
export async function recoverMissingPaidFulfillment(limit = 20) {
  const paid = await db.invoice.findMany({
    where: { status: 'PAID', orderId: { not: null }, OR: [{ planId: { not: null } }, { productId: { not: null } }] },
    orderBy: { id: 'desc' }, take: 500,
    select: { id: true, orderId: true, planId: true, productId: true },
  })
  const orderIds = paid.map(invoice => invoice.orderId).filter((id): id is number => id !== null)
  const [jobs, subscriptions] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true } }),
    db.subscription.findMany({ where: { orderId: { in: orderIds }, status: 'ACTIVE', username: { not: 'pending' } }, select: { orderId: true } }),
  ])
  const covered = new Set([...jobs.map(job => job.orderId), ...subscriptions.map(sub => sub.orderId)])
  let enqueued = 0
  let failed = 0
  for (const invoice of paid) {
    if (enqueued + failed >= Math.max(1, Math.min(limit, 100))) break
    if (!invoice.orderId || covered.has(invoice.orderId)) continue
    try {
      await enqueueOrderFulfillment({ orderId: invoice.orderId, invoiceId: invoice.id, planId: invoice.planId, productId: invoice.productId })
      covered.add(invoice.orderId)
      enqueued++
    } catch (error) {
      failed++
      logEvent('error', 'fulfillment.recovery_failed', { invoiceId: invoice.id, orderId: invoice.orderId, error })
    }
  }
  return { checked: paid.length, enqueued, failed }
}

/** A paid top-up must not remain uncredited after a callback interruption. */
export async function recoverPaidWalletTopups(limit = 20) {
  const invoices = await db.invoice.findMany({ where: { status: 'PAID', kind: 'WALLET_TOPUP' }, orderBy: { id: 'desc' }, take: 500, select: { id: true, number: true, userId: true, total: true, totalMinor: true, currency: true } })
  const ledger = await db.walletTx.findMany({ where: { invoiceId: { in: invoices.map(invoice => invoice.id) }, type: 'TOPUP' }, select: { id: true, invoiceId: true, status: true } })
  const byInvoice = new Map<number | null, typeof ledger[number]>()
  for (const tx of ledger) if (tx.status === 'DONE' || !byInvoice.has(tx.invoiceId)) byInvoice.set(tx.invoiceId, tx)
  let credited = 0
  let failed = 0
  for (const invoice of invoices) {
    if (credited + failed >= Math.max(1, Math.min(limit, 100))) break
    const pending = byInvoice.get(invoice.id)
    if (pending?.status === 'DONE') continue
    try {
      const result = await moveWallet({
        userId: invoice.userId, amount: legacyNumber(invoice.totalMinor || toMinor(invoice.total, invoice.currency), invoice.currency), currency: invoice.currency,
        type: 'TOPUP', description: `Wallet top-up ${invoice.number}`, invoiceId: invoice.id,
        txId: pending?.status === 'PENDING' ? pending.id : null,
        idempotencyKey: pending?.status === 'PENDING' ? undefined : `wallet-topup-invoice:${invoice.id}`,
      })
      if (!result.ok) throw new Error(result.message || 'top-up credit failed')
      credited++
    } catch (error) { failed++; logEvent('error', 'wallet.topup_recovery_failed', { invoiceId: invoice.id, error }) }
  }
  return { checked: invoices.length, credited, failed }
}
