import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { markInvoicePaid } from '@/modules/billing/server/billing'
import { ensureInventoryReservation } from '@/modules/catalog/server/inventory'
import { enqueueOrderFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { auditAdmin } from '@/platform/audit/server'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'orders.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const status = req.nextUrl.searchParams.get('status')
  const orders = await db.order.findMany({
    where: status ? { status: status as any } : undefined,
    include: { user: { select: { email: true, name: true } }, plan: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return ok(
    orders.map((o) => ({
      id: o.id,
      user: o.user.email,
      userName: o.user.name,
      plan: o.plan?.name || '-',
      amount: o.totalAmount,
      currency: o.currency,
      status: o.status,
      provider: o.provider,
      paidCrypto: o.paidCrypto,
      paidAmount: o.paidAmount,
      createdAt: o.createdAt,
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'orders.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const order = await db.order.findUnique({ where: { id } })
  if (!order) return err('not found', 404)

  if (b?.action === 'markPaid') {
    const invoice = await db.invoice.findFirst({ where: { orderId: id }, include: { gateway: true } })
    if (!invoice) return err('invoice not found; refusing an unledgered manual settlement', 409)
    if (order.status === 'PAID' && invoice.status === 'PAID') return err('این سفارش قبلاً پرداخت شده')

    // Product stock must be held before settlement so a manual payment cannot create a paid-but-undeliverable order.
    if (order.productId) {
      const held = await ensureInventoryReservation({ orderId: order.id, holdMinutes: 60 })
      if (!held.ok) return err(held.message || 'out of stock', 409)
    }

    const settled = await markInvoicePaid({
      invoiceId: invoice.id,
      gatewayId: invoice.gatewayId,
      providerTxnId: String(b?.providerTxnId || ''),
      cryptoCurrency: String(b?.cryptoCurrency || ''),
      cryptoAmount: String(b?.cryptoAmount || ''),
      feeBps: invoice.gateway?.feeBps ?? Math.round((invoice.gateway?.feePercent || 0) * 100),
      provider: invoice.gateway?.provider || 'MANUAL',
      raw: { source: 'admin-order', by: admin.email },
    })
    if (!settled.ok) return err(settled.message || 'payment settlement failed', 400)

    const job = await enqueueOrderFulfillment({
      orderId: order.id,
      invoiceId: invoice.id,
      planId: order.planId,
      productId: order.productId,
    })
    if (!job) {
      await auditAdmin({ req, actor: admin, action: 'order.markPaid', targetType: 'order', targetId: id, metadata: { invoiceId: invoice.id, fulfillmentJobId: null } })
      return ok({ ok: true })
    }
    const processed = await processFulfillmentJob(job.id)
    const warning = processed.ok ? undefined : `payment settled; fulfillment queued for retry: ${processed.message}`
    await auditAdmin({ req, actor: admin, action: 'order.markPaid', targetType: 'order', targetId: id, metadata: { invoiceId: invoice.id, fulfillmentJobId: job.id, fulfillmentProcessed: processed.ok, warning } })
    return ok({ ok: true, warning })
  }

  if (b?.action === 'cancel') {
    await db.order.update({ where: { id }, data: { status: 'CANCELLED' } })
    await auditAdmin({ req, actor: admin, action: 'order.cancel', targetType: 'order', targetId: id, metadata: { previousStatus: order.status } })
    return ok({ ok: true })
  }
  return err('unknown action')
}
