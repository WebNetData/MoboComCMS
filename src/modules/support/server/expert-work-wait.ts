import type { Prisma, Ticket } from '@prisma/client'

export const EXPERT_WAIT_START = 'EXPERT_WAIT_START'
export const EXPERT_WAIT_END = 'EXPERT_WAIT_END'

export function expertWaitEventNote(ticketId: number) {
  return `expert-ticket:${ticketId}`
}

/** The ticket transaction is the only writer of expert waiting transitions. */
export async function recordExpertWorkWait(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, 'id' | 'status' | 'lastStaffAt' | 'expertRequestKey' | 'orderId'>,
  nextStatus: string,
  now: Date,
  actorId: number | null,
) {
  const wasWaiting = ticket.status === 'PENDING'
  const waits = nextStatus === 'PENDING'
  if (wasWaiting === waits) return
  if (!ticket.expertRequestKey || ticket.orderId === null) return
  const orderId = ticket.orderId
  const note = expertWaitEventNote(ticket.id)
  if (wasWaiting) {
    const previous = await tx.orderEvent.findFirst({ where: { orderId, note, status: EXPERT_WAIT_START }, select: { id: true } })
    // Older linked tickets have only their canonical last-staff timestamp.
    if (!previous && ticket.lastStaffAt && ticket.lastStaffAt < now) {
      await tx.orderEvent.create({ data: { orderId, status: EXPERT_WAIT_START, note, visible: false, createdAt: ticket.lastStaffAt } })
    }
  }
  await tx.orderEvent.create({ data: {
    orderId, note, status: waits ? EXPERT_WAIT_START : EXPERT_WAIT_END, visible: false, createdAt: now, actorId,
  } })
}
