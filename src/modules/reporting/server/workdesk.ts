import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { adminOrders } from '@/modules/store/server/orders'
import { formWorkdesk } from '@/modules/forms/server/workdesk'
import { allowedDepartmentSlugs, managesTickets } from '@/modules/support/server/department-access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { CRM_PERMISSIONS } from '@/modules/livechat/domain/crm-desk'
import type { FollowUpCounts } from '@/modules/livechat/domain/crm-follow-up-queue'
import { followUpWorkdesk } from '@/modules/livechat/server/crm-follow-up-queue'

export type WorkdeskItem = { id: string; title: string; href: string; updatedAt: string; assigneeId: number | null; detail?: string; dueDay?: string }
export type WorkdeskQueue = { key: 'store' | 'forms' | 'support' | 'crm'; available: boolean; reason?: 'disabled' | 'forbidden' | 'unavailable'; count?: number; items?: WorkdeskItem[]; due?: FollowUpCounts }

const unavailable = (key: WorkdeskQueue['key'], reason: WorkdeskQueue['reason']): WorkdeskQueue => ({ key, available: false, reason })

/** Build a small, permission and assignment scoped day view from the existing queue owners. */
export async function adminWorkdesk(req: NextRequest): Promise<WorkdeskQueue[]> {
  const [store, formsBuilder, formsHandler, support, crm] = await Promise.all([
    adminGuard(req, 'store', ['orders.manage', 'store.orders.handle']),
    requirePerm(req, 'cms.pages'),
    requirePerm(req, 'forms.handle'),
    requirePerm(req, 'tickets.handle'),
    adminGuard(req, 'livechat', CRM_PERMISSIONS),
  ])
  const tasks: Promise<WorkdeskQueue>[] = []

  if (!('response' in crm)) {
    tasks.push(followUpWorkdesk(crm.admin).then(result => ({
      key: 'crm' as const, available: true, due: result.counts,
      count: result.counts.today + result.counts.overdue + result.counts.upcoming,
      items: result.items.map(item => ({
        id: String(item.id), title: item.title, detail: item.customerName, href: `/admin/crm/${item.customerId}#follow-ups-heading`,
        updatedAt: item.updatedAt, assigneeId: item.assigneeId, dueDay: item.dueDay,
      })),
    })).catch(() => unavailable('crm', 'unavailable')))
  }

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
  if (!await isModuleEnabled('forms')) {
    // An inactive capability contributes no queue or setup prompt to this shared desk.
  } else if (!formActor) {
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
