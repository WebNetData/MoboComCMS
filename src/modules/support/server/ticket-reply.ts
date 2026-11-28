import type { NextRequest } from 'next/server'
import { Prisma, type Ticket } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm, type AuthedUser } from '@/modules/identity/server/access'
import { sanitizeMessage, richTextToPlain } from '@/shared/content/sanitize'
import { canHandleDepartment } from '@/modules/support/domain/department-config'
import { HELD_BY_ANOTHER, heldByAnother, managesTickets } from '@/modules/support/server/department-access'
import { TICKET_CHANGED, ticketWorkflowSelect, ticketWorkflowWhere } from '@/modules/support/server/ticket-workflow'
import { ticketAttachmentRows } from '@/modules/support/server/ticket-attachments'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { recordExpertWorkWait } from '@/modules/support/server/expert-work-wait'

export class TicketReplyError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'TicketReplyError'
  }
}

type TicketReplyFiles = Parameters<typeof ticketAttachmentRows>[0]
type TicketWorkflow = Pick<Ticket, keyof typeof ticketWorkflowSelect>

/** The shared atomic write used by the public ticket route and the reviewed desk action. */
export async function persistTicketReply(
  tx: Prisma.TransactionClient,
  ticket: TicketWorkflow & Pick<Ticket, 'userId'>,
  actorId: number,
  input: { message: string; staffReply: boolean; internal: boolean; close?: boolean; files?: TicketReplyFiles },
  expectedUpdatedAt?: Date,
): Promise<number | null> {
  const now = new Date()
  // Expert replies compare the same workflow fields in each direction. This
  // keeps concurrent customer responses and staff wait changes ordered.
  const status = input.staffReply ? input.close ? 'CLOSED' : 'PENDING' : 'OPEN'
  const claim = await tx.ticket.updateMany({
    where: {
      userId: ticket.userId,
      ...(!input.internal && (input.staffReply || ticket.expertRequestKey) ? ticketWorkflowWhere(ticket) : { id: ticket.id, department: ticket.department }),
      ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt, status: 'OPEN' } : {}),
    },
    data: {
      updatedAt: now,
      ...(input.internal ? {} : input.staffReply ? {
        status: input.close ? 'CLOSED' : 'PENDING',
        closedAt: input.close ? ticket.closedAt ?? now : null,
        lastStaffAt: now,
        firstResponseAt: ticket.firstResponseAt ?? now,
        assignedToId: ticket.assignedToId ?? actorId,
      } : { status: 'OPEN', closedAt: null, lastCustomerAt: now }),
    },
  })
  if (!claim.count) return null
  if (!input.internal) await recordExpertWorkWait(tx, ticket, status, now, actorId)
  const created = await tx.ticketMessage.create({
    data: {
      ticketId: ticket.id, userId: actorId, fromAdmin: input.staffReply, internal: input.internal, body: input.message,
      ...(input.files?.length ? { attachments: { create: ticketAttachmentRows(input.files) } } : {}),
    },
    select: { id: true },
  })
  return created.id
}

export async function notifyTicketReply(ticketId: number, customerId: number, messageId: number, tx?: Prisma.TransactionClient) {
  await createInboxEvent({
    userId: customerId, kind: 'TICKET_REPLY', dedupeKey: `ticket:${ticketId}:reply:${messageId}`,
    titleEn: 'Support replied to your ticket', titleFa: 'پشتیبانی به تیکت شما پاسخ داد',
    bodyEn: `Ticket #${ticketId} has a new reply.`, bodyFa: `تیکت شمارهٔ ${ticketId} پاسخ جدید دارد.`,
    href: `/dashboard/tickets/${ticketId}`,
  }, tx)
}

/** Applies a reviewed staff reply/note and its caller-owned receipt in one transaction. */
export async function applyDeskTicketReply(
  req: NextRequest,
  input: { id: number; stamp: string; note: string; internal: boolean },
  hooks: {
    beforeWrite: (tx: Prisma.TransactionClient) => Promise<void>
    commit: (tx: Prisma.TransactionClient, result: { id: number }) => Promise<void>
  },
): Promise<{ id: number }> {
  if (!Number.isSafeInteger(input.id) || input.id <= 0 || !Number.isFinite(Date.parse(input.stamp))) {
    throw new TicketReplyError('Invalid ticket or version', 400)
  }
  const message = sanitizeMessage(input.note.trim())
  if (!richTextToPlain(message)) throw new TicketReplyError('Message is required', 400)
  if (message.length > 12000) throw new TicketReplyError('Message is too long', 400)

  return db.$transaction(async tx => {
    const actor = await requirePerm(req, 'tickets.handle', tx)
    if (!actor) throw new TicketReplyError('forbidden', 403)
    const ticket = await tx.ticket.findUnique({
      where: { id: input.id },
      select: {
        ...ticketWorkflowSelect, userId: true, updatedAt: true,
      },
    })
    if (!ticket) throw new TicketReplyError('not found', 404)
    const department = managesTickets(actor)
      ? null
      : await tx.ticketDepartment.findUnique({ where: { slug: ticket.department }, select: { roleIds: true } })
    if (!managesTickets(actor) && !canHandleDepartment(actor, department)) throw new TicketReplyError('forbidden', 403)
    if (!input.internal && heldByAnother(actor, ticket.assignedToId)) throw new TicketReplyError(HELD_BY_ANOTHER, 403)
    if (ticket.status !== 'OPEN' || ticket.updatedAt.toISOString() !== input.stamp) {
      throw new TicketReplyError(TICKET_CHANGED, 409, 'TICKET_CHANGED')
    }

    await hooks.beforeWrite(tx)
    const messageId = await persistTicketReply(tx, ticket, actor.id, {
      message, staffReply: true, internal: input.internal,
    }, ticket.updatedAt)
    if (messageId == null) throw new TicketReplyError(TICKET_CHANGED, 409, 'TICKET_CHANGED')
    if (!input.internal) await notifyTicketReply(ticket.id, ticket.userId, messageId, tx)
    const result = { id: messageId }
    await hooks.commit(tx, result)
    return result
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
