import { db } from '@/platform/database/prisma'
import { emitExtensionEvent } from '@/extensions/server/runtime'
import { ticketSlaDueAt } from '@/modules/support/domain/ticket-operations'

export type SupportTicketCreateInput = {
  userId: number
  subject: string
  message: string
  priority: 'low' | 'normal' | 'high'
  department: string
  customFields: Record<string, string | boolean>
  orderId?: number
  productId?: number
  storeWarrantyDeviceId?: number
  subscriptionId?: number
  subscriptionUsername?: string
  subscriptionLink?: string
  device?: string
  issueType?: string
  attachments?: { filename: string; originalName: string; mimeType: string; size: number }[]
}

/** One canonical Support ticket and first message for all trusted intake adapters. */
export async function createSupportTicket(input: SupportTicketCreateInput) {
  const ticket = await db.ticket.create({
    data: {
      userId: input.userId, subject: input.subject, priority: input.priority,
      lastCustomerAt: new Date(), slaDueAt: ticketSlaDueAt(input.priority),
      department: input.department, customFields: JSON.stringify(input.customFields),
      orderId: input.orderId, productId: input.productId,
      storeWarrantyDeviceId: input.storeWarrantyDeviceId,
      subscriptionId: input.subscriptionId, subscriptionUsername: input.subscriptionUsername,
      subscriptionLink: input.subscriptionLink, device: input.device, issueType: input.issueType,
      messages: { create: { userId: input.userId, fromAdmin: false, body: input.message, ...(input.attachments?.length ? { attachments: { create: input.attachments } } : {}) } },
    },
  })
  await emitExtensionEvent('ticket.created', { ticketId: ticket.id, userId: input.userId, priority: ticket.priority })
  void import('@/modules/automation/server/engine').then(({ emitAutomation }) => emitAutomation('ticket.opened', `ticket:${ticket.id}`, input.userId, { ticket_id: ticket.id, department: input.department, priority: ticket.priority, subject: input.subject })).catch(() => {})
  void import('@/modules/sms/server/sms').then(async ({ notifyAdmins }) => {
    const user = await db.user.findUnique({ where: { id: input.userId }, select: { email: true } })
    await notifyAdmins('ADMIN_TICKET', { subject: input.subject.slice(0, 60), name: user?.email || '' })
  }).catch(() => {})
  return { id: ticket.id, priority: ticket.priority }
}
