import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { createInvoiceForOrder, releaseInvoiceCredit, voidOpenInvoice } from '@/modules/billing/server/billing'
import { releaseInventoryReservation } from '@/modules/catalog/server/inventory'
import { loadRates } from '@/modules/fx/server/fx'
import { tomanRate } from '@/modules/fx/domain/fx'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import {
  closeMessage, fxJump, nextRun, normalizeInvoiceRules, parseFxRates, intervalOf,
  type CloseAction, type InvoiceRules,
} from '@/modules/billing/domain/invoice-rules'

// Invoices after they are issued: rate-bound invoices that close when their time runs out or the rate jumps, unpaid
// invoices left long past due, and invoices staff issue on a schedule. The scheduler runs processInvoiceRules each minute.

const RULES_KEY = 'billing.invoice-rules.v1'

export async function getInvoiceRules(): Promise<InvoiceRules> {
  return normalizeInvoiceRules(await readJsonSetting(RULES_KEY).catch(() => undefined))
}

export async function saveInvoiceRules(input: unknown) {
  const rules = normalizeInvoiceRules(input)
  await writeJsonSetting(RULES_KEY, rules)
  return rules
}

/**
 * Marks an invoice whose price followed exchange rates: the rate of each currency now, and the time it closes.
 * Called by checkout after the invoice exists; it never fails the purchase.
 */
export async function stampFxInvoice(invoiceId: number, codes: string[]) {
  const wanted = [...new Set(codes.map((code) => String(code || '').toUpperCase()).filter((code) => /^[A-Z]{3,4}$/.test(code)))]
  if (!wanted.length) return
  try {
    const [rates, rules] = await Promise.all([loadRates(), getInvoiceRules()])
    const snapshot = Object.fromEntries(wanted.map((code) => [code, tomanRate(code, rates)]).filter(([, rate]) => typeof rate === 'number' && rate > 0))
    await db.invoice.updateMany({
      where: { id: invoiceId, status: { in: ['UNPAID', 'DRAFT'] }, fxRates: '' },
      data: { fxRates: JSON.stringify(snapshot), ...(rules.fxHours > 0 ? { expiresAt: new Date(Date.now() + rules.fxHours * 3_600_000) } : {}) },
    })
  } catch (error) { logEvent('error', 'invoice.fx_stamp_failed', { invoiceId, error }) }
}

type Closable = { id: number; number: string; userId: number; orderId: number | null; status: string; fxRates?: string }

/** Where the customer can order again after an invoice was closed. */
async function againHref(orderId: number | null) {
  if (!orderId) return '/dashboard/invoices'
  const order = await db.order.findUnique({ where: { id: orderId }, select: { meta: true } })
  let kind = ''
  try { kind = String(JSON.parse(order?.meta || '{}').kind || '') } catch { kind = '' }
  return kind === 'form' ? '/dashboard/requests' : '/dashboard/invoices'
}

/**
 * Closes an unpaid invoice under a rule. An invoice with a transfer receipt waiting for staff is left alone (the customer
 * has paid; staff decide). The claim is the same as a hand void, so a payment settling at this instant wins or loses cleanly:
 * a late bank payment is reversed by the gateway route, a wallet credit goes back to the wallet.
 */
export async function closeInvoice(invoice: Closable, reason: 'FX_RATE' | 'EXPIRED' | 'OVERDUE', action: CloseAction, jump?: { code: string; from: number; to: number } | null) {
  if (!['UNPAID', 'DRAFT'].includes(invoice.status)) return false
  const waiting = await db.paymentReceipt.count({ where: { invoiceId: invoice.id, status: 'PENDING' } })
  if (waiting) return false
  const closed = await voidOpenInvoice(invoice.id, `credit released ${invoice.number} (closed: ${reason})`)
  if (!closed.voided) return false
  await db.invoice.update({ where: { id: invoice.id }, data: { closedReason: reason } }).catch(() => undefined)
  if (invoice.orderId) {
    await releaseInventoryReservation(invoice.orderId).catch(() => undefined)
    await db.order.updateMany({ where: { id: invoice.orderId, status: { notIn: ['PAID', 'REFUNDED'] } }, data: { status: 'CANCELLED' } }).catch(() => undefined)
  }
  const href = await againHref(invoice.orderId)
  if (action === 'delete' && closed.creditOk) {
    // The record goes; the customer's message stays. Only a void invoice whose credit went back is removed.
    const credit = await releaseInvoiceCredit(invoice.id, `credit released ${invoice.number} (deleted: ${reason})`)
    if (credit.ok) {
      const removed = await db.invoice.deleteMany({ where: { id: invoice.id, status: 'VOID' } })
      if (removed.count && invoice.orderId) await db.order.delete({ where: { id: invoice.orderId } }).catch(() => undefined)
    }
  }
  const message = closeMessage(reason, invoice.number, jump, Boolean(invoice.fxRates))
  await createInboxEvent({ userId: invoice.userId, kind: 'INVOICE', dedupeKey: `invoice:closed:${invoice.id}`, titleFa: message.title, titleEn: 'Your invoice was closed', bodyFa: message.body, bodyEn: '', href }).catch(() => undefined)
  logEvent('info', 'invoice.closed_by_rule', { invoiceId: invoice.id, reason, action, jump })
  return true
}

