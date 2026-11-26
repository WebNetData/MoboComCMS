import type { Ticket } from '@prisma/client'

export const ticketWorkflowSelect = {
  id: true, department: true, status: true, assignedToId: true,
  firstResponseAt: true, lastStaffAt: true, lastCustomerAt: true, closedAt: true,
} as const

// Compare workflow fields, so an unrelated internal note doesn't invalidate the decision.
export function ticketWorkflowWhere(ticket: Pick<Ticket, keyof typeof ticketWorkflowSelect>) {
  const { id, department, status, assignedToId, firstResponseAt, lastStaffAt, lastCustomerAt, closedAt } = ticket
  return { id, department, status, assignedToId, firstResponseAt, lastStaffAt, lastCustomerAt, closedAt }
}

export const TICKET_CHANGED = 'تیکت هم‌زمان تغییر کرد. آن را دوباره باز کنید و تلاش کنید.'
