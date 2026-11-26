import type { Prisma } from '@prisma/client'
import { resolveCurrentUser, currentAdminHasPermission, adminNeedsTwoFactor } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'

export async function sourceOwner(ownerUserId: number, tx: Prisma.TransactionClient) {
  const owner = await resolveCurrentUser(ownerUserId, Date.now(), tx)
  return owner && currentAdminHasPermission(owner, 'mobocom-pay.manage') && !await adminNeedsTwoFactor(owner, tx) && await userOpensSection('mobocom-pay', owner.id) ? owner : null
}
