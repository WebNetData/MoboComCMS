import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser, requirePerm } from '@/modules/identity/server/access'
import { sanitizeMessage, richTextToPlain, renderMessage } from '@/shared/content/sanitize'
import { HELD_BY_ANOTHER, canHandleTicket, heldByAnother } from '@/modules/support/server/department-access'
import { parseFields } from '@/modules/support/domain/department-config'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { parseTicketSubmission, removeTicketFiles, saveTicketFiles, TicketUploadError } from '@/modules/support/server/ticket-attachments'
import { pictureOf } from '@/modules/identity/domain/picture'
import { TICKET_CHANGED, ticketWorkflowSelect } from '@/modules/support/server/ticket-workflow'
import { readTicketService } from '@/modules/support/domain/ticket-service'
import { notifyTicketReply, persistTicketReply } from '@/modules/support/server/ticket-reply'

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid ticket id', 400)
  const ticket = await db.ticket.findUnique({ where: { id }, include: { user: { select: { name: true, email: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } }, subscription: { select: { username: true, subToken: true } }, storeWarrantyDevice: { select: { id: true, serial: true, imei: true, warrantyStartsAt: true, warrantyEndsAt: true, provider: true, conditions: true, orderLine: { select: { orderId: true, name: true, variantName: true } } } }, order: { select: { id: true, status: true, createdAt: true, currency: true, totalAmount: true, lines: { orderBy: { line: 'asc' }, select: { line: true, name: true, variantName: true, quantity: true } } } }, messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true } } } })
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
    serviceContext: readTicketService(ticket.serviceContext),
    order: ticket.order ? { id: ticket.order.id, status: ticket.order.status, createdAt: ticket.order.createdAt, currency: ticket.order.currency, totalAmount: ticket.order.totalAmount, lines: ticket.order.lines.map(line => ({ line: line.line, name: line.name, variantName: line.variantName, quantity: line.quantity })) } : null,
    customFields: JSON.parse(ticket.customFields || '{}'),
    userId: ticket.userId,
    user: ticket.user.email,
    userName: ticket.user.name,
    userAvatar: pictureOf(ticket.user),
    updatedAt: ticket.updatedAt,
    subscriptionId: ticket.subscriptionId,
    subscriptionUsername: ticket.subscriptionUsername || ticket.subscription?.username || '',
    subscriptionLink: ticket.subscriptionLink || (ticket.subscription ? await safeHappLink(ticket.subscription.subToken) : ''),
    device: ticket.device,
    issueType: ticket.issueType,
    warrantyDevice: ticket.storeWarrantyDevice ? {
      id: ticket.storeWarrantyDevice.id, orderId: ticket.storeWarrantyDevice.orderLine.orderId,
      name: ticket.storeWarrantyDevice.orderLine.name, variantName: ticket.storeWarrantyDevice.orderLine.variantName,
      serial: ticket.storeWarrantyDevice.serial, imei: ticket.storeWarrantyDevice.imei,
      warrantyStartsAt: ticket.storeWarrantyDevice.warrantyStartsAt, warrantyEndsAt: ticket.storeWarrantyDevice.warrantyEndsAt,
      provider: ticket.storeWarrantyDevice.provider, conditions: ticket.storeWarrantyDevice.conditions,
    } : null,
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
  const ticket = await db.ticket.findUnique({ where: { id }, select: { ...ticketWorkflowSelect, userId: true } })
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

  const internal = body?.internal === true
  const close = body?.close === true
  if (internal && !staffReply) return err('forbidden', 403)
  if (internal && close) return err('an internal note cannot close the ticket')
  try { await saveTicketFiles(files) }
  catch { return err('Could not save attachments / ذخیرهٔ پیوست‌ها ممکن نشد', 500) }
  let messageId: number | null
  try { messageId = await db.$transaction(tx => persistTicketReply(tx, ticket, user.id, { message, staffReply, internal, close, files })) } catch {
    await removeTicketFiles(files)
    return err('Could not send reply / ارسال پاسخ ممکن نشد', 500)
  }
  if (messageId === null) {
    await removeTicketFiles(files)
    return err(TICKET_CHANGED, 409, { code: 'TICKET_CHANGED' })
  }
  if (staffReply && !internal) {
    await notifyTicketReply(id, ticket.userId, messageId).catch(() => {})
  }
  return ok({ sent: true })
}
