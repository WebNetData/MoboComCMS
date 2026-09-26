import { db } from '@/platform/database/prisma'
import { maskSecret } from '@/modules/billing/server/gateways'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { bpsAmount, formatMoney, legacyNumber, minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { emitExtensionEvent } from '@/extensions/server/runtime'
import { logEvent } from '@/platform/observability/logger'
import { invoicePaidEvent } from '@/modules/notifications/server/inbox'

export const INVOICE_STATUSES = ['DRAFT', 'UNPAID', 'PAID', 'VOID', 'REFUNDED'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]
export const EXPENSE_CATEGORIES = ['SERVER', 'MARKETING', 'SALARY', 'PAYMENT_FEE', 'OTHER'] as const

export function invoiceTotalMinor(subtotalMinor: bigint, discountMinor = 0n, taxMinor = 0n) {
  const result = subtotalMinor - discountMinor + taxMinor
  return result > 0n ? result : 0n
}

/** Legacy boundary helper. New business logic should use *Minor fields. */
export function invoiceTotal(subtotal: number, discount = 0, tax = 0, currency = 'USD') {
  const code = normalizeCurrency(currency)
  return minorToNumber(invoiceTotalMinor(toMinor(subtotal, code), toMinor(discount, code), toMinor(tax, code)), code)
}

/** Atomic monotonic sequence, safe under concurrent invoice creation. */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const counter = await db.invoiceSequence.upsert({
    where: { year },
    create: { year, value: 1 },
    update: { value: { increment: 1 } },
  })
  // Prefix is configurable (INVOICE_PREFIX); the yearly counter keeps numbers unique across prefix changes.
  const prefix = (process.env.INVOICE_PREFIX || 'MB').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'MB'
  return `${prefix}-${year}-${String(counter.value).padStart(6, '0')}`
}

export interface CreateInvoiceForOrderInput {
  orderId?: number | null
  userId: number
  planId?: number | null
  productId?: number | null
  subtotal: number | string
  discount?: number | string
  tax?: number | string
  currency?: string
  gatewayId?: number | null
  notes?: string
  status?: InvoiceStatus
  createdBy?: number | null
  kind?: 'BILLING' | 'WALLET_TOPUP'
  walletApplied?: number | string
  idempotencyKey?: string | null
  dueDays?: number
}

export function invoiceDueMinor(invoice: { totalMinor: bigint; walletAppliedMinor?: bigint | null }) {
  const due = invoice.totalMinor - (invoice.walletAppliedMinor || 0n)
  return due > 0n ? due : 0n
}

export function invoiceDue(invoice: { totalMinor?: bigint; walletAppliedMinor?: bigint | null; total: number; walletApplied?: number | null; currency?: string }) {
  const currency = normalizeCurrency(invoice.currency || 'USD')
  if (typeof invoice.totalMinor === 'bigint') return minorToNumber(invoiceDueMinor({ totalMinor: invoice.totalMinor, walletAppliedMinor: invoice.walletAppliedMinor }), currency)
  return Math.max(0, invoice.total - (invoice.walletApplied || 0))
}

export async function createInvoiceForOrder(input: CreateInvoiceForOrderInput) {
  const currency = normalizeCurrency(input.currency || 'USD')
  const subtotalMinor = toMinor(input.subtotal, currency)
  const discountMinor = toMinor(input.discount || 0, currency)
  const taxMinor = toMinor(input.tax || 0, currency)
  const totalMinor = invoiceTotalMinor(subtotalMinor, discountMinor, taxMinor)
  const walletAppliedMinor = toMinor(input.walletApplied || 0, currency)
  if (walletAppliedMinor < 0n || walletAppliedMinor > totalMinor) throw new Error('invalid wallet credit on invoice')
  const dueDays = Math.max(0, Math.min(365, Number(input.dueDays ?? 1) || 0))

  if (input.idempotencyKey) {
    const existing = await db.invoice.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return existing
  }

  return db.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      userId: input.userId,
      orderId: input.orderId ?? null,
      planId: input.planId || null,
      productId: input.productId || null,
      subtotal: legacyNumber(subtotalMinor, currency),
      subtotalMinor,
      discount: legacyNumber(discountMinor, currency),
      discountMinor,
      tax: legacyNumber(taxMinor, currency),
      taxMinor,
      total: legacyNumber(totalMinor, currency),
      totalMinor,
      walletApplied: legacyNumber(walletAppliedMinor, currency),
      walletAppliedMinor,
      currency,
      idempotencyKey: input.idempotencyKey || null,
      status: input.status || 'UNPAID',
      kind: input.kind || 'BILLING',
      gatewayId: input.gatewayId || null,
      notes: input.notes || '',
      createdBy: input.createdBy ?? null,
      dueAt: new Date(Date.now() + dueDays * 24 * 3600_000),
    },
  })
}

