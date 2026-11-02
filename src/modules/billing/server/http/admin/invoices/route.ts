import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { createInvoiceForOrder, invoiceDueMinor, invoiceTotalMinor, releaseInvoiceCredit, voidOpenInvoice } from '@/modules/billing/server/billing'
import { settleInvoiceManually } from '@/modules/billing/server/settle'
import { refundPaidInvoice } from '@/modules/billing/server/order-closure'
import { ensureInventoryReservation, releaseInventoryReservation } from '@/modules/catalog/server/inventory'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor, BASE_CURRENCY } from '@/shared/money'
import { auditAdmin } from '@/platform/audit/server'
import { parseFxRates } from '@/modules/billing/domain/invoice-rules'
import { pictureOf } from '@/modules/identity/domain/picture'

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
/** A closing time from "hours from now" (0 or empty: none). */
const expiryFrom = (hours: unknown) => { const n = Number(hours); return Number.isFinite(n) && n > 0 ? new Date(Date.now() + Math.min(n, 24 * 365) * 3_600_000) : null }

function minor(row: any, field: string, currency: string) {
  const exact = row?.[`${field}Minor`]
  return typeof exact === 'bigint' && exact !== 0n ? exact : toMinor(row?.[field] || 0, currency)
}

function serialize(i: any) {
  const currency = normalizeCurrency(i.currency || 'USD')
  const totalMinor = minor(i, 'total', currency)
  const walletAppliedMinor = minor(i, 'walletApplied', currency)
  return {
    id: i.id,
    number: i.number,
    userId: i.userId,
    user: i.user ? { id: i.user.id, email: i.user.email, name: i.user.name, avatar: pictureOf(i.user) } : null,
    orderId: i.orderId,
    planId: i.planId,
    planName: i.plan?.name || '',
    productId: i.productId,
    productName: i.product?.name || '',
    subtotal: minorToNumber(minor(i, 'subtotal', currency), currency),
    discount: minorToNumber(minor(i, 'discount', currency), currency),
    tax: minorToNumber(minor(i, 'tax', currency), currency),
    total: minorToNumber(totalMinor, currency),
    walletApplied: minorToNumber(walletAppliedMinor, currency),
    amountDue: minorToNumber(invoiceDueMinor({ totalMinor, walletAppliedMinor }), currency),
    currency,
    status: i.status,
    gatewayId: i.gatewayId,
    gatewayName: i.gateway?.name || '',
    providerTxnId: i.providerTxnId,
    paidCrypto: i.paidCrypto,
    paidAmount: minorToNumber(minor(i, 'paidAmount', currency), currency),
    notes: i.notes,
    title: i.title || '',
    detail: i.detail || '',
    kind: i.kind,
    expiresAt: i.expiresAt,
    fxRates: parseFxRates(i.fxRates || ''),
    closedReason: i.closedReason || '',
    recurringId: i.recurringId,
    issuedAt: i.issuedAt,
    dueAt: i.dueAt,
    paidAt: i.paidAt,
    createdAt: i.createdAt,
  }
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'invoices.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || ''
  const q = (sp.get('q') || '').trim()
  const take = Math.min(Number(sp.get('take')) || 200, 500)
  const currencyRows = await db.invoice.findMany({ select: { currency: true }, distinct: ['currency'] })
  const currencies = [...new Set(currencyRows.map((x) => normalizeCurrency(x.currency || 'USD')))].sort()
  if (!currencies.length) currencies.push(BASE_CURRENCY)
  const currency = normalizeCurrency(sp.get('currency') || currencies[0])
  if (!currencies.includes(currency)) currencies.push(currency)

  const where: any = { currency }
  if (status) where.status = status
  if (q) where.OR = [{ number: { contains: q } }, { title: { contains: q } }, { user: { email: { contains: q } } }, { user: { name: { contains: q } } }]
  if (sp.get('closed') === '1') { delete where.status; where.closedReason = { not: '' } }

  const [rows, allForCurrency] = await Promise.all([
    db.invoice.findMany({
      where,
      take,
      orderBy: { id: 'desc' },
      include: { user: { select: { id: true, email: true, name: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } }, plan: { select: { name: true } }, product: { select: { name: true } }, gateway: { select: { name: true } } },
    }),
    db.invoice.findMany({ where: { currency }, select: { status: true, total: true, totalMinor: true, walletApplied: true, walletAppliedMinor: true, currency: true } }),
  ])
  const [closedByRule, expiring] = await Promise.all([
    db.invoice.count({ where: { currency, closedReason: { not: '' } } }),
    db.invoice.count({ where: { currency, status: 'UNPAID', expiresAt: { not: null } } }),
  ])

  const counts: Record<string, number> = {}
  const sumsMinor: Record<string, bigint> = {}
  for (const row of allForCurrency) {
    counts[row.status] = (counts[row.status] || 0) + 1
    const value = minor(row, 'total', currency)
    sumsMinor[row.status] = (sumsMinor[row.status] || 0n) + value
  }
  const sums = Object.fromEntries(Object.entries(sumsMinor).map(([k, v]) => [k, minorToNumber(v, currency)]))
  return ok({ invoices: rows.map(serialize), counts, sums, paidTotal: sums.PAID || 0, closedByRule, expiring, currency, currencies: currencies.sort() })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'invoices.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const userId = Number(b?.userId)
  if (!userId) return err('customer is required')
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) return err('user not found', 404)

  const planId = Number(b?.planId) || null
  const productId = Number(b?.productId) || null
  if (planId && productId) return err('choose either a plan or a product')
  const gatewayId = Number(b?.gatewayId) || null
  const status = b?.status === 'DRAFT' ? 'DRAFT' : 'UNPAID'
  const dueDays = Math.max(0, Math.min(365, Number(b?.dueDays) || 7))

  let item: any = null
  if (planId) item = await db.plan.findUnique({ where: { id: planId } })
  if (productId) item = await db.product.findUnique({ where: { id: productId } })
  if ((planId || productId) && !item) return err('item not found', 404)
  const currency = normalizeCurrency(item?.currency || b?.currency || BASE_CURRENCY)
  if (item && b?.currency && normalizeCurrency(b.currency) !== currency) return err('item currency cannot be overridden')

  let subtotalMinor: bigint
  let discountMinor: bigint
  let taxMinor: bigint
  try {
    subtotalMinor = b?.subtotal !== undefined && String(b.subtotal) !== '' ? toMinor(String(b.subtotal), currency) : minor(item, 'price', currency)
    discountMinor = toMinor(String(b?.discount ?? 0), currency)
    taxMinor = toMinor(String(b?.tax ?? 0), currency)
  } catch (e) { return err(e instanceof Error ? e.message : 'invalid amount') }
  if (subtotalMinor <= 0n) return err('amount must be greater than zero')
  if (!planId && !productId && !text(b?.title, 120) && !String(b?.notes || '').trim()) return err('برای فاکتور دستی، شرح فاکتور را بنویسید')
  const totalMinor = invoiceTotalMinor(subtotalMinor, discountMinor, taxMinor)
  if (totalMinor <= 0n) return err('invoice total must be greater than zero')

  if (gatewayId) {
    const gateway = await db.gateway.findUnique({ where: { id: gatewayId }, select: { id: true, fiat: true, provider: true, active: true } })
    if (!gateway || !gateway.active) return err('gateway unavailable')
    if (normalizeCurrency(gateway.fiat || 'USD') !== currency) return err(`gateway accepts ${normalizeCurrency(gateway.fiat || 'USD')}, invoice is ${currency}`)
  }

  const order = planId || productId ? await db.order.create({ data: {
    userId, planId, productId,
    totalAmount: legacyNumber(totalMinor, currency), totalMinor, currency, status: 'PENDING',
    provider: gatewayId ? String((await db.gateway.findUnique({ where: { id: gatewayId }, select: { provider: true } }))?.provider || 'MANUAL') : 'MANUAL',
    gatewayId,
    meta: JSON.stringify({ kind: planId ? 'plan' : 'product', manual: true }),
  } }) : null

  if (order && productId) {
    const reservation = await ensureInventoryReservation({ orderId: order.id, holdMinutes: Math.max(30, dueDays * 24 * 60) })
    if (!reservation.ok) {
      await db.order.delete({ where: { id: order.id } }).catch(() => {})
      return err(reservation.message || 'out of stock', 409)
    }
  }

  try {
    const invoice = await createInvoiceForOrder({
      orderId: order?.id || null, userId, planId, productId,
      subtotal: legacyNumber(subtotalMinor, currency), discount: legacyNumber(discountMinor, currency), tax: legacyNumber(taxMinor, currency),
      currency, gatewayId, notes: String(b?.notes || ''), status, createdBy: admin.id, dueDays,
    })
    if (order) await db.order.update({ where: { id: order.id }, data: { paymentUrl: `/invoice/${invoice.number}` } }).catch(() => {})
    const title = text(b?.title, 120), detail = text(b?.detail, 500), expiresAt = expiryFrom(b?.expiresHours)
    if (title || detail || expiresAt) await db.invoice.update({ where: { id: invoice.id }, data: { title, detail, ...(expiresAt ? { expiresAt } : {}) } })
    const full = await db.invoice.findUnique({ where: { id: invoice.id }, include: { user: { select: { id: true, email: true, name: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } }, plan: { select: { name: true } }, product: { select: { name: true } }, gateway: { select: { name: true } } } })
    await auditAdmin({ req, actor: admin, action: 'invoice.create', targetType: 'invoice', targetId: invoice.id, metadata: { userId, orderId: order?.id || null, planId, productId, currency, totalMinor: totalMinor.toString(), status } })
    return ok(serialize(full))
  } catch (error) {
    if (order?.id) {
      await releaseInventoryReservation(order.id).catch(() => {})
      await db.order.delete({ where: { id: order.id } }).catch(() => {})
    }
    return err(error instanceof Error ? error.message : 'invoice creation failed', 400)
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'invoices.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const invoice = await db.invoice.findUnique({ where: { id }, include: { gateway: true } })
  if (!invoice) return err('not found', 404)
  const currency = normalizeCurrency(invoice.currency)
  const action = String(b?.action || 'update')

  if (action === 'markPaid') {
    try {
      const res = await settleInvoiceManually({
        invoiceId: id, providerTxnId: String(b?.providerTxnId || ''),
        cryptoCurrency: String(b?.cryptoCurrency || ''), cryptoAmount: String(b?.cryptoAmount || ''),
        amount: b?.amount !== undefined && b?.amount !== '' ? String(b.amount) : undefined,
        raw: { source: 'admin', by: admin.email },
      })
      if (!res.ok) return err(res.message, res.status)
      await auditAdmin({ req, actor: admin, action: 'invoice.markPaid', targetType: 'invoice', targetId: id, metadata: { orderId: invoice.orderId, currency, warning: res.warning } })
      return ok({ ok: true, warning: res.warning })
    } catch (e) { return err(e instanceof Error ? e.message : 'failed', 400) }
  }

  if (action === 'void') {
    if (invoice.status === 'PAID') return err('a paid invoice cannot be voided — refund it instead')
    // Claimed first: an invoice paid since this page was loaded is not voided over its payment.
    const closed = invoice.status === 'VOID' ? { voided: true, released: 0, creditOk: true } : await voidOpenInvoice(id, `credit released ${invoice.number} (voided by ${admin.email})`)
    if (!closed.voided) return err('the invoice is no longer open — reload it', 409)
    const released = { ok: closed.creditOk, released: closed.released }
    if (invoice.orderId) await releaseInventoryReservation(invoice.orderId).catch(() => {})
    if (invoice.orderId) await db.order.updateMany({ where: { id: invoice.orderId, status: { notIn: ['PAID', 'REFUNDED'] } }, data: { status: 'CANCELLED' } }).catch(() => {})
    await auditAdmin({ req, actor: admin, action: 'invoice.void', targetType: 'invoice', targetId: id, metadata: { orderId: invoice.orderId, currency, creditReleased: released.ok ? released.released : 0 } })
    return ok({ ok: true, creditReleased: released.ok ? released.released : 0 })
  }

  if (action === 'refund') {
    if (invoice.status !== 'PAID') return err('only paid invoices can be refunded')
    const totalMinor = minor(invoice, 'paidAmount', currency) || minor(invoice, 'total', currency)
    const walletMinor = minor(invoice, 'walletApplied', currency)
    const refunded = await refundPaidInvoice(invoice, { totalMinor, walletMinor, by: admin.email, actorId: admin.id })
    if (!refunded.ok) return err(refunded.message, refunded.status)
    await auditAdmin({ req, actor: admin, action: 'invoice.refund', targetType: 'invoice', targetId: id, metadata: { orderId: invoice.orderId, currency, refundMinor: totalMinor.toString(), walletRefundMinor: walletMinor.toString() } })
    return ok({ ok: true, note: 'External gateway refunds must be executed with the provider before recording this action.' })
  }

  const data: Record<string, unknown> = {}
  if (b?.notes !== undefined) data.notes = String(b.notes)
  if (b?.title !== undefined) data.title = text(b.title, 120)
  if (b?.detail !== undefined) data.detail = text(b.detail, 500)
  if (b?.expiresAt !== undefined) data.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null
  if (b?.expiresHours !== undefined) data.expiresAt = expiryFrom(b.expiresHours)
  if (data.expiresAt instanceof Date && Number.isNaN(data.expiresAt.getTime())) return err('زمان بسته شدن معتبر نیست')
  if (b?.status && ['DRAFT', 'UNPAID', 'VOID'].includes(String(b.status))) data.status = String(b.status)
  if (b?.dueAt !== undefined) data.dueAt = b.dueAt ? new Date(b.dueAt) : null
  if (b?.discount !== undefined || b?.tax !== undefined) {
    try {
      const subtotalMinor = minor(invoice, 'subtotal', currency)
      const discountMinor = b?.discount !== undefined ? toMinor(String(b.discount), currency) : minor(invoice, 'discount', currency)
      const taxMinor = b?.tax !== undefined ? toMinor(String(b.tax), currency) : minor(invoice, 'tax', currency)
      const totalMinor = invoiceTotalMinor(subtotalMinor, discountMinor, taxMinor)
      Object.assign(data, {
        discount: legacyNumber(discountMinor, currency), discountMinor,
        tax: legacyNumber(taxMinor, currency), taxMinor,
        total: legacyNumber(totalMinor, currency), totalMinor,
      })
    } catch (e) { return err(e instanceof Error ? e.message : 'invalid amount') }
  }
  if (!Object.keys(data).length) return err('nothing to update')
  // What was charged on a paid or refunded invoice is settled: its state and amounts stay (the database refuses them too); a note may still be added.
  const settles = 'status' in data || 'totalMinor' in data
  if (settles && ['PAID', 'REFUNDED'].includes(invoice.status)) return err('a paid or refunded invoice cannot be reopened or re-priced — refund it instead', 409)
  const saved = await db.invoice.updateMany({ where: settles ? { id, status: { notIn: ['PAID', 'REFUNDED'] } } : { id }, data })
  if (saved.count !== 1) return err('the invoice was paid meanwhile — reload it', 409)
  await auditAdmin({ req, actor: admin, action: 'invoice.update', targetType: 'invoice', targetId: id, metadata: { fields: Object.keys(data), currency } })
  return ok({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'invoices.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) return err('not found', 404)
  if (invoice.status === 'PAID' || invoice.status === 'REFUNDED') return err('settled invoices are kept for accounting', 400)
  // Close it before deleting: a payment arriving now finds a void invoice, and a credit that could
  // not be given back keeps its record instead of being deleted with the invoice.
  if (invoice.status !== 'VOID') {
    const closed = await voidOpenInvoice(id, `credit released ${invoice.number} (deleted by ${admin.email})`)
    if (!closed.voided) return err('the invoice is no longer open — reload it', 409)
    if (!closed.creditOk) return err('the wallet credit of this invoice could not be released; it was voided and kept', 409)
  } else {
    const credit = await releaseInvoiceCredit(id, `credit released ${invoice.number} (deleted by ${admin.email})`)
    if (!credit.ok) return err('the wallet credit of this invoice could not be released; it was kept', 409)
  }
  if (invoice.orderId) await releaseInventoryReservation(invoice.orderId).catch(() => {})
  const removed = await db.invoice.deleteMany({ where: { id, status: 'VOID' } })
  if (removed.count !== 1) return err('the invoice is no longer open — reload it', 409)
  if (invoice.orderId) await db.order.delete({ where: { id: invoice.orderId } }).catch(() => {})
  await auditAdmin({ req, actor: admin, action: 'invoice.delete', targetType: 'invoice', targetId: id, metadata: { number: invoice.number, orderId: invoice.orderId, currency: invoice.currency } })
  return ok({ deleted: true })
}
