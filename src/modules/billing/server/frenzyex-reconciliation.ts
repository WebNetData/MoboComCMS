import { db } from '@/platform/database/prisma'
import { cancelFrenzyPayment, getFrenzyPayment, type FrenzyPaymentSnapshot } from '@/modules/billing/infrastructure/frenzyex'
import { invoiceDueMinor, markInvoicePaid, releaseInvoiceCredit } from '@/modules/billing/server/billing'
import { releaseInventoryReservation } from '@/modules/catalog/server/inventory'
import { enqueueOrderFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { logEvent } from '@/platform/observability/logger'

type ReconcileMeta = {
  attempts?: number
  nextAt?: string
  lastCheckedAt?: string
  lastStatus?: string
  lastError?: string
}

type PendingRaw = Record<string, unknown> & { reconcile?: ReconcileMeta; expiresAt?: string }

function parseRaw(raw: string): PendingRaw {
  try {
    const value = JSON.parse(raw || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as PendingRaw : {}
  } catch {
    return {}
  }
}

function validDate(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isFinite(date.getTime()) ? date : null
}

function retryBackoffMs(attempts: number) {
  return Math.min(5 * 60_000, 30_000 * 2 ** Math.min(4, Math.max(0, attempts - 1)))
}

async function updateRequestRecord(payment: { id: number; raw: string }, patch: ReconcileMeta, status?: 'PENDING' | 'PROCESSED' | 'FAILED') {
  const raw = parseRaw(payment.raw)
  await db.payment.update({
    where: { id: payment.id },
    data: {
      raw: JSON.stringify({ ...raw, reconcile: { ...(raw.reconcile || {}), ...patch } }),
      ...(status ? { status } : {}),
    },
  })
}

function frenzyApiKey(invoice: { gateway: { apiKey: string } | null }) {
  return String(invoice.gateway?.apiKey || process.env.FRENZYEX_API_KEY || '').trim()
}

function expectedRequest(invoiceId: number, requestId: string) {
  return db.payment.findFirst({
    where: {
      invoiceId,
      provider: 'FRENZYEX',
      status: 'PENDING',
      OR: [{ providerTxnId: requestId }, { providerTxnId: '' }],
    },
    orderBy: { id: 'asc' },
  })
}

export function validateFrenzySnapshot(input: {
  invoice: { number: string; providerTxnId: string }
  expected: { amountMinor: bigint; currency: string; providerTxnId: string }
  requestId: string
  snapshot: FrenzyPaymentSnapshot
}) {
  const { invoice, expected, requestId, snapshot } = input
  if (!snapshot.requestId || snapshot.requestId !== requestId) return { ok: false as const, message: 'request_id mismatch' }
  if (invoice.providerTxnId && invoice.providerTxnId !== requestId) return { ok: false as const, message: 'request_id mismatch' }
  if (expected.providerTxnId && expected.providerTxnId !== requestId) return { ok: false as const, message: 'request_id mismatch' }
  if (!snapshot.orderRef || snapshot.orderRef !== invoice.number) return { ok: false as const, message: 'order_ref mismatch' }
  let currency: string
  try { currency = normalizeCurrency(snapshot.amountCcy) } catch { return { ok: false as const, message: 'invalid provider currency' } }
  if (currency !== 'TMN' || currency !== normalizeCurrency(expected.currency)) return { ok: false as const, message: 'provider currency mismatch' }
  let amountMinor: bigint
  try { amountMinor = toMinor(snapshot.amount, currency) } catch { return { ok: false as const, message: 'invalid provider amount' } }
  if (amountMinor !== expected.amountMinor) return { ok: false as const, message: 'provider amount mismatch' }
  return { ok: true as const, currency, amountMinor }
}

/**
 * Shared paid settlement for a signed callback or authenticated status poll.
 * The request/order/amount/currency are verified before financial state changes.
 */
export async function settleFrenzyInvoice(input: {
  invoiceId: number
  requestId: string
  snapshot: FrenzyPaymentSnapshot
  source: 'callback' | 'reconciliation'
  audit?: Record<string, unknown>
}) {
  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { gateway: true, order: true },
  })
  if (!invoice) return { ok: false as const, message: 'invoice not found' }
  if (invoice.gateway?.provider && invoice.gateway.provider !== 'FRENZYEX') return { ok: false as const, message: 'invoice gateway mismatch' }
  if (invoice.status === 'VOID' || invoice.status === 'REFUNDED') return { ok: false as const, message: `invoice is ${invoice.status}` }
  if (input.snapshot.status !== 'paid') return { ok: false as const, message: `provider status is ${input.snapshot.status || 'unknown'}` }

  const expected = await expectedRequest(invoice.id, input.requestId)
  if (!expected) {
    if (invoice.status === 'PAID') return { ok: true as const, alreadyPaid: true, invoiceId: invoice.id }
    return { ok: false as const, message: 'payment request was not persisted for reconciliation' }
  }
  const checked = validateFrenzySnapshot({ invoice, expected, requestId: input.requestId, snapshot: input.snapshot })
  if (!checked.ok) return checked

  if (!expected.providerTxnId) {
    const bound = await db.payment.updateMany({ where: { id: expected.id, providerTxnId: '' }, data: { providerTxnId: input.requestId } })
    if (bound.count !== 1) {
      const fresh = await db.payment.findUnique({ where: { id: expected.id }, select: { providerTxnId: true } })
      if (fresh?.providerTxnId !== input.requestId) return { ok: false as const, message: 'payment request already bound to another request_id' }
    }
  }
  await db.invoice.updateMany({ where: { id: invoice.id, providerTxnId: '' }, data: { providerTxnId: input.requestId } })
  if (invoice.orderId) await db.order.updateMany({ where: { id: invoice.orderId, providerTxnId: '' }, data: { providerTxnId: input.requestId } })

  const dueMinor = invoiceDueMinor({ totalMinor: invoice.totalMinor, walletAppliedMinor: invoice.walletAppliedMinor })
  const settlement = await markInvoicePaid({
    invoiceId: invoice.id,
    gatewayId: invoice.gatewayId,
    providerTxnId: input.requestId,
    amount: legacyNumber(dueMinor, invoice.currency),
    provider: 'FRENZYEX',
    raw: {
      source: `frenzyex-${input.source}`,
      providerAmount: input.snapshot.amount,
      providerCurrency: checked.currency,
      payCurrency: input.snapshot.payCurrency,
      txHash: input.snapshot.txHash,
      providerRaw: input.snapshot.raw,
      ...(input.audit || {}),
    },
  })
  if (!settlement.ok) return { ok: false as const, message: settlement.message || 'invoice settlement failed' }

  if (invoice.kind === 'WALLET_TOPUP') {
    // Reuse the durable pending top-up row when possible. If an operator had
    // already marked that row failed, use a fixed idempotency key instead.
    const ledger = await db.walletTx.findFirst({ where: { invoiceId: invoice.id, type: 'TOPUP' }, orderBy: { id: 'desc' } })
    const reusableTxId = ledger && ledger.status !== 'FAILED' ? ledger.id : null
    const credit = await moveWallet({
      userId: invoice.userId,
      amount: legacyNumber(invoice.totalMinor, invoice.currency),
      currency: invoice.currency,
      type: 'TOPUP',
      description: `Wallet top-up ${invoice.number}`,
      invoiceId: invoice.id,
      txId: reusableTxId,
      idempotencyKey: reusableTxId ? undefined : `wallet-topup-invoice:${invoice.id}`,
    })
    if (!credit.ok) return { ok: false as const, message: credit.message || 'wallet top-up failed' }
  } else if (invoice.orderId) {
    const job = await enqueueOrderFulfillment({ orderId: invoice.orderId, invoiceId: invoice.id, planId: invoice.planId, productId: invoice.productId })
    if (job) await processFulfillmentJob(job.id)
  }

  // Provider-request rows are operational evidence, not another money receipt.
  // Keep only markInvoicePaid's financial row CONFIRMED so reports do not double count.
  await updateRequestRecord(expected, {
    lastCheckedAt: new Date().toISOString(),
    lastStatus: 'paid',
    lastError: '',
    nextAt: '',
  }, 'PROCESSED').catch(() => {})

  logEvent('info', 'payment.frenzyex_reconciled_paid', { invoiceId: invoice.id, orderId: invoice.orderId, requestId: input.requestId, source: input.source })
  return { ok: true as const, alreadyPaid: Boolean(settlement.alreadyPaid), invoiceId: invoice.id }
}

