import { db } from '@/platform/database/prisma'
import { enqueueOrderFulfillment, processFulfillmentJob } from './jobs'

const MAX_RECENT_PAID = 500

export async function listFulfillmentOperations() {
  const invoices = await db.invoice.findMany({
    where: { status: 'PAID', orderId: { not: null }, order: { OR: [{ planId: { not: null } }, { productId: { not: null } }] } },
    select: {
      id: true, orderId: true, paidAt: true, currency: true, total: true,
      order: { select: { id: true, status: true, planId: true, productId: true, meta: true, user: { select: { email: true } }, plan: { select: { name: true } }, product: { select: { name: true } } } },
    },
    orderBy: { paidAt: 'desc' },
    take: MAX_RECENT_PAID,
  })
  const orderIds = invoices.map((invoice) => invoice.orderId).filter((id): id is number => id !== null)
  if (!orderIds.length) return { items: [], scanned: 0, limit: MAX_RECENT_PAID }

  const [jobs, subscriptions, reservations] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { orderId: { in: orderIds }, kind: { in: ['PROVISION_SUBSCRIPTION', 'RENEW_SUBSCRIPTION', 'DELIVER_PRODUCT', 'RESELLER_PROVISION', 'GRANT_MEMBERSHIP'] } }, orderBy: { id: 'desc' } }),
    db.subscription.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, status: true, username: true } }),
    db.inventoryReservation.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, status: true } }),
  ])
  const byOrder = new Map<number, typeof jobs[number]>()
  for (const job of jobs) if (job.orderId && !byOrder.has(job.orderId)) byOrder.set(job.orderId, job)
  const provisioned = new Set(subscriptions.filter((sub) => sub.status === 'ACTIVE' && sub.username !== 'pending').map((sub) => sub.orderId))
  const delivered = new Set(reservations.filter((reservation) => reservation.status === 'CONSUMED').map((reservation) => reservation.orderId))

  const items = invoices.flatMap((invoice) => {
    const order = invoice.order
    if (!order || !invoice.orderId) return []
    const job = byOrder.get(invoice.orderId)
    if (job?.status === 'DONE') return []
    if (!job && (order.productId ? delivered.has(order.id) : provisioned.has(order.id) && !isRenewal(order.meta))) return []
    return [{
      orderId: order.id,
      invoiceId: invoice.id,
      user: order.user.email,
      item: order.plan?.name || order.product?.name || '—',
      kind: job?.kind || (order.productId ? 'DELIVER_PRODUCT' : isRenewal(order.meta) ? 'RENEW_SUBSCRIPTION' : 'PROVISION_SUBSCRIPTION'),
      amount: invoice.total,
      currency: invoice.currency,
      paidAt: invoice.paidAt,
      jobId: job?.id || null,
      status: job?.status || 'MISSING',
      attempts: job?.attempts || 0,
      lastAttemptAt: job?.attempts ? job.updatedAt : null,
      nextAttemptAt: job?.status === 'FAILED' || job?.status === 'PENDING' ? job.availableAt : null,
      lastError: order.status === 'PAID' ? safeError(job?.lastError || '') : `Invoice is paid but order status is ${order.status}; investigate before retrying.`,
      lockedAt: job?.lockedAt || null,
      retryable: order.status === 'PAID' && Boolean(job || !isRenewal(order.meta)),
    }]
  })
  return { items, scanned: invoices.length, limit: MAX_RECENT_PAID }
}

export async function listPaymentIssues() {
  const [webhooks, ambiguous] = await Promise.all([
    db.webhookInbox.findMany({ where: { status: 'FAILED' }, select: { id: true, provider: true, attempts: true, lastError: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 25 }),
    db.payment.findMany({ where: { provider: 'FRENZYEX', status: 'PENDING', providerTxnId: '', invoice: { status: 'UNPAID' } }, select: { id: true, invoiceId: true, invoice: { select: { orderId: true } }, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 25 }),
  ])
  return [
    ...webhooks.map((entry) => ({ id: `webhook-${entry.id}`, provider: entry.provider, kind: 'WEBHOOK_FAILED', orderId: null, invoiceId: null, attempts: entry.attempts, reason: safeError(entry.lastError), at: entry.updatedAt })),
    ...ambiguous.map((payment) => ({ id: `payment-${payment.id}`, provider: 'FRENZYEX', kind: 'PAYMENT_UNTRACKED', orderId: payment.invoice?.orderId || null, invoiceId: payment.invoiceId, attempts: 0, reason: 'Payment request has no provider transaction ID; verify it in the merchant panel before any action.', at: payment.createdAt })),
  ]
}

function isRenewal(meta: string) {
  try { return JSON.parse(meta || '{}')?.kind === 'renewal' } catch { return false }
}

function safeError(value: string) {
  return value.slice(0, 500).replace(/https?:\/\/\S+/gi, '[url]').replace(/(?:token|secret|password|key)\s*[:=]\s*\S+/gi, '[redacted]')
}

export async function retryPaidFulfillment(orderId: number) {
  const invoice = await db.invoice.findFirst({ where: { orderId, status: 'PAID' }, select: { id: true, order: { select: { id: true, status: true, planId: true, productId: true } } } })
  if (!invoice?.order || invoice.order.status !== 'PAID' || (!invoice.order.planId && !invoice.order.productId)) {
    return { ok: false as const, message: 'Only a paid service or product order can be retried.' }
  }
  let job = await db.fulfillmentJob.findFirst({ where: { orderId, kind: { in: ['PROVISION_SUBSCRIPTION', 'RENEW_SUBSCRIPTION', 'DELIVER_PRODUCT', 'RESELLER_PROVISION', 'GRANT_MEMBERSHIP'] } }, orderBy: { id: 'desc' } })
  if (!job && invoice.order.planId) {
    const raw = await db.order.findUnique({ where: { id: orderId }, select: { meta: true } })
    if (isRenewal(raw?.meta || '')) return { ok: false as const, message: 'A missing renewal job needs manual investigation to avoid adding time or traffic twice.' }
    const existing = await db.subscription.findFirst({ where: { orderId, status: 'ACTIVE', username: { not: 'pending' } }, select: { id: true } })
    if (existing) return { ok: false as const, message: 'This subscription is already active.' }
  }
  if (!job && invoice.order.productId) {
    const reservation = await db.inventoryReservation.findFirst({ where: { orderId, status: 'CONSUMED' }, select: { status: true } })
    if (reservation?.status === 'CONSUMED') return { ok: false as const, message: 'This product was already delivered.' }
  }
  if (!job) {
    job = await enqueueOrderFulfillment({ orderId, invoiceId: invoice.id, planId: invoice.order.planId, productId: invoice.order.productId })
  }
  if (!job) return { ok: false as const, message: 'No fulfillment work is required.' }
  if (job.status === 'DONE') return { ok: false as const, message: 'Fulfillment has already completed.' }
  if (job.status === 'PROCESSING' && (!job.lockedAt || job.lockedAt.getTime() > Date.now() - 5 * 60_000)) {
    return { ok: false as const, message: 'Fulfillment is already running.' }
  }
  if (job.status === 'FAILED') {
    await db.fulfillmentJob.updateMany({ where: { id: job.id, status: 'FAILED' }, data: { availableAt: new Date() } })
  }
  const result = await processFulfillmentJob(job.id)
  return { ok: result.ok, skipped: 'skipped' in result ? result.skipped : false, message: 'message' in result ? result.message : '', jobId: job.id }
}