/** Issues the next invoice of a recurring schedule, once (the schedule is claimed by moving its date forward). */
export async function issueRecurring(id: number, now = new Date(), force = false) {
  const plan = await db.recurringInvoice.findUnique({ where: { id } })
  if (!plan || (!plan.active && !force)) return null
  if (!force && plan.nextAt > now) return null
  if (plan.maxCount > 0 && plan.issuedCount >= plan.maxCount) { await db.recurringInvoice.update({ where: { id }, data: { active: false } }); return null }
  if (plan.endsAt && plan.nextAt > plan.endsAt && !force) { await db.recurringInvoice.update({ where: { id }, data: { active: false } }); return null }
  const due = plan.nextAt
  const following = nextRun(force ? now : due, plan.interval)
  const claimed = await db.recurringInvoice.updateMany({ where: { id, nextAt: due }, data: { nextAt: force ? plan.nextAt : following, issuedCount: { increment: 1 } } })
  if (!claimed.count) return null
  const currency = normalizeCurrency(plan.currency)
  try {
    const invoice = await createInvoiceForOrder({
      orderId: null, userId: plan.userId, subtotal: legacyNumber(plan.amountMinor, currency), currency, gatewayId: plan.gatewayId,
      notes: plan.notes, status: 'UNPAID', createdBy: plan.createdBy, dueDays: plan.dueDays,
      idempotencyKey: `recurring:${plan.id}:${force ? `now:${now.getTime()}` : due.getTime()}`,
    })
    await db.invoice.update({ where: { id: invoice.id }, data: { title: plan.title, detail: plan.detail, recurringId: plan.id } })
    const done = plan.maxCount > 0 && plan.issuedCount + 1 >= plan.maxCount
    await db.recurringInvoice.update({ where: { id }, data: { lastInvoiceId: invoice.id, ...(done || (plan.endsAt && following > plan.endsAt) ? { active: false } : {}) } })
    await createInboxEvent({
      userId: plan.userId, kind: 'INVOICE', dedupeKey: `invoice:issued:${invoice.id}`, titleFa: `فاکتور تازه: ${plan.title.slice(0, 80)}`, titleEn: 'A new invoice',
      bodyFa: `${intervalOf(plan.interval)?.label || ''} — فاکتور ${invoice.number} برای شما صادر شد.`, bodyEn: '', href: `/invoice/${invoice.number}`,
    }).catch(() => undefined)
    return invoice
  } catch (error) {
    // Give the date back so the next pass tries again.
    await db.recurringInvoice.updateMany({ where: { id, nextAt: force ? plan.nextAt : following }, data: { nextAt: due, issuedCount: { decrement: 1 } } })
    logEvent('error', 'invoice.recurring_failed', { id, error })
    return null
  }
}

/** One pass: rate-bound invoices, expired and overdue ones, then the recurring schedules that are due. */
export async function processInvoiceRules(now = new Date()) {
  const rules = await getInvoiceRules()
  let closed = 0, issued = 0
  const select = { id: true, number: true, userId: true, orderId: true, status: true, fxRates: true, expiresAt: true, dueAt: true } as const

  const expired = await db.invoice.findMany({ where: { status: 'UNPAID', expiresAt: { lte: now } }, select, take: 100, orderBy: { id: 'asc' } })
  for (const invoice of expired) {
    const fx = Boolean(invoice.fxRates)
    if (await closeInvoice(invoice, 'EXPIRED', fx ? rules.fxAction : rules.overdueAction)) closed++
  }

  if (rules.fxJumpToman > 0) {
    const bound = await db.invoice.findMany({ where: { status: 'UNPAID', fxRates: { not: '' } }, select, take: 500, orderBy: { id: 'asc' } })
    if (bound.length) {
      const rates = await loadRates()
      for (const invoice of bound) {
        const snapshot = parseFxRates(invoice.fxRates)
        const jump = fxJump(snapshot, Object.fromEntries(Object.keys(snapshot).map((code) => [code, tomanRate(code, rates)])), rules.fxJumpToman)
        if (jump && await closeInvoice(invoice, 'FX_RATE', rules.fxAction, jump)) closed++
      }
    }
  }

  if (rules.overdueEnabled) {
    const before = new Date(now.getTime() - rules.overdueHours * 3_600_000)
    const late = await db.invoice.findMany({ where: { status: 'UNPAID', kind: 'BILLING', dueAt: { lte: before } }, select, take: 100, orderBy: { id: 'asc' } })
    for (const invoice of late) if (await closeInvoice(invoice, 'OVERDUE', rules.overdueAction)) closed++
  }

  const due = await db.recurringInvoice.findMany({ where: { active: true, nextAt: { lte: now } }, select: { id: true }, take: 100, orderBy: { nextAt: 'asc' } })
  for (const plan of due) if (await issueRecurring(plan.id, now)) issued++
  return { closed, issued }
}
