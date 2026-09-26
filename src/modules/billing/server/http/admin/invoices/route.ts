import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { createInvoiceForOrder, invoiceDueMinor, invoiceTotalMinor, markInvoicePaid, releaseInvoiceCredit } from '@/modules/billing/server/billing'
import { enqueueOrderFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { ensureInventoryReservation, releaseInventoryReservation } from '@/modules/catalog/server/inventory'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { auditAdmin } from '@/platform/audit/server'

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
    user: i.user ? { id: i.user.id, email: i.user.email, name: i.user.name } : null,
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
  if (!currencies.length) currencies.push('USD')
  const currency = normalizeCurrency(sp.get('currency') || currencies[0])
  if (!currencies.includes(currency)) currencies.push(currency)

  const where: any = { currency }
  if (status) where.status = status
  if (q) where.OR = [{ number: { contains: q } }, { user: { email: { contains: q } } }, { user: { name: { contains: q } } }]

  const [rows, allForCurrency] = await Promise.all([
    db.invoice.findMany({
      where,
      take,
      orderBy: { id: 'desc' },
      include: { user: { select: { id: true, email: true, name: true } }, plan: { select: { name: true } }, product: { select: { name: true } }, gateway: { select: { name: true } } },
    }),
    db.invoice.findMany({ where: { currency }, select: { status: true, total: true, totalMinor: true, walletApplied: true, walletAppliedMinor: true, currency: true } }),
  ])

  const counts: Record<string, number> = {}
  const sumsMinor: Record<string, bigint> = {}
  for (const row of allForCurrency) {
    counts[row.status] = (counts[row.status] || 0) + 1
    const value = minor(row, 'total', currency)
    sumsMinor[row.status] = (sumsMinor[row.status] || 0n) + value
  }
  const sums = Object.fromEntries(Object.entries(sumsMinor).map(([k, v]) => [k, minorToNumber(v, currency)]))
  return ok({ invoices: rows.map(serialize), counts, sums, paidTotal: sums.PAID || 0, currency, currencies: currencies.sort() })
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
  const currency = normalizeCurrency(item?.currency || b?.currency || 'USD')
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
    const reservation = await ensureInventoryReservation({ orderId: order.id, productId, holdMinutes: Math.max(30, dueDays * 24 * 60) })
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
    const full = await db.invoice.findUnique({ where: { id: invoice.id }, include: { user: { select: { id: true, email: true, name: true } }, plan: { select: { name: true } }, product: { select: { name: true } }, gateway: { select: { name: true } } } })
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
      // Reserve stock before financial settlement. If it cannot be reserved, do not mark the invoice paid.
      if (invoice.productId && invoice.orderId) {
        const held = await ensureInventoryReservation({ orderId: invoice.orderId, productId: invoice.productId, holdMinutes: 60 })
        if (!held.ok) return err(held.message || 'out of stock', 409)
      }
      const res = await markInvoicePaid({
        invoiceId: id, gatewayId: invoice.gatewayId, providerTxnId: String(b?.providerTxnId || ''),
        cryptoCurrency: String(b?.cryptoCurrency || ''), cryptoAmount: String(b?.cryptoAmount || ''),
        amount: b?.amount !== undefined && b?.amount !== '' ? String(b.amount) : undefined,
        feeBps: invoice.gateway?.feeBps ?? Math.round((invoice.gateway?.feePercent || 0) * 100), provider: invoice.gateway?.provider || 'MANUAL',
        raw: { source: 'admin', by: admin.email },
      })
      if (!res.ok) return err(res.message || 'failed', 400)
      const job = invoice.orderId ? await enqueueOrderFulfillment({ orderId: invoice.orderId, invoiceId: invoice.id, planId: invoice.planId, productId: invoice.productId }) : null
      let warning: string | undefined
      if (job) {
        const processed = await processFulfillmentJob(job.id)
        if (!processed.ok) warning = `payment settled; fulfillment queued for retry: ${processed.message}`
      }
      await auditAdmin({ req, actor: admin, action: 'invoice.markPaid', targetType: 'invoice', targetId: id, metadata: { orderId: invoice.orderId, currency, fulfillmentJobId: job?.id || null, warning } })
      return ok({ ok: true, warning })
    } catch (e) { return err(e instanceof Error ? e.message : 'failed', 400) }
  }

  if (action === 'void') {
    if (invoice.status === 'PAID') return err('a paid invoice cannot be voided — refund it instead')
    const released = await releaseInvoiceCredit(id, `credit released ${invoice.number} (voided by ${admin.email})`)
    if (invoice.orderId) await releaseInventoryReservation(invoice.orderId).catch(() => {})
    await db.invoice.update({ where: { id }, data: { status: 'VOID' } })
    if (invoice.orderId) await db.order.update({ where: { id: invoice.orderId }, data: { status: 'CANCELLED' } }).catch(() => {})
    await auditAdmin({ req, actor: admin, action: 'invoice.void', targetType: 'invoice', targetId: id, metadata: { orderId: invoice.orderId, currency, creditReleased: released.ok ? released.released : 0 } })
    return ok({ ok: true, creditReleased: released.ok ? released.released : 0 })
  }

  if (action === 'refund') {
    if (invoice.status !== 'PAID') return err('only paid invoices can be refunded')
    const totalMinor = minor(invoice, 'paidAmount', currency) || minor(invoice, 'total', currency)
    const walletMinor = minor(invoice, 'walletApplied', currency)
    await db.$transaction(async (tx) => {
      const changed = await tx.invoice.updateMany({ where: { id, status: 'PAID' }, data: { status: 'REFUNDED' } })
      if (changed.count !== 1) return
      await tx.payment.create({ data: {
        userId: invoice.userId, orderId: invoice.orderId, invoiceId: invoice.id, gatewayId: invoice.gatewayId,
        provider: invoice.gateway?.provider || 'MANUAL', providerTxnId: invoice.providerTxnId,
        eventKey: `invoice:${invoice.id}:refund`, amount: -legacyNumber(totalMinor, currency), amountMinor: -totalMinor,
        currency, status: 'REFUNDED', raw: JSON.stringify({ source: 'admin', by: admin.email }), confirmedAt: new Date(),
      } })
    })
    if (walletMinor > 0n) await moveWallet({ userId: invoice.userId, amount: legacyNumber(walletMinor, currency), currency, type: 'REFUND', description: `refund wallet portion of ${invoice.number}`, invoiceId: invoice.id, orderId: invoice.orderId, idempotencyKey: `invoice-refund-wallet:${invoice.id}` })
    await auditAdmin({ req, actor: admin, action: 'invoice.refund', targetType: 'invoice', targetId: id, metadata: { orderId: invoice.orderId, currency, refundMinor: totalMinor.toString(), walletRefundMinor: walletMinor.toString() } })
    return ok({ ok: true, note: 'External gateway refunds must be executed with the provider before recording this action.' })
  }

  const data: Record<string, unknown> = {}
  if (b?.notes !== undefined) data.notes = String(b.notes)
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
  await db.invoice.update({ where: { id }, data })
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
  await releaseInvoiceCredit(id, `credit released ${invoice.number} (deleted by ${admin.email})`)
  if (invoice.orderId) await releaseInventoryReservation(invoice.orderId).catch(() => {})
  await db.invoice.delete({ where: { id } })
  if (invoice.orderId) await db.order.delete({ where: { id: invoice.orderId } }).catch(() => {})
  await auditAdmin({ req, actor: admin, action: 'invoice.delete', targetType: 'invoice', targetId: id, metadata: { number: invoice.number, orderId: invoice.orderId, currency: invoice.currency } })
  return ok({ deleted: true })
}
