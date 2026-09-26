import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'dashboard.view' as Permission)
  if (!admin) return err('forbidden', 403)

  const [users, orders, subs, tickets, pendingAgg, expiringSoon] = await Promise.all([
    db.user.count(),
    db.order.count(),
    db.subscription.count(),
    db.ticket.count({ where: { status: 'OPEN' } }),
    db.order.count({ where: { status: 'PENDING' } }),
    db.subscription.count({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  const recentOrders = await db.order.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true, name: true } }, plan: { select: { name: true } } },
  })

  const openTickets = await db.ticket.findMany({
    where: { status: 'OPEN' },
    take: 5,
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { email: true, name: true } } },
  })

  const activeSubs = await db.subscription.count({ where: { status: 'ACTIVE' } })

  return ok({
    stats: {
      users,
      orders,
      subs,
      activeSubs,
      openTickets: tickets,
      pendingOrders: pendingAgg,
      expiringSoon,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      user: o.user.email,
      plan: o.plan?.name || '-',
      amount: o.totalAmount,
      currency: o.currency,
      status: o.status,
      createdAt: o.createdAt,
    })),
    openTickets: openTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      user: t.user.email,
      priority: t.priority,
      updatedAt: t.updatedAt,
    })),
  })
}
