import { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { baleBinding } from '@/modules/billing/domain/pay-bale'
import { isModuleEnabled } from '@/extensions/server/modules'
import { auditSystemStrict } from '@/platform/audit/server'
import { payTransaction } from '../context'
import { paySettings } from '../settings'
import { sourceOwner } from './access'
import { settleTransferCollection } from './collection-settle'

/** Only immutable, authenticated source facts and the globally reserved amount select a quote. */
export async function matchBaleNotice(id: string) {
  return payTransaction(async tx => {
    const notice = await tx.payBaleNotice.findUniqueOrThrow({ where: { id } })
    if (notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT' || !notice.amountMinor) return { financialApproval: false }
    const row = await tx.payBaleCollection.findUnique({ where: { collectedRial: notice.amountMinor } })
    if (!row || row.bankAccountId !== notice.bankAccountId) return { financialApproval: false }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${row.invoiceId} FOR UPDATE`)
    if (row.status === 'PAID') return { financialApproval: true, alreadyPaid: true, collectionId: row.id, collectionStatus: row.status }
    if (row.status === 'REVIEW') return { financialApproval: false, collectionId: row.id, collectionStatus: row.status }
    if (!(await isModuleEnabled('mobocom-pay', tx)) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true' || !(await paySettings.read(tx)).bale.enabled) throw new PayError('تأیید خودکار متوقف است', 503)
    const bindings = JSON.parse(row.sourceBindings) as { bale: { instanceId: string; accountId: string; peerId: string } | null; sms: { id: string; version: number }[] }
    let actor: { id: number; email: string } | null = null
    if (notice.sourceType === 'SMS' && notice.smsSourceId && JSON.parse(row.sourceTypes).includes('SMS')) {
      const source = await tx.paySmsSource.findUnique({ where: { id: notice.smsSourceId } })
      if (source?.active && source.verified && source.bankAccountId === row.bankAccountId && bindings.sms.some(s => s.id === source.id && s.version === source.version)) {
        // instance is a hash of source ID/version; intake owns construction and immutable storage.
        const { createHash } = await import('node:crypto')
        if (notice.instanceId === createHash('sha256').update(`${source.id}:${source.version}`).digest('hex')) actor = await sourceOwner(source.ownerUserId, tx)
      }
    } else if (notice.sourceType === 'BALE' && JSON.parse(row.sourceTypes).includes('BALE')) {
      const binding = baleBinding(process.env), frozen = bindings.bale
      if (binding && frozen && process.env.MOBOCOM_PAY_BALE_VERIFIED === 'true' && binding.bankAccountId === row.bankAccountId &&
        binding.instanceId === frozen.instanceId && binding.accountId === frozen.accountId && binding.bankPeerId === frozen.peerId &&
        notice.instanceId === frozen.instanceId && notice.sourceAccountId === frozen.accountId && notice.bankPeerId === frozen.peerId) actor = await sourceOwner(binding.ownerUserId, tx)
    }
    if (!actor) throw new PayError('منبع تأیید خودکار این درخواست معتبر نیست', 503)
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId }, include: { gateway: true, payCollection: { include: { merchant: true, terminal: true } } } })
    const bank = await tx.bankAccount.findUnique({ where: { id: row.bankAccountId } })
    if (!invoice.gateway?.active || !bank?.active || bank.collectionUse !== 'MOBOCOM_PAY' || (invoice.payCollection && (!invoice.payCollection.merchant.baleAllowed || !invoice.payCollection.terminal.baleEnabled || invoice.payCollection.merchant.status !== 'ACTIVE' || !invoice.payCollection.terminal.active))) throw new PayError('دریافت این روش متوقف است', 503)
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
