import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { CloudWorkspaceError, cloudWorkspaceUser } from '@/modules/hosting/server/workspace-access'
import { merchantPortalAccess } from '@/modules/billing/server/pay'
import { PayError } from '@/modules/billing/domain/pay'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { runsSection } from '@/modules/site/domain/maintenance'
import { ticketServiceKey, type TicketServiceContext, type TicketWorkspace } from '@/modules/support/domain/ticket-service'

export class TicketWorkspaceError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function requireTicketWorkspace(req: NextRequest, workspace: TicketWorkspace, user: AuthedUser) {
  try {
    if (workspace === 'cloud') {
      await cloudWorkspaceUser(req)
      return
    }
    const access = await merchantPortalAccess(req)
    if (access.status !== 'ACTIVE') throw new TicketWorkspaceError('پذیرندهٔ فعال لازم است.', 403)
    const maintenance = (await loadMaintenance(true))['mobocom-pay']
    if (maintenance?.enabled && !runsSection({ role: user.role, roleId: user.roleId ?? null, permissions: user.permissions }, 'mobocom-pay')) {
      throw new TicketWorkspaceError('موبوکام‌پی در حال به‌روزرسانی است.', 503)
    }
  } catch (error) {
    if (error instanceof CloudWorkspaceError || error instanceof PayError) throw new TicketWorkspaceError(error.message, error.status)
    throw error
  }
}

function service(kind: string, id: number | string, label: string): TicketServiceContext {
  return { key: kind + ':' + id, label: label.trim().slice(0, 200) || '#' + id }
}

const merchantOwner = (userId: number) => ({ userId, status: 'ACTIVE' })

export async function ticketWorkspaceServices(workspace: TicketWorkspace, userId: number): Promise<TicketServiceContext[]> {
  if (workspace === 'pay') {
    const terminals = await db.payTerminal.findMany({
      where: { merchant: merchantOwner(userId) },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    return terminals.map(row => service('pay-terminal', row.id, row.name))
  }
  const [services, domains] = await Promise.all([
    db.hostingService.findMany({ where: { userId }, select: { id: true, label: true }, orderBy: [{ label: 'asc' }, { id: 'asc' }] }),
    db.domain.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  ])
  return [
    ...services.map(row => service('cloud-service', row.id, row.label)),
    ...domains.map(row => service('cloud-domain', row.id, row.name)),
  ]
}

export async function ticketWorkspaceService(workspace: TicketWorkspace, userId: number, rawKey: unknown): Promise<TicketServiceContext> {
  const parsed = ticketServiceKey(rawKey)
  if (!parsed) throw new TicketWorkspaceError('شناسهٔ سرویس معتبر نیست.', 422)
  if (workspace === 'pay' && parsed.kind === 'pay-terminal') {
    const row = await db.payTerminal.findFirst({ where: { id: parsed.id, merchant: merchantOwner(userId) }, select: { id: true, name: true } })
    if (row) return service(parsed.kind, row.id, row.name)
  }
  if (workspace === 'cloud' && parsed.kind === 'cloud-service') {
    const row = await db.hostingService.findFirst({ where: { userId, id: parsed.id }, select: { id: true, label: true } })
    if (row) return service(parsed.kind, row.id, row.label)
  }
  if (workspace === 'cloud' && parsed.kind === 'cloud-domain') {
    const row = await db.domain.findFirst({ where: { userId, id: parsed.id }, select: { id: true, name: true } })
    if (row) return service(parsed.kind, row.id, row.name)
  }
  throw new TicketWorkspaceError('سرویس در این بخش پیدا نشد.', 404)
}
