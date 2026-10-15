import type { NextRequest } from 'next/server'
import { businessTransaction } from './commands'
import { businessId } from '../domain/profiles'
import { BusinessError } from '../domain/businesses'
import { reportReason, trustNote } from '../domain/trust'
import { trustTarget } from './trust-content'
import { businessTrustPolicy } from './trust-policy'
import { createBusinessReviewReport } from '@/modules/community/server/community'
import { moderateBusinessExperience } from '@/modules/reviews/server/reviews'
import { auditAdminStrict } from '@/platform/audit/server'

export async function reportBusinessExperience(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.businessId), reviewId = businessId(input.reviewId), reason = reportReason(input.reason), note = trustNote(input.note)
  return businessTransaction(req, false, async (tx, actor) => {
    if (!(await businessTrustPolicy(tx)).reports) throw new BusinessError('ثبت گزارش فعلاً غیرفعال است', 403)
    const { business, review, digest } = await trustTarget(tx, id, reviewId)
    if (review.status !== 'APPROVED') throw new BusinessError('تجربهٔ منتشرشده پیدا نشد', 404)
    const result = await createBusinessReviewReport(tx, { businessId: id, itemReviewId: business.kind === 'SELLER' ? null : reviewId, sellerReviewId: business.kind === 'SELLER' ? reviewId : null, reporterId: actor.id, reason, note, businessReviewDigest: digest })
    if (!result.duplicate) await auditAdminStrict({ req, actor, action: 'businesses.report.create', targetType: 'community-report', targetId: result.id, metadata: { businessId: id } }, tx)
    return { reported: true, duplicate: result.duplicate }
  })
}

export async function decideBusinessReport(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.reportId), note = trustNote(input.decisionNote)
  if (input.decision !== 'RESOLVED' && input.decision !== 'DISMISSED') throw new BusinessError('تصمیم معتبر نیست')
  const decision = input.decision
  if (input.hide === true && decision !== 'RESOLVED') throw new BusinessError('پنهان‌کردن فقط همراه پذیرش گزارش مجاز است')
  return businessTransaction(req, true, async (tx, actor) => {
    const report = await tx.communityReport.findFirst({ where: { id, businessId: { not: null }, status: 'OPEN' } })
    if (!report) throw new BusinessError('گزارش پیدا نشد یا قبلاً بررسی شده است', 409)
    const target = await trustTarget(tx, report.businessId!, report.itemReviewId || report.sellerReviewId!, false)
    if (actor.id === report.reporterId || actor.id === target.business.representativeId) throw new BusinessError('این گزارش باید توسط مدیر مستقلی بررسی شود', 403)
    if ((target.business.kind === 'SELLER') !== !!report.sellerReviewId) throw new BusinessError('منبع گزارش معتبر نیست', 409)
    if (input.hide === true) {
      if (target.digest !== report.businessReviewDigest || target.review.status !== 'APPROVED') throw new BusinessError('تجربه تغییر کرده است؛ برای نسخهٔ جدید تصمیم بگیرید', 409)
      await moderateBusinessExperience(tx, target.business, target.review.id, 'reject')
    }
    const changed = await tx.communityReport.updateMany({ where: { id, businessId: report.businessId, status: 'OPEN' }, data: { status: decision, decisionNote: note, reviewedById: actor.id, reviewedAt: new Date() } })
    if (changed.count !== 1) throw new BusinessError('وضعیت گزارش تغییر کرده است', 409)
    await auditAdminStrict({ req, actor, action: 'businesses.report.decide', targetType: 'community-report', targetId: id, metadata: { businessId: report.businessId, decision, hide: input.hide === true } }, tx)
    return { status: decision }
  })
}
