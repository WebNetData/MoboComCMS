import { db } from '@/platform/database/prisma'
import { deniedCapabilities } from '@/modules/identity/domain/restrictions'

/** Fresh account-authentication denial; module sanctions never affect this decision.
 * No cache or staff bypass: expiry and individual revocation apply on the next check.
 * Storage/validation failures propagate so authentication cannot fail open.
 */
export async function globalAuthenticationDenied(userId: number, now = new Date(), reader: Pick<typeof db, 'accessRestriction'> = db): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return true
  const rows = await reader.accessRestriction.findMany({ where: {
    userId, scope: 'GLOBAL', revokedAt: null, startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } })
  return deniedCapabilities(rows, now).has('identity.authenticate')
}
