import { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { payAudit, payContext, payTransaction, type PayActor } from '../context'
import { collectionSourceActor } from '../bale/collection-proof'
import { settleTransferCollection } from '../bale/collection-settle'
import { reviewCollection, reviewNote } from './review-context'

export function decideTransferReview(actor: PayActor, input: Record<string, unknown>) {
  const { noticeId, collectionId, version, action } = input, note = reviewNote(input.note)
  if (Object.keys(input).some(k => !['noticeId','collectionId','version','action','note'].includes(k)) || typeof noticeId !== 'string' || noticeId.length > 100 || !noticeId || !Number.isSafeInteger(version) || Number(version) < 0 || typeof action !== 'string' || !['assign','dismiss','confirm'].includes(action) || (collectionId !== undefined && (typeof collectionId !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(collectionId)))) throw new PayError('درخواست بررسی معتبر نیست', 422)
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const notice = await tx.payBaleNotice.findUnique({ where: { id: noticeId }, include: { transferReview: true, collectionMatch: true } })
    if (!notice || notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT' || !notice.amountMinor) throw new PayError('مدرک واریز معتبر پیدا نشد', 404)
    const record = notice.transferReview
    if ((record?.version || 0) !== version || record && record.status !== 'OPEN') throw new PayError('نتیجهٔ بررسی تغییر کرده؛ تازه‌سازی کنید', 409)
    const target = typeof collectionId === 'string' ? collectionId : record?.collectionId || notice.collectionMatch?.id || null
    if (action === 'assign' && !target) throw new PayError('درخواست پرداخت را انتخاب کنید', 422)
    // Invoice first: every financial path, including receipt review, owns this fence.
    const initial = target ? await reviewCollection(tx, actor, target, action === 'confirm') : null
    if (initial) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id"=${initial.invoiceId} FOR UPDATE`)
    let row = target ? await reviewCollection(tx, actor, target, action === 'confirm') : null
    if (row && row.bankAccountId !== notice.bankAccountId) throw new PayError('حساب مقصد با مدرک برابر نیست', 409)
    const reserved = await tx.payBaleCollection.findUnique({ where: { collectedRial: notice.amountMinor }, select: { id: true } })
    if (row && reserved && reserved.id !== row.id) throw new PayError('این مبلغ برای درخواست دیگری رزرو شده است', 409)
    if (notice.collectionMatch && row?.id !== notice.collectionMatch.id) throw new PayError('مدرک به درخواست دیگری متصل است', 409)
    if (action === 'confirm') {
      if (!row || !['PENDING','UNDER_REVIEW','EXPIRED','REVIEW'].includes(row.status) || row.invoice.status !== 'UNPAID' || !row.acceptedAt || notice.receivedAt < row.createdAt || notice.sourceSentAt < row.acceptedAt || notice.sourceSentAt < row.validFrom || row.noticeId && row.noticeId !== notice.id) throw new PayError('این مدرک برای تأیید درخواست قابل استفاده نیست', 409)
      await collectionSourceActor(tx, row, notice)
    }
    const status = action === 'confirm' ? 'CONFIRMED' : action === 'dismiss' ? 'DISMISSED' : 'OPEN'
    const data = { collectionId: target, status, note, reviewedBy: actor.id, reviewedAt: new Date() }
    if (record) {
      const claim = await tx.payTransferReview.updateMany({ where: { noticeId, version: Number(version), status: 'OPEN' }, data: { ...data, version: { increment: 1 } } })
      if (claim.count !== 1) throw new PayError('بررسی هم‌زمان تغییر کرد', 409)
    } else await tx.payTransferReview.create({ data: { noticeId, ...data } })
    let financialApproval = false
    if (action === 'confirm' && row) {
      if (row.status === 'EXPIRED') {
        const claim = await tx.payBaleCollection.updateMany({ where: { id: row.id, status: 'EXPIRED' }, data: { status: 'REVIEW', reviewReason: 'LATE_TRANSFER', noticeId: notice.id } })
        if (claim.count !== 1) throw new PayError('درخواست هم‌زمان تغییر کرد', 409)
        row = { ...row, status: 'REVIEW' }
      }
      const result = await settleTransferCollection(tx, row, { method: 'REVIEWED_NOTICE', noticeId: notice.id, actor })
      if (!result.financialApproval || result.alreadyPaid) throw new PayError('فاکتور قبلاً تسویه شده است', 409)
      financialApproval = true
    }
    await payAudit(tx, actor, 'transfer-review.' + action, 'transfer-review:' + noticeId, { collectionId: target, version: Number(version) + 1, note, financialApproval })
    return { status, version: Number(version) + 1, financialApproval }
  })
}
