import type { Prisma } from '@prisma/client'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'

export type PackageCommandContext = Pick<AdminAuditInput, 'req' | 'actor'>
type Actor = AdminAuditInput['actor']
export class PackageAuthorityError extends Error {
  constructor() { super('forbidden'); this.name = 'PackageAuthorityError' }
}

/** Reuse canonical Identity at each command attempt; trusted legacy callers retain their contract. */
export async function packageCommandActor(context: PackageCommandContext | undefined, tx: Prisma.TransactionClient) {
  if (!context) return undefined
  const actor = await requirePerm(context.req, 'settings.manage', tx)
  if (!actor || actor.id !== context.actor.id) throw new PackageAuthorityError()
  return actor
}

export async function auditPackageCommand(tx: Prisma.TransactionClient, context: PackageCommandContext | undefined, actor: Actor | undefined, action: string, id: string, metadata: Record<string, unknown> = {}) {
  if (!context) return
  if (!actor) throw new PackageAuthorityError()
  await auditAdminStrict({ req: context.req, actor, action: `package.${action}`, targetType: 'package', targetId: id, metadata }, tx)
}
