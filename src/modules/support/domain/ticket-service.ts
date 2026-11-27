export type TicketWorkspace = 'cloud' | 'pay'
export type TicketServiceContext = { key: string; label: string }

export function ticketServiceKey(value: unknown) {
  if (typeof value !== 'string') return null
  const cloud = /^(cloud-service|cloud-domain):([1-9][0-9]{0,9})$/.exec(value)
  if (cloud && Number(cloud[2]) <= 2147483647) {
    return { kind: cloud[1] === 'cloud-service' ? 'cloud-service' as const : 'cloud-domain' as const, id: Number(cloud[2]) }
  }
  const terminal = /^pay-terminal:([A-Za-z0-9_-]{1,80})$/.exec(value)
  return terminal ? { kind: 'pay-terminal' as const, id: terminal[1] } : null
}

export function readTicketService(raw: string): TicketServiceContext | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    return value && ticketServiceKey(value.key) && typeof value.label === 'string' && value.label.length <= 200 ? { key: value.key, label: value.label } : null
  } catch { return null }
}
