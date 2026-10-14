import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { richTextToPlain, sanitizeMessage } from '@/shared/content/sanitize'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { auditAdmin } from '@/platform/audit/server'
import { HELD_BY_ANOTHER, allowedDepartmentSlugs, canHandleTicket, heldByAnother, managesTickets } from '@/modules/support/server/department-access'
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
  const existing = await db.ticket.findUnique({ where: { id }, select: { department: true, status: true, closedAt: true, lastStaffAt: true, lastCustomerAt: true, assignedToId: true } })
  if (!existing) return err('not found', 404)
  if (!await canHandleTicket(admin, existing.department)) return err('forbidden', 403)
  if (heldByAnother(admin, existing.assignedToId)) return err(HELD_BY_ANOTHER, 403)
  // Giving a ticket to a colleague is a manager's decision; anybody may take one nobody holds, or let go of their own.
  if (hasAssignment && !managesTickets(admin) && b.assignedToId != null && Number(b.assignedToId) !== admin.id) return err('سپردن تیکت به همکار دیگر با مدیر دپارتمان‌ها است', 403)
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

/**
 * POST /api/admin/tickets — a member of staff opens a ticket to a customer (to ask for a one-time code,
 * a missing detail of an order, anything). The customer sees it among their own tickets, already answered
 * by support and waiting for them, and is told in their inbox.
 */
export async function POST(req: NextRequest) {
  const staff = await requirePerm(req, 'tickets.handle' as Permission)
  if (!staff) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const subject = String(b?.subject || '').trim()
  const message = sanitizeMessage(String(b?.message || '').trim())
  const priority = ['low', 'normal', 'high'].includes(b?.priority) ? b.priority : 'normal'
  const department = String(b?.department || 'GENERAL')
  if (!subject || !richTextToPlain(message)) return err('موضوع و متن پیام الزامی است')
  if (subject.length > 200 || message.length > 12000) return err('پیام بیش از حد طولانی است')
  const departmentConfig = await db.ticketDepartment.findUnique({ where: { slug: department } })
  if (!departmentConfig?.active) return err('یک دپارتمان فعال انتخاب کنید')
  // A department that hangs a ticket on a subscription or a purchase cannot be opened from here without one.
  if (departmentConfig.requiresSubscription || departmentConfig.requiresProduct) return err('این دپارتمان به یک سرویس یا خرید وصل است؛ دپارتمان عمومی را انتخاب کنید')
  if (!await canHandleTicket(staff, department)) return err('forbidden', 403)

  // The customer, by account number, or by the exact e-mail or phone of the account.
  const raw = String(b?.user ?? '').trim()
  if (!raw) return err('کاربر را مشخص کنید')
  const digits = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\s-]/g, '')
  const phone = /^(\+98|0098|0)?9\d{9}$/.test(digits) ? `+98${digits.replace(/^(\+98|0098|0)/, '')}` : ''
  const found = await db.user.findMany({
    where: { OR: [...(/^\d{1,9}$/.test(digits) && !phone ? [{ id: Number(digits) }] : []), ...(raw.includes('@') ? [{ email: raw.toLowerCase() }] : []), ...(phone ? [{ phone }, { phone: `0${phone.slice(3)}` }] : [])] },
    select: { id: true, name: true, email: true, status: true }, take: 2,
  })
  if (found.length !== 1) return err(found.length ? 'بیش از یک کاربر با این مشخصات پیدا شد؛ شناسهٔ کاربر را وارد کنید' : 'کاربری با این مشخصات پیدا نشد', 404)
  const customer = found[0]
  if (customer.status !== 'ACTIVE') return err('این حساب فعال نیست', 409)

  const now = new Date()
  const ticket = await db.ticket.create({
    data: {
      userId: customer.id, subject, priority, department, status: 'PENDING', customFields: '{}',
      assignedToId: staff.id, firstResponseAt: now, lastStaffAt: now, slaDueAt: null,
      messages: { create: { userId: staff.id, fromAdmin: true, body: message } },
    },
    select: { id: true },
  })
  await createInboxEvent({
    userId: customer.id, kind: 'TICKET_REPLY', dedupeKey: `ticket:${ticket.id}:opened-by-staff`,
    titleEn: 'Support sent you a message', titleFa: 'پشتیبانی برای شما پیامی فرستاد',
    bodyEn: `Ticket #${ticket.id}: ${subject}`, bodyFa: `تیکت شمارهٔ ${ticket.id}: ${subject}`,
    href: `/dashboard/tickets/${ticket.id}`,
  }).catch(() => {})
  await auditAdmin({ req, actor: staff, action: 'ticket.open_for_customer', targetType: 'Ticket', targetId: ticket.id, metadata: { userId: customer.id, department } })
  return ok({ id: ticket.id, user: { id: customer.id, name: customer.name, email: customer.email } })
}
