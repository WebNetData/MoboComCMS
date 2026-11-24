import type { Prisma } from '@prisma/client'
import type { BaleBinding } from '@/modules/billing/domain/pay-bale'
import { resolveCurrentUser, currentAdminHasPermission, adminNeedsTwoFactor } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'

export async function baleSourceOwner(binding: BaleBinding, tx: Prisma.TransactionClient) {
  const owner = await resolveCurrentUser(binding.ownerUserId, Date.now(), tx)
  return owner && currentAdminHasPermission(owner, 'mobocom-pay.manage') && !await adminNeedsTwoFactor(owner, tx) && await userOpensSection('mobocom-pay', owner.id) ? owner : null
}
