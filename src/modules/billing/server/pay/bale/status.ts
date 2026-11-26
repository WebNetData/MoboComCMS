import { BALE_BANK_USERNAME } from '@/modules/billing/domain/pay-bale'
import { baleSourceConfiguration } from '@/modules/billing/domain/pay-bale-sources'
import { payContext, payTransaction, type PayActor } from '../context'
import { baleSourceOwner } from './access'
import { latinDigits } from '@/shared/text/digits'
import { baleGatewayReady } from './collection-context'
import { balePanelUrl } from '@/modules/billing/domain/pay-bale-setup'

/** Admin-only safe status. Configuration readiness never claims live protocol/recovery. */
export function baleSourceStatus(actor: PayActor, pageInput: unknown = 1, collectionsPageInput: unknown = 1) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const configuration = baleSourceConfiguration(process.env), page = Math.max(1, Math.min(10000, Math.trunc(Number(pageInput)) || 1))
    const collectionsPage = Math.max(1, Math.min(10000, Math.trunc(Number(collectionsPageInput)) || 1))
    // The manager retains safe historical evidence even when a source is disabled/replaced.
    const total = await tx.payBaleNotice.count({ where: { sourceType: 'BALE' } })
    const rows = await tx.payBaleNotice.findMany({ where: { sourceType: 'BALE' }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25 })
    const apiEnabled = (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
    const sources = await Promise.all(configuration.sources.map(async binding => {
      const [bank, owner, latest] = await Promise.all([
        tx.bankAccount.findUnique({ where: { id: binding.bankAccountId }, select: { active: true, accountNumber: true, bankName: true, cardNumber: true, collectionUse: true } }),
        baleSourceOwner(binding, tx),
        tx.payBaleNotice.findFirst({ where: { sourceType: 'BALE', instanceId: binding.instanceId }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
      ])
      const receivingEnabled = Boolean(binding.enabled && bank?.active && /^\d{13}$/.test(latinDigits(bank.accountNumber).trim()) && apiEnabled && owner)
      return { id: binding.id, bankAccountId: binding.bankAccountId, bankName: bank?.bankName || '', cardLast4: bank?.cardNumber.slice(-4) || '',
        enabled: binding.enabled, verified: binding.verified, receivingEnabled, financialReady: receivingEnabled && binding.verified && bank?.collectionUse === 'MOBOCOM_PAY',
        webhookPath: '/api/payment/mobocom-pay/bale-events' + (binding.id === 'legacy' ? '' : '?source=' + encodeURIComponent(binding.id)), lastReceivedAt: latest?.receivedAt.toISOString() || null }
    }))
    const latest = await tx.payBaleNotice.findFirst({ where: { sourceType: 'BALE' }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], select: { receivedAt: true } })
    const [collectionReady, collections, reviewCount, collectionCount] = await Promise.all([
      baleGatewayReady(tx), tx.payBaleCollection.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (collectionsPage - 1) * 25, take: 25, include: { invoice: { select: { number: true } } } }),
      tx.payBaleCollection.count({ where: { status: 'REVIEW' } }),
      tx.payBaleCollection.count(),
    ])
    const gateways = await tx.gateway.findMany({ where: { active: true, provider: 'CARD_TRANSFER' }, select: { id: true }, take: 200 })
    const gatewayReadiness = await Promise.all(gateways.map(g => baleGatewayReady(tx, g.id)))
    const panelUrl = balePanelUrl(process.env.MOBOCOM_PAY_BALE_PANEL_URL)
    return { setup: { panelUrl, panelUrlInvalid: Boolean(process.env.MOBOCOM_PAY_BALE_PANEL_URL && !panelUrl) }, sources, configurationInvalid: configuration.invalid, bankUsername: BALE_BANK_USERNAME, configured: sources.length > 0, receivingEnabled: sources.some(s => s.receivingEnabled),
      collectionReady: collectionReady || gatewayReadiness.some(Boolean), reviewCount, collections: { total: collectionCount, page: collectionsPage, pages: Math.max(1, Math.ceil(collectionCount / 25)), items: collections.map(row => ({ id: row.id, invoiceNumber: row.invoice.number, status: row.status, principalRial: row.principalRial.toString(), adjustmentRial: row.adjustmentRial.toString(), collectedRial: row.collectedRial.toString(), reviewReason: row.reviewReason, createdAt: row.createdAt.toISOString() })) },
      mode: 'SERVER_ACCOUNT' as const, lastReceivedAt: latest?.receivedAt.toISOString() || null,
      events: { total, page, pages: Math.max(1, Math.ceil(total / 25)), items: rows.map(row => ({ id: row.id, status: row.status, code: row.code,
        kind: row.kind, direction: row.direction, amountRial: row.amountMinor?.toString() || null, referenceLast4: row.transferReference.slice(-4),
        occurredFrom: row.occurredFrom?.toISOString() || null, receivedAt: row.receivedAt.toISOString() })) } }
  })
}
