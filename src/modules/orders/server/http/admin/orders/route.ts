import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { settleInvoiceManually } from '@/modules/billing/server/settle'
import { cancelUnpaidOrder } from '@/modules/billing/server/order-closure'
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
      user: o.user?.email || '',
      userName: o.customerName || o.user?.name || 'مشتری حضوری',
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

    const settled = await settleInvoiceManually({
      invoiceId: invoice.id, providerTxnId: String(b?.providerTxnId || ''),
      cryptoCurrency: String(b?.cryptoCurrency || ''), cryptoAmount: String(b?.cryptoAmount || ''),
      raw: { source: 'admin-order', by: admin.email },
    })
    if (!settled.ok) return err(settled.message, settled.status)
    await auditAdmin({ req, actor: admin, action: 'order.markPaid', targetType: 'order', targetId: id, metadata: { invoiceId: invoice.id, warning: settled.warning } })
    return ok({ ok: true, warning: settled.warning })
  }

  if (b?.action === 'cancel') {
    const cancelled = await cancelUnpaidOrder(id, `credit released for order ${id} (cancelled by ${admin.email})`)
    if (!cancelled.ok) return err(cancelled.message, cancelled.status)
    await auditAdmin({ req, actor: admin, action: 'order.cancel', targetType: 'order', targetId: id, metadata: { previousStatus: order.status } })
    return ok({ ok: true })
  }
  return err('unknown action')
}
