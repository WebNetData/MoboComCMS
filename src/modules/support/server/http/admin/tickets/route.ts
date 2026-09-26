import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { richTextToPlain } from '@/shared/content/sanitize'
import { allowedDepartmentSlugs, canHandleTicket } from '@/modules/support/server/department-access'
import { ticketSlaState } from '@/modules/support/domain/ticket-operations'
import { parsePermissions } from '@/modules/identity/rbac'
import { canHandleDepartment } from '@/modules/support/domain/department-config'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'tickets.handle' as Permission)
  if (!admin) return err('forbidden', 403)
  const allowed = await allowedDepartmentSlugs(admin)
  if (req.nextUrl.searchParams.get('view') === 'staff') {
    const [staff, departments] = await Promise.all([
      db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, name: true, email: true, roleId: true, roleRef: { select: { permissions: true } } }, orderBy: { id: 'asc' } }),
      db.ticketDepartment.findMany({ select: { slug: true, roleIds: true } }),
    ])
    return ok(staff.filter(person => person.roleId == null || parsePermissions(person.roleRef?.permissions || '').includes('tickets.handle')).map(person => ({
      id: person.id, name: person.name || person.email,
      departments: person.roleId == null ? null : departments.filter(department => canHandleDepartment({ role: 'ADMIN', roleId: person.roleId, permissions: parsePermissions(person.roleRef?.permissions || '') }, department)).map(department => department.slug),
    })))
  }
  const [tickets, departments] = await Promise.all([db.ticket.findMany({
    where: allowed === null ? undefined : { department: { in: allowed } },
    include: { user: { select: { email: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  }), db.ticketDepartment.findMany({ select: { slug: true, nameFa: true, nameEn: true } })])
  const names = new Map(departments.map(d => [d.slug, { fa: d.nameFa, en: d.nameEn }]))
  return ok(
    tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      assignedToId: t.assignedToId,
      slaDueAt: t.slaDueAt,
      sla: ticketSlaState(t),
      department: t.department,
      departmentName: names.get(t.department) || { fa: t.department, en: t.department },
      subscriptionId: t.subscriptionId,
      productId: t.productId,
      user: t.user.email,
      userName: t.user.name,
      lastMessage: richTextToPlain(t.messages[0]?.body || '', 120),
      updatedAt: t.updatedAt,
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'tickets.handle' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  const status = b?.status
  const hasAssignment = Object.prototype.hasOwnProperty.call(b || {}, 'assignedToId')
  if (!id || (status === undefined && !hasAssignment) || (status !== undefined && !['OPEN', 'PENDING', 'CLOSED'].includes(status))) return err('invalid input')
  const existing = await db.ticket.findUnique({ where: { id }, select: { department: true, status: true, closedAt: true, lastStaffAt: true, lastCustomerAt: true } })
  if (!existing) return err('not found', 404)
  if (!await canHandleTicket(admin, existing.department)) return err('forbidden', 403)
  if (status === 'PENDING' && (!existing.lastStaffAt || (existing.lastCustomerAt && existing.lastStaffAt < existing.lastCustomerAt))) return err('reply to the customer before marking the ticket answered', 400)
  let assignedToId: number | null | undefined
  if (hasAssignment) {
    assignedToId = b.assignedToId == null ? null : Number(b.assignedToId)
    if (assignedToId !== null) {
      if (!Number.isSafeInteger(assignedToId) || assignedToId <= 0) return err('invalid assignee')
      const staff = await db.user.findUnique({ where: { id: assignedToId }, include: { roleRef: true } })
      if (!staff || staff.status !== 'ACTIVE' || staff.role !== 'ADMIN' || (staff.roleId != null && !parsePermissions(staff.roleRef?.permissions || '').includes('tickets.handle')) || !await canHandleTicket({ id: staff.id, email: staff.email, role: staff.role, roleId: staff.roleId, permissions: staff.roleId == null ? null : parsePermissions(staff.roleRef?.permissions || '') }, existing.department)) return err('assignee cannot handle this department', 403)
    }
  }
  const t = await db.ticket.update({ where: { id }, data: { ...(status ? { status, closedAt: status === 'CLOSED' ? (existing.status === 'CLOSED' ? existing.closedAt || new Date() : new Date()) : null } : {}), ...(hasAssignment ? { assignedToId } : {}) } })
  return ok({ id: t.id, status: t.status, assignedToId: t.assignedToId })
}
