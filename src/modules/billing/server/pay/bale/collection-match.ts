import { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { auditSystemStrict } from '@/platform/audit/server'
import { payTransaction } from '../context'
import { settleTransferCollection } from './collection-settle'
import { collectionSourceActor } from './collection-proof'

/** Only immutable, authenticated source facts and the globally reserved amount select a quote. */
export async function matchBaleNotice(id: string) {
  return payTransaction(async tx => {
    const notice = await tx.payBaleNotice.findUniqueOrThrow({ where: { id } })
    if (notice.sourceType !== 'SMS') return { financialApproval: false }
    if (notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT' || !notice.amountMinor) return { financialApproval: false }
    const initial = await tx.payBaleCollection.findUnique({ where: { collectedRial: notice.amountMinor } })
    if (!initial || initial.bankAccountId !== notice.bankAccountId) return { financialApproval: false }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${initial.invoiceId} FOR UPDATE`)
    const row = await tx.payBaleCollection.findUniqueOrThrow({ where: { id: initial.id } })
    if (row.status === 'PAID') return { financialApproval: true, alreadyPaid: true, collectionId: row.id, collectionStatus: row.status }
    if (row.status === 'REVIEW') return { financialApproval: false, collectionId: row.id, collectionStatus: row.status }
    const { actor, invoice } = await collectionSourceActor(tx, row, notice)
    const review = async (reason: string) => {
      const claim = await tx.payBaleCollection.updateMany({ where: { id: row.id, status: row.status, principalPaymentId: null }, data: { status: 'REVIEW', activeInvoiceId: null, noticeId: notice.id, reviewReason: reason } })
      if (claim.count !== 1) throw new PayError('درخواست هم‌زمان تغییر کرد', 409)
      await auditSystemStrict({ actor: actor!, action: 'mobocom-pay.transfer.review', targetType: 'mobocom-pay', targetId: row.id, metadata: { reason, noticeId: notice.id } }, tx)
      return { financialApproval: false, collectionId: row.id, collectionStatus: 'REVIEW' }
    }
    if (invoice.status !== 'UNPAID') return review('INVOICE_ALREADY_SETTLED')
    // Text bank dates/account numbers never determine eligibility. Protocol/device receipt metadata does.
    if (!row.acceptedAt || notice.receivedAt < row.createdAt || notice.sourceSentAt < row.acceptedAt || notice.sourceSentAt < row.validFrom) return { financialApproval: false, collectionId: row.id, collectionStatus: row.status }
    if (row.status === 'EXPIRED' || (row.status !== 'UNDER_REVIEW' && notice.receivedAt > row.expiresAt)) return review('LATE_TRANSFER')
    return settleTransferCollection(tx, row, { method: 'AUTO', noticeId: notice.id, actor })
  })
}
