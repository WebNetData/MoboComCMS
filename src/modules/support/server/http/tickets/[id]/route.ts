import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser, requirePerm } from '@/modules/identity/server/access'
import { sanitizeMessage, richTextToPlain, renderMessage } from '@/shared/content/sanitize'
import { HELD_BY_ANOTHER, canHandleTicket, heldByAnother } from '@/modules/support/server/department-access'
import { parseFields } from '@/modules/support/domain/department-config'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { parseTicketSubmission, removeTicketFiles, saveTicketFiles, ticketAttachmentRows, TicketUploadError } from '@/modules/support/server/ticket-attachments'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid ticket id', 400)
  const ticket = await db.ticket.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } }, subscription: { select: { username: true, subToken: true } }, messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true } } } })
  if (!ticket) return err('not found', 404)
  const staffView = user.role === 'ADMIN' && req.nextUrl.searchParams.get('asCustomer') !== '1'
  if (staffView) {
    if (!await requirePerm(req, 'tickets.handle') || !await canHandleTicket(user, ticket.department)) return err('forbidden', 403)
  } else if (ticket.userId !== user.id) return err('forbidden', 403)
  const departmentConfig = await db.ticketDepartment.findUnique({ where: { slug: ticket.department }, select: { nameFa: true, nameEn: true, fields: true } })
  return ok({
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    department: ticket.department,
    departmentName: departmentConfig ? { fa: departmentConfig.nameFa, en: departmentConfig.nameEn } : { fa: ticket.department, en: ticket.department },
    departmentFields: parseFields(departmentConfig?.fields || '[]'),
    productId: ticket.productId,
    customFields: JSON.parse(ticket.customFields || '{}'),
    userId: ticket.userId,
    user: ticket.user.email,
    userName: ticket.user.name,
    updatedAt: ticket.updatedAt,
    subscriptionId: ticket.subscriptionId,
    subscriptionUsername: ticket.subscriptionUsername || ticket.subscription?.username || '',
    subscriptionLink: ticket.subscriptionLink || (ticket.subscription ? await safeHappLink(ticket.subscription.subToken) : ''),
    device: ticket.device,
    issueType: ticket.issueType,
    assignedToId: staffView ? ticket.assignedToId : undefined,
    slaDueAt: staffView ? ticket.slaDueAt : undefined,
    firstResponseAt: staffView ? ticket.firstResponseAt : undefined,
    messages: ticket.messages.filter(m => staffView || !m.internal).map((m) => ({
      id: m.id,
      fromAdmin: m.fromAdmin,
      internal: m.internal,
      body: renderMessage(m.body),
      createdAt: m.createdAt,
      attachments: m.attachments.map(file => ({ id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.size, url: `/api/tickets/${ticket.id}/attachments/${file.id}` })),
    })),
  })
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid ticket id', 400)
  const ticket = await db.ticket.findUnique({ where: { id } })
  if (!ticket) return err('not found', 404)
  let body: any, files: Awaited<ReturnType<typeof parseTicketSubmission>>['files']
  try { ({ body, files } = await parseTicketSubmission(req)) }
  catch (error) { return error instanceof TicketUploadError ? err(error.message, error.status) : err('Could not read reply / دریافت پاسخ ممکن نشد') }
  const staffReply = user.role === 'ADMIN' && body?.asCustomer !== true
  if (staffReply) {
    const agent = await requirePerm(req, 'tickets.handle')
    if (!agent || !await canHandleTicket(agent, ticket.department)) return err('forbidden', 403)
    if (body?.internal !== true && heldByAnother(agent, ticket.assignedToId)) return err(HELD_BY_ANOTHER, 403)
  } else if (ticket.userId !== user.id) return err('forbidden', 403)
  const message = sanitizeMessage(String(body?.message || '').trim())
  if (!richTextToPlain(message)) return err('Message is required / متن پیام الزامی است')
  if (message.length > 12000) return err('Message is too long / متن پیام طولانی است')

  const nextStatus = staffReply
    ? (body?.close === true ? 'CLOSED' : body?.internal === true ? ticket.status : 'PENDING')
    : 'OPEN'
  if (body?.internal === true && !staffReply) return err('forbidden', 403)
  if (body?.internal === true && body?.close === true) return err('an internal note cannot close the ticket')
  const now = new Date()
  try { await saveTicketFiles(files) }
  catch { return err('Could not save attachments / ذخیرهٔ پیوست‌ها ممکن نشد', 500) }
  let messageId = 0
  try { messageId = await db.$transaction(async tx => {
    const created = await tx.ticketMessage.create({ data: { ticketId: id, userId: user.id, fromAdmin: staffReply, internal: staffReply && body?.internal === true, body: message, ...(files.length ? { attachments: { create: ticketAttachmentRows(files) } } : {}) } })
    await tx.ticket.update({ where: { id }, data: {
      status: nextStatus,
      updatedAt: now,
      closedAt: nextStatus === 'CLOSED' ? (ticket.closedAt || now) : null,
      // The first member of staff to answer a ticket nobody holds becomes its holder.
      ...(staffReply ? body?.internal === true ? {} : { lastStaffAt: now, firstResponseAt: ticket.firstResponseAt || now, assignedToId: ticket.assignedToId ?? user.id } : { lastCustomerAt: now }),
    } })
    return created.id
  }) } catch {
    await removeTicketFiles(files)
    return err('Could not send reply / ارسال پاسخ ممکن نشد', 500)
  }
  if (staffReply && body?.internal !== true && messageId) {
    await createInboxEvent({
      userId: ticket.userId, kind: 'TICKET_REPLY', dedupeKey: `ticket:${id}:reply:${messageId}`,
      titleEn: 'Support replied to your ticket', titleFa: 'پشتیبانی به تیکت شما پاسخ داد',
      bodyEn: `Ticket #${id} has a new reply.`, bodyFa: `تیکت شمارهٔ ${id} پاسخ جدید دارد.`,
      href: `/dashboard/tickets/${id}`,
    }).catch(() => {})
  }
  return ok({ sent: true })
}