async function closeTerminalInvoice(input: {
  invoice: any
  expected: any
  requestId: string
  status: 'expired' | 'canceled'
  snapshot: FrenzyPaymentSnapshot
}) {
  const { invoice, expected, requestId, status, snapshot } = input
  if (!invoice || invoice.status !== 'UNPAID') return { ok: true as const, skipped: true }
  const checked = validateFrenzySnapshot({ invoice, expected, requestId, snapshot })
  if (!checked.ok) return checked

  const credit = await releaseInvoiceCredit(invoice.id, `FrenzyEx ${status}: ${invoice.number}`)
  if (!credit.ok && credit.message !== 'a paid invoice keeps its credit') return { ok: false as const, message: credit.message || 'wallet credit release failed' }
  if (invoice.orderId) await releaseInventoryReservation(invoice.orderId)

  const changed = await db.invoice.updateMany({ where: { id: invoice.id, status: 'UNPAID' }, data: { status: 'VOID', paymentUrl: '' } })
  if (changed.count === 1 && invoice.orderId) {
    await db.order.updateMany({ where: { id: invoice.orderId, status: 'PENDING' }, data: { status: 'FAILED', paymentUrl: '' } })
  }
  if (invoice.kind === 'WALLET_TOPUP') {
    await db.walletTx.updateMany({ where: { invoiceId: invoice.id, type: 'TOPUP', status: 'PENDING' }, data: { status: 'FAILED' } })
  }
  await updateRequestRecord(expected, {
    lastCheckedAt: new Date().toISOString(),
    lastStatus: status,
    lastError: '',
    nextAt: '',
  }, 'FAILED').catch(() => {})
  logEvent('info', 'payment.frenzyex_terminal', { invoiceId: invoice.id, orderId: invoice.orderId, requestId, status })
  return { ok: true as const, terminal: status }
}

