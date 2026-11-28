import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { userOpensSection } from '@/modules/account/server/section-access'
import { isPublicApiEnabled } from './availability'

/** Browser visibility and self-service key management are separate from machine API availability. */
export async function canManagePersonalApiKeys(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !await isPublicApiEnabled()) return false
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, erasedAt: true, payMerchant: { select: { status: true } } },
  })
  if (user?.status !== 'ACTIVE' || user.erasedAt) return false
  if (user.role === 'ADMIN') return true
  return user.payMerchant?.status === 'ACTIVE' &&
    await isModuleEnabled('mobocom-pay') && await userOpensSection('mobocom-pay', userId, true)
}