export interface MarkPaidInput {
  invoiceId: number
  gatewayId?: number | null
  providerTxnId?: string
  cryptoCurrency?: string
  cryptoAmount?: string
  /** Gateway portion only. */
  amount?: number | string
  raw?: unknown
  feePercent?: number
  feeBps?: number
  provider?: string
}

/**
 * Atomically claims an invoice for settlement. Repeated callbacks return
 * `alreadyPaid` and never duplicate ledger rows or order settlement.
 */
export async function markInvoicePaid(input: MarkPaidInput) {
  const result = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } })
    if (!invoice) return { ok: false as const, message: 'invoice not found' }
    if (invoice.status === 'PAID') return { ok: true as const, alreadyPaid: true, invoice }
    if (!['UNPAID', 'DRAFT'].includes(invoice.status)) return { ok: false as const, message: `invoice is ${invoice.status}` }

    const currency = normalizeCurrency(invoice.currency)
    const creditMinor = invoice.walletAppliedMinor || toMinor(invoice.walletApplied || 0, currency)
    const dueMinor = invoiceDueMinor({ totalMinor: invoice.totalMinor || toMinor(invoice.total, currency), walletAppliedMinor: creditMinor })
    const amountMinor = input.amount === undefined ? dueMinor : toMinor(input.amount, currency)
    if (amountMinor < 0n) return { ok: false as const, message: 'payment amount cannot be negative' }
    const totalPaidMinor = creditMinor + amountMinor
    const totalMinor = invoice.totalMinor || toMinor(invoice.total, currency)
    if (totalPaidMinor < totalMinor) return { ok: false as const, message: 'invoice is not fully paid' }
    const feeBps = Number.isInteger(input.feeBps) ? Number(input.feeBps) : Math.round((Number(input.feePercent) || 0) * 100)
    const feeMinor = bpsAmount(amountMinor, feeBps)
    const now = new Date()

    const claimed = await tx.invoice.updateMany({
      where: { id: invoice.id, status: { in: ['UNPAID', 'DRAFT'] } },
      data: {
        status: 'PAID',
        paidAt: now,
        paidAmount: legacyNumber(totalPaidMinor, currency),
        paidAmountMinor: totalPaidMinor,
        paidCrypto: input.cryptoCurrency || invoice.paidCrypto,
        providerTxnId: input.providerTxnId || invoice.providerTxnId,
        gatewayId: input.gatewayId ?? invoice.gatewayId,
      },
    })
    if (claimed.count !== 1) {
      const fresh = await tx.invoice.findUnique({ where: { id: invoice.id } })
      return { ok: true as const, alreadyPaid: true, invoice: fresh || invoice }
    }

    const gateway = input.gatewayId ? await tx.gateway.findUnique({ where: { id: input.gatewayId } }) : null

    if (creditMinor > 0n) {
      await tx.payment.create({
        data: {
          userId: invoice.userId,
          orderId: invoice.orderId,
          invoiceId: invoice.id,
          gatewayId: null,
          provider: 'WALLET',
          providerTxnId: '',
          eventKey: `invoice:${invoice.id}:wallet`,
          amount: legacyNumber(creditMinor, currency),
          amountMinor: creditMinor,
          currency,
          fee: 0,
          feeMinor: 0n,
          status: 'CONFIRMED',
          raw: JSON.stringify({ source: 'wallet-credit', invoice: invoice.number }),
          confirmedAt: now,
        },
      })
    }

    if (amountMinor > 0n) {
      const provider = input.provider || gateway?.provider || 'MANUAL'
      const providerTxnId = input.providerTxnId || ''
      await tx.payment.create({
        data: {
          userId: invoice.userId,
          orderId: invoice.orderId,
          invoiceId: invoice.id,
          gatewayId: gateway?.id ?? invoice.gatewayId,
          provider,
          providerTxnId,
          eventKey: `invoice:${invoice.id}:payment:${provider}:${providerTxnId || 'manual'}`,
          amount: legacyNumber(amountMinor, currency),
          amountMinor,
          currency,
          cryptoCurrency: input.cryptoCurrency || '',
          cryptoAmount: input.cryptoAmount || '',
          fee: legacyNumber(feeMinor, currency),
          feeMinor,
          status: 'CONFIRMED',
          raw: JSON.stringify(input.raw ?? {}),
          confirmedAt: now,
        },
      })
    }

    if (invoice.orderId) {
      await tx.order.update({
        where: { id: invoice.orderId },
        data: {
          status: 'PAID',
          paidCrypto: input.cryptoCurrency || undefined,
          paidAmount: input.cryptoAmount || String(legacyNumber(totalPaidMinor, currency)),
        },
      })
      await tx.promotionRedemption.updateMany({ where: { orderId: invoice.orderId, status: 'RESERVED' }, data: { status: 'USED' } })
    }

    const settled = await tx.invoice.findUnique({ where: { id: invoice.id } })
    return { ok: true as const, alreadyPaid: false, invoice: settled || invoice }
  })
  if (result.ok && !result.alreadyPaid) {
    await invoicePaidEvent(result.invoice).catch(error => logEvent('error', 'inbox.payment_failed', { invoiceId: result.invoice.id, error }))
    logEvent('info', 'payment.settled', { invoiceId: result.invoice.id, orderId: result.invoice.orderId, userId: result.invoice.userId, totalMinor: result.invoice.paidAmountMinor, currency: result.invoice.currency })
    void import('@/modules/sms/server/sms').then(({ notifyAdmins }) => notifyAdmins('ADMIN_ORDER', { invoice: result.invoice.number, amount: formatMoney(result.invoice.paidAmountMinor, result.invoice.currency, 'fa-IR') }))
      .catch(error => logEvent('error', 'sms.admin_failed', { invoiceId: result.invoice.id, error }))
    await emitExtensionEvent('payment.completed', { invoiceId: result.invoice.id, orderId: result.invoice.orderId, userId: result.invoice.userId, totalMinor: result.invoice.paidAmountMinor.toString(), currency: result.invoice.currency })
    const { awardReferralForInvoice } = await import('@/modules/referrals/server/referrals')
    await awardReferralForInvoice(result.invoice.id).catch(error => logEvent('error', 'referral.reward_failed', { invoiceId: result.invoice.id, message: error instanceof Error ? error.message : 'unknown' }))
  }
  return result
}
export async function releaseInvoiceCredit(invoiceId: number, description?: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return { ok: false as const, message: 'invoice not found', released: 0 }
  const currency = normalizeCurrency(invoice.currency)
  const creditMinor = invoice.walletAppliedMinor || toMinor(invoice.walletApplied || 0, currency)
  if (creditMinor <= 0n) return { ok: true as const, released: 0 }
  if (invoice.status === 'PAID') return { ok: false as const, message: 'a paid invoice keeps its credit', released: 0 }

  const move = await moveWallet({
    userId: invoice.userId,
    amount: legacyNumber(creditMinor, currency),
    currency,
    type: 'REFUND',
    description: description || `credit released for ${invoice.number}`,
    orderId: invoice.orderId,
    invoiceId: invoice.id,
    idempotencyKey: `invoice-credit-release:${invoice.id}`,
  })
  if (!move.ok) return { ok: false as const, message: move.message, released: 0 }
  await db.invoice.update({ where: { id: invoice.id }, data: { walletApplied: 0, walletAppliedMinor: 0n } }).catch(() => {})
  return { ok: true as const, released: minorToNumber(creditMinor, currency), balance: move.balance, currency }
}

