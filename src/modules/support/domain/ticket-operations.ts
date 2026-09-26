export function ticketSlaDueAt(priority: string, createdAt = new Date()) {
  const hours = priority === 'urgent' ? 4 : priority === 'high' ? 8 : priority === 'low' ? 48 : 24
  return new Date(createdAt.getTime() + hours * 60 * 60_000)
}

export function ticketSlaState(ticket: { status: string; firstResponseAt: Date | null; slaDueAt: Date | null }, now = new Date()) {
  if (ticket.firstResponseAt || ticket.status === 'CLOSED') return 'MET'
  if (!ticket.slaDueAt) return 'UNSET'
  return ticket.slaDueAt.getTime() < now.getTime() ? 'BREACHED' : 'DUE'
}
