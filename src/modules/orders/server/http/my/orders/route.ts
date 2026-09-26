import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const orders = await db.order.findMany({
    where: { userId: user.id },
    include: { plan: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return ok(
    orders.map((o) => ({
      id: o.id,
      plan: o.plan?.name || '-',
      amount: o.totalAmount,
      currency: o.currency,
      status: o.status,
      createdAt: o.createdAt,
    }))
  )
}
