import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number((await paramsPromise).id)
  if (!Number.isSafeInteger(id) || id < 1) return err('invalid subscription id', 400)
  const subscription = await db.subscription.findFirst({ where: { id, userId: user.id }, select: { id: true, orderId: true } })
  if (!subscription) return err('not found', 404)
  const [renewals, tickets] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { subscriptionId: id, kind: 'RENEW_SUBSCRIPTION', orderId: { not: null } }, select: { orderId: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.ticket.findMany({ where: { userId: user.id, subscriptionId: id }, select: { id: true, subject: true, status: true, updatedAt: true, department: true }, orderBy: { updatedAt: 'desc' }, take: 30 }),
  ])
  const orderIds = [...new Set([subscription.orderId, ...renewals.map(job => job.orderId)].filter((value): value is number => typeof value === 'number'))]
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds }, userId: user.id }, select: { id: true, totalAmount: true, currency: true, status: true, createdAt: true, invoice: { select: { number: true, status: true } } }, orderBy: { createdAt: 'desc' } }) : []
  const response = ok({
    orders: orders.map(order => ({ ...order, kind: order.id === subscription.orderId ? 'purchase' : 'renewal' })),
    tickets,
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
