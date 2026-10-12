import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { RepoError } from '@/modules/repository/domain/repository'

export type VendorLicenseContext = Pick<AdminAuditInput, 'req' | 'actor'>
type LicenseAudit = { action: string; targetId: number; metadata?: Record<string, unknown> }

export async function assertVendorLicenseAuthority(context: VendorLicenseContext, tx: Prisma.TransactionClient) {
  let actor
  for (const permission of ['repository.manage', 'settings.manage']) {
    actor = await requirePerm(context.req, permission, tx)
    if (actor) break
  }
  if (!actor || actor.id !== context.actor.id) throw new RepoError('forbidden', 403)
  if (await moduleGuard('repository', tx)) throw new RepoError('repository unavailable', 404)
  return actor
}

/** Database-only vendor license command; existing buyer/trusted callers retain their own admission contract. */
export async function commitVendorLicense<T>(context: VendorLicenseContext | undefined, work: (tx: Prisma.TransactionClient) => Promise<T>, audit: (result: T) => LicenseAudit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = context ? await assertVendorLicenseAuthority(context, tx) : undefined
        const result = await work(tx)
        if (context && actor) {
          const entry = audit(result)
          await auditAdminStrict({ req: context.req, actor, action: `repository.license.${entry.action}`, targetType: 'repository', targetId: String(entry.targetId), metadata: entry.metadata || {} }, tx)
        }
        return result
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 })
    } catch (error) {
      if (attempt >= 4 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2034') throw error
    }
  }
}