export async function recordProviderEvent(input: {
  provider: string
  event: string
  status: string
  gatewayId?: number | null
  orderId?: number | null
  invoiceId?: number | null
  userId?: number | null
  amount?: number | string
  currency?: string
  providerTxnId?: string
  cryptoCurrency?: string
  cryptoAmount?: string
  raw?: unknown
  eventKey?: string
}) {
  const currency = normalizeCurrency(input.currency || 'USD')
  const amountMinor = toMinor(input.amount || 0, currency)
  const data = {
    userId: input.userId ?? null,
    orderId: input.orderId ?? null,
    invoiceId: input.invoiceId ?? null,
    gatewayId: input.gatewayId ?? null,
    provider: input.provider,
    providerTxnId: input.providerTxnId || '',
    eventKey: input.eventKey || null,
    amount: legacyNumber(amountMinor, currency),
    amountMinor,
    currency,
    cryptoCurrency: input.cryptoCurrency || '',
    cryptoAmount: input.cryptoAmount || '',
    status: input.status,
    raw: JSON.stringify({ event: input.event, ...(input.raw as object) }),
    confirmedAt: input.status === 'CONFIRMED' ? new Date() : null,
  }
  if (input.eventKey) {
    return db.payment.upsert({ where: { eventKey: input.eventKey }, create: data, update: { raw: data.raw, status: data.status } })
  }
  return db.payment.create({ data })
}

export function safeCredentials(gateway: { apiKey: string; secretKey: string }) {
  return { apiKey: maskSecret(gateway.apiKey), secretKey: maskSecret(gateway.secretKey) }
}
