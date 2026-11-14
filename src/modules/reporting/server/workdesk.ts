import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { adminOrders } from '@/modules/store/server/orders'
import { formWorkdesk } from '@/modules/forms/server/workdesk'
import { allowedDepartmentSlugs, managesTickets } from '@/modules/support/server/department-access'

export type WorkdeskItem = { id: string; title: string; href: string; updatedAt: string; assigneeId: number | null; detail?: string }
export type WorkdeskQueue = { key: 'store' | 'forms' | 'support'; available: boolean; reason?: 'disabled' | 'forbidden' | 'unavailable'; count?: number; items?: WorkdeskItem[] }

const unavailable = (key: WorkdeskQueue['key'], reason: WorkdeskQueue['reason']): WorkdeskQueue => ({ key, available: false, reason })

/** Build a small, permission and assignment scoped day view from the existing queue owners. */
export async function adminWorkdesk(req: NextRequest): Promise<WorkdeskQueue[]> {
  const [store, formsBuilder, formsHandler, support] = await Promise.all([
    adminGuard(req, 'store', ['orders.manage', 'store.orders.handle']),
    requirePerm(req, 'cms.pages'),
    requirePerm(req, 'forms.handle'),
    requirePerm(req, 'tickets.handle'),
  ])
  const tasks: Promise<WorkdeskQueue>[] = []

  if ('response' in store) {
    tasks.push(Promise.resolve(unavailable('store', store.response.status === 404 ? 'disabled' : 'forbidden')))
  } else {
    const manager = store.admin.roleId == null || Boolean(store.admin.permissions?.includes('orders.manage'))
    tasks.push(adminOrders({ tab: 'new', page: 1 }, { actorId: store.admin.id, manager }).then((result) => ({
      key: 'store' as const, available: true, count: result.total,
      items: result.orders.slice(0, 5).map((order) => ({ id: String(order.id), title: `#${order.id} · ${order.customer.name}`, href: `/admin/store/orders/${order.id}`, updatedAt: new Date(order.createdAt).toISOString(), assigneeId: order.assigneeId, detail: order.preview.map((line) => line.name).join('، ') })),
    })).catch(() => unavailable('store', 'unavailable')))
  }

  const formActor = formsBuilder || formsHandler
  if (!formActor) {
    tasks.push(Promise.resolve(unavailable('forms', 'forbidden')))
  } else {
    tasks.push(formWorkdesk(formActor).then(result => ({ key: 'forms' as const, available: true, ...result })).catch(() => unavailable('forms', 'unavailable')))
  }

  if (!support) {
    tasks.push(Promise.resolve(unavailable('support', 'forbidden')))
  } else {
    tasks.push((async () => {
      const departments = await allowedDepartmentSlugs(support)
      const canSeeAll = managesTickets(support)
      const rows = await db.ticket.findMany({
        where: {
          status: { in: ['OPEN', 'PENDING'] },
          ...(departments ? { department: { in: departments } } : {}),
          ...(!canSeeAll ? { OR: [{ assignedToId: null }, { assignedToId: support.id }] } : {}),
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 6,
        select: { id: true, subject: true, status: true, assignedToId: true, updatedAt: true, department: true },
      })
      const count = await db.ticket.count({
        where: {
        status: { in: ['OPEN', 'PENDING'] },
          ...(departments ? { department: { in: departments } } : {}),
          ...(!canSeeAll ? { OR: [{ assignedToId: null }, { assignedToId: support.id }] } : {}),
        },
      })
      return { key: 'support' as const, available: true, count, items: rows.slice(0, 5).map((row) => ({ id: String(row.id), title: row.subject, href: `/admin/tickets/${row.id}`, updatedAt: row.updatedAt.toISOString(), assigneeId: row.assignedToId, detail: row.department })) }
    })().catch(() => unavailable('support', 'unavailable')))
  }

  return Promise.all(tasks)
}