async function reconcileOne(payment: any) {
  const invoice = payment.invoice
  if (!invoice || invoice.status !== 'UNPAID') return { kind: 'skipped' as const }
  const requestId = String(payment.providerTxnId || invoice.providerTxnId || '').trim()
  if (!requestId) return { kind: 'untracked' as const }
  const apiKey = frenzyApiKey(invoice)
  if (!apiKey) {
    await updateRequestRecord(payment, { lastCheckedAt: new Date().toISOString(), lastError: 'FrenzyEx API key is missing', nextAt: new Date(Date.now() + 5 * 60_000).toISOString() })
    return { kind: 'failed' as const, message: 'API key missing' }
  }

  const attempt = Number(parseRaw(payment.raw).reconcile?.attempts || 0) + 1
  const statusResult = await getFrenzyPayment(apiKey, requestId)
  if (!statusResult.ok || !statusResult.snapshot) {
    const delay = statusResult.retryable ? retryBackoffMs(attempt) : 5 * 60_000
    await updateRequestRecord(payment, {
      attempts: attempt,
      lastCheckedAt: new Date().toISOString(),
      lastError: statusResult.message || 'status lookup failed',
      nextAt: new Date(Date.now() + delay).toISOString(),
    })
    logEvent(statusResult.retryable ? 'warn' : 'error', 'payment.frenzyex_reconcile_failed', { invoiceId: invoice.id, requestId, statusCode: statusResult.statusCode, error: statusResult.message })
    return { kind: 'failed' as const, message: statusResult.message || 'status lookup failed' }
  }

  const snapshot = statusResult.snapshot
  const checked = validateFrenzySnapshot({ invoice, expected: payment, requestId, snapshot })
  if (!checked.ok) {
    await updateRequestRecord(payment, {
      attempts: attempt,
      lastCheckedAt: new Date().toISOString(),
      lastStatus: snapshot.status,
      lastError: checked.message,
      nextAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    logEvent('error', 'payment.frenzyex_reconcile_identity_mismatch', { invoiceId: invoice.id, requestId, error: checked.message })
    return { kind: 'failed' as const, message: checked.message }
  }

  if (snapshot.status === 'paid') {
    const settled = await settleFrenzyInvoice({ invoiceId: invoice.id, requestId, snapshot, source: 'reconciliation' })
    return settled.ok ? { kind: 'paid' as const } : { kind: 'failed' as const, message: settled.message }
  }
  if (snapshot.status === 'expired' || snapshot.status === 'canceled') {
    const closed = await closeTerminalInvoice({ invoice, expected: payment, requestId, status: snapshot.status, snapshot })
    return closed.ok ? { kind: snapshot.status as 'expired' | 'canceled' } : { kind: 'failed' as const, message: closed.message }
  }

  // If provider expiry passed while it still reports pending, request a controlled
  // cancel. A 409 is a state conflict, so re-read status instead of assuming failure.
  const raw = parseRaw(payment.raw)
  const expiresAt = validDate(snapshot.expiresAt || raw.expiresAt)
  if (snapshot.status === 'pending' && expiresAt && expiresAt.getTime() <= Date.now()) {
    const canceled = await cancelFrenzyPayment(apiKey, requestId)
    if (canceled.ok && canceled.snapshot) {
      if (canceled.snapshot.status === 'paid') {
        const settled = await settleFrenzyInvoice({ invoiceId: invoice.id, requestId, snapshot: canceled.snapshot, source: 'reconciliation', audit: { cancelRace: true } })
        return settled.ok ? { kind: 'paid' as const } : { kind: 'failed' as const, message: settled.message }
      }
      if (canceled.snapshot.status === 'expired' || canceled.snapshot.status === 'canceled') {
        const terminal = canceled.snapshot.status as 'expired' | 'canceled'
        const closed = await closeTerminalInvoice({ invoice, expected: payment, requestId, status: terminal, snapshot: canceled.snapshot })
        return closed.ok ? { kind: terminal } : { kind: 'failed' as const, message: closed.message }
      }
    }
    if (canceled.statusCode === 409) {
      const fresh = await getFrenzyPayment(apiKey, requestId)
      if (fresh.ok && fresh.snapshot?.status === 'paid') {
        const settled = await settleFrenzyInvoice({ invoiceId: invoice.id, requestId, snapshot: fresh.snapshot, source: 'reconciliation', audit: { cancelConflict: true } })
        return settled.ok ? { kind: 'paid' as const } : { kind: 'failed' as const, message: settled.message }
      }
      if (fresh.ok && fresh.snapshot && (fresh.snapshot.status === 'expired' || fresh.snapshot.status === 'canceled')) {
        const terminal = fresh.snapshot.status as 'expired' | 'canceled'
        const closed = await closeTerminalInvoice({ invoice, expected: payment, requestId, status: terminal, snapshot: fresh.snapshot })
        return closed.ok ? { kind: terminal } : { kind: 'failed' as const, message: closed.message }
      }
    }
  }

  await updateRequestRecord(payment, {
    attempts: attempt,
    lastCheckedAt: new Date().toISOString(),
    lastStatus: snapshot.status || 'pending',
    lastError: '',
    nextAt: new Date(Date.now() + 60_000).toISOString(),
  })
  return { kind: 'pending' as const }
}

/**
 * Recovers delayed/lost callbacks by polling persisted request_ids. POST create
 * is never retried here: an ambiguous create without request_id remains flagged
 * for manual review, preventing duplicate customer checkouts.
 */
export async function processFrenzyReconciliationBatch(limit = 20) {
  const max = Math.max(1, Math.min(100, Math.floor(limit || 20)))
  const where = { provider: 'FRENZYEX', status: 'PENDING', invoiceId: { not: null }, invoice: { status: 'UNPAID' } }
  const counters = { checked: 0, paid: 0, pending: 0, expired: 0, canceled: 0, failed: 0, untracked: 0, deferred: 0 }

  // Every pending request is looked at (in id pages), so requests that are not
  // due yet or cannot be polled never hide the ones that are. The due requests
  // that waited longest since their last check go first.
  const due: { id: number; lastCheckedAt: number }[] = []
  for (let after = 0, pages = 0; pages < 20; pages++) {
    const page = await db.payment.findMany({
      where: { ...where, id: { gt: after } },
      select: { id: true, raw: true, providerTxnId: true, invoice: { select: { providerTxnId: true } } },
      orderBy: { id: 'asc' }, take: 500,
    })
    if (!page.length) break
    after = page[page.length - 1].id
    for (const payment of page) {
      const reconcile = parseRaw(payment.raw).reconcile
      const nextAt = validDate(reconcile?.nextAt)
      if (nextAt && nextAt.getTime() > Date.now()) { counters.deferred++; continue }
      if (!String(payment.providerTxnId || payment.invoice?.providerTxnId || '').trim()) { counters.untracked++; continue }
      due.push({ id: payment.id, lastCheckedAt: validDate(reconcile?.lastCheckedAt)?.getTime() || 0 })
    }
    if (page.length < 500) break
  }
  due.sort((a, b) => a.lastCheckedAt - b.lastCheckedAt || a.id - b.id)

  for (const { id } of due.slice(0, max)) {
    // Re-read: a callback may have settled it since the scan.
    const payment = await db.payment.findFirst({ where: { ...where, id }, include: { invoice: { include: { gateway: true, order: true } } } })
    if (!payment) continue
    counters.checked++
    try {
      const result = await reconcileOne(payment)
      if (result.kind in counters) (counters as any)[result.kind]++
      else counters.failed++
    } catch (error) {
      // One request that cannot be reconciled must not stop the others or the rest of the order worker.
      counters.failed++
      logEvent('error', 'payment.frenzyex_reconcile_crashed', { paymentId: payment.id, invoiceId: payment.invoiceId, error: String(error) })
    }
  }

  const ambiguousUntracked = await db.payment.count({
    where: { provider: 'FRENZYEX', status: 'PENDING', providerTxnId: '', invoice: { status: 'UNPAID' } },
  })
  counters.untracked = Math.max(counters.untracked, ambiguousUntracked)
  return counters
}
