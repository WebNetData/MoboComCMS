import type { NextRequest } from 'next/server'
import { businessTransaction } from './commands'
import { BusinessError } from '../domain/businesses'
import { businessId } from '../domain/profiles'
import { getExtensionState } from '@/extensions/server/state'
import { writeBusinessExperience, moderateBusinessExperience, replyToBusinessExperience } from '@/modules/reviews/server/reviews'
import { auditAdminStrict } from '@/platform/audit/server'
import { completeOwnerCase } from '@/modules/moderation/server/cases'
import type { Prisma } from '@prisma/client'

async function available(tx: Prisma.TransactionClient, id: number, published: boolean) {
  const business = await tx.businessProfile.findUnique({ where: { id }, include: { seller: { select: { status: true, userId: true } } } })
  if (!business || (published && business.status !== 'PUBLISHED') || (business.kind === 'SELLER' && business.seller?.status !== 'ACTIVE')) throw new BusinessError('کسب‌وکار در دسترس نیست', 404)
  return business
}

export async function submitBusinessExperience(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.businessId)
  return businessTransaction(req, false, async (tx, actor) => {
    const business = await available(tx, id, true)
    if (business.representativeId === actor.id || business.seller?.userId === actor.id) throw new BusinessError('نماینده نمی‌تواند برای کسب‌وکار خودش امتیاز ثبت کند', 403)
    const settings = (await getExtensionState('businesses', [], tx, true)).settings
    if (settings['moderate-reviews'] !== undefined && typeof settings['moderate-reviews'] !== 'boolean') throw new BusinessError('تنظیمات بررسی تجربه‌ها معتبر نیست', 409)
    return writeBusinessExperience(tx, actor.id, business, input, settings['moderate-reviews'] !== false)
  })
}

export async function decideBusinessExperience(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.businessId), reviewId = businessId(input.reviewId)
  if (input.action !== 'approve' && input.action !== 'reject') throw new BusinessError('تصمیم معتبر نیست')
  const action = input.action
  return businessTransaction(req, true, async (tx, actor) => {
    const business = await available(tx, id, false)
    await moderateBusinessExperience(tx, business, reviewId, action)
    if (business.kind !== 'SELLER') await completeOwnerCase(tx, 'business-experiences', reviewId, actor.id, action)
    await auditAdminStrict({ req, actor, action: `businesses.review.${action}`, targetType: business.kind === 'SELLER' ? 'seller-review' : 'item-review', targetId: reviewId, metadata: { businessId: id } }, tx)
    return { ok: true }
  })
}

export async function respondToBusinessExperience(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.businessId), reviewId = businessId(input.reviewId)
  return businessTransaction(req, false, async (tx, actor) => {
    const business = await available(tx, id, true)
    await replyToBusinessExperience(tx, business, actor.id, reviewId, input.reply)
    await auditAdminStrict({ req, actor, action: 'businesses.review.reply', targetType: business.kind === 'SELLER' ? 'seller-review' : 'item-review', targetId: reviewId, metadata: { businessId: id } }, tx)
    return { ok: true }
  })
}
