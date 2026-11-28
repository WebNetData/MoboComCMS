import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import { VIRTUAL_ORDER } from '@/modules/store/server/staff-delivery'
import { err } from '@/platform/http/response'
import { ExpertOrderTicketError } from '@/modules/support/server/expert-order-ticket'
import { expertOrderTicketResponse } from '@/modules/support/server/expert-order-ticket-http'

type RouteContext = { params: Promise<{ id: string }> }

async function expertOrderTicket(req: NextRequest, { params }: RouteContext) {
  const disabled = await moduleGuard('store')
  if (disabled) return disabled
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return err('شمارهٔ سفارش معتبر نیست', 400)
  return expertOrderTicketResponse(req, async (tx, write) => {
    const actor = await requirePerm(req, 'orders.manage', tx) || await requirePerm(req, 'store.orders.handle', tx)
    if (!actor) throw new ExpertOrderTicketError('دسترسی مجاز نیست', 403)
    const order = await tx.order.findFirst({
      where: { ...VIRTUAL_ORDER, id, productId: { not: null }, status: 'PAID' },
      select: { userId: true, assigneeId: true, updatedAt: true, productDelivery: { select: { status: true } } },
    })
    if (!order || order.userId === null) throw new ExpertOrderTicketError('سفارش پرداخت‌شده پیدا نشد', 404)
    if (order.assigneeId !== actor.id) throw new ExpertOrderTicketError('ابتدا سفارش را بردارید', 403)
    if (write) {
      if (!order.productDelivery || !['PENDING', 'PROCESSING'].includes(order.productDelivery.status)) throw new ExpertOrderTicketError('رسیدگی این سفارش پایان یافته است', 409)
      const claim = await tx.order.updateMany({
        where: {
          id, assigneeId: actor.id, userId: order.userId, status: 'PAID', updatedAt: order.updatedAt,
          productDelivery: { is: { status: order.productDelivery.status } },
        },
        data: { updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)) },
      })
      if (!claim.count) throw new ExpertOrderTicketError('وضعیت سفارش تغییر کرد. صفحه را تازه کنید.', 409)
    }
    return { actor, context: { key: `store:${id}`, orderId: id, userId: order.userId } }
  })
}

export { expertOrderTicket as GET, expertOrderTicket as POST }
