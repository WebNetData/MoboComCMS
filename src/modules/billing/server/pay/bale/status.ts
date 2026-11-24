import { BALE_BANK_USERNAME, baleBinding } from '@/modules/billing/domain/pay-bale'
import { payContext, payTransaction, type PayActor } from '../context'
import { baleSourceOwner } from './access'
import { latinDigits } from '@/shared/text/digits'
import { baleGatewayReady } from './collection-context'

/** Admin-only safe status. Configuration readiness never claims live protocol/recovery. */
export function baleSourceStatus(actor: PayActor, pageInput: unknown = 1, collectionsPageInput: unknown = 1) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const binding = baleBinding(process.env), page = Math.max(1, Math.min(10000, Math.trunc(Number(pageInput)) || 1))
    const collectionsPage = Math.max(1, Math.min(10000, Math.trunc(Number(collectionsPageInput)) || 1))
    // The manager retains safe historical evidence even when a source is disabled/replaced.
    const total = await tx.payBaleNotice.count()
    const rows = await tx.payBaleNotice.findMany({ orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25 })
    const bank = binding ? await tx.bankAccount.findUnique({ where: { id: binding.bankAccountId }, select: { active: true, accountNumber: true } }) : null
    const owner = binding ? await baleSourceOwner(binding, tx) : null
    const apiEnabled = (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
    const latest = await tx.payBaleNotice.findFirst({ orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], select: { receivedAt: true } })
    const [collectionReady, collections, reviewCount, collectionCount] = await Promise.all([
      baleGatewayReady(tx), tx.payBaleCollection.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (collectionsPage - 1) * 25, take: 25, include: { invoice: { select: { number: true } } } }),
      tx.payBaleCollection.count({ where: { status: 'REVIEW' } }),
      tx.payBaleCollection.count(),
    ])
    return { bankUsername: BALE_BANK_USERNAME, configured: Boolean(binding), receivingEnabled: Boolean(binding && bank?.active && /^\d{13}$/.test(latinDigits(bank.accountNumber).trim()) && apiEnabled && owner),
      collectionReady, reviewCount, collections: { total: collectionCount, page: collectionsPage, pages: Math.max(1, Math.ceil(collectionCount / 25)), items: collections.map(row => ({ id: row.id, invoiceNumber: row.invoice.number, status: row.status, principalRial: row.principalRial.toString(), adjustmentRial: row.adjustmentRial.toString(), collectedRial: row.collectedRial.toString(), reviewReason: row.reviewReason, createdAt: row.createdAt.toISOString() })) },
      mode: 'SERVER_ACCOUNT' as const, lastReceivedAt: latest?.receivedAt.toISOString() || null,
      events: { total, page, pages: Math.max(1, Math.ceil(total / 25)), items: rows.map(row => ({ id: row.id, status: row.status, code: row.code,
        kind: row.kind, direction: row.direction, amountRial: row.amountMinor?.toString() || null, referenceLast4: row.transferReference.slice(-4),
        occurredFrom: row.occurredFrom?.toISOString() || null, receivedAt: row.receivedAt.toISOString() })) } }
  })
}
