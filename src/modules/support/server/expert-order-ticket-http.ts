import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auditAdminStrict } from '@/platform/audit/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { ExpertOrderTicketError, readExpertOrderTicket, writeExpertOrderTicket } from '@/modules/support/server/expert-order-ticket'

type Authorize = (tx: Prisma.TransactionClient, write: boolean) => Promise<{
  context: Parameters<typeof readExpertOrderTicket>[1]
  actor: { id: number; email: string }
}>

/** The source owner scopes this command before the linked Support thread is read or changed. */
export async function expertOrderTicketResponse(req: NextRequest, authorize: Authorize) {
  const write = req.method === 'POST'
  const input = write ? await req.json().catch(() => null) : null
  if (write && (!input || typeof input !== 'object' || Array.isArray(input))) return err('دادهٔ پیام معتبر نیست', 400)
  try {
    const ticket = await db.$transaction(async tx => {
      const { context, actor } = await authorize(tx, write)
      if (write) {
        const result = await writeExpertOrderTicket(tx, context, actor.id, input)
        if (result.sent) await auditAdminStrict({
          req, actor, action: result.created ? 'ticket.expert_order.open' : 'ticket.expert_order.reply',
          targetType: 'Ticket', targetId: result.id, metadata: { orderId: context.orderId, source: context.key },
        }, tx)
      }
      return readExpertOrderTicket(tx, context)
    })
    const response = ok({ ticket })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ExpertOrderTicketError) return err(error.message, error.status)
    throw error
  }
}
