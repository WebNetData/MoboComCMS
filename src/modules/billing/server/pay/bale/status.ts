import { BALE_BANK_USERNAME, baleBinding } from '@/modules/billing/domain/pay-bale'
import { payContext, payTransaction, type PayActor } from '../context'
import { baleSourceOwner } from './access'
import { latinDigits } from '@/shared/text/digits'

/** Admin-only safe status. Configuration never claims live protocol or collection readiness. */
export function baleSourceStatus(actor: PayActor, pageInput: unknown = 1) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const binding = baleBinding(process.env), page = Math.max(1, Math.min(10000, Math.trunc(Number(pageInput)) || 1))
    // The manager retains safe historical evidence even when a source is disabled/replaced.
    const total = await tx.payBaleNotice.count()
    const rows = await tx.payBaleNotice.findMany({ orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25 })
    const bank = binding ? await tx.bankAccount.findUnique({ where: { id: binding.bankAccountId }, select: { active: true, accountNumber: true } }) : null
    const owner = binding ? await baleSourceOwner(binding, tx) : null
    const apiEnabled = (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
    const latest = await tx.payBaleNotice.findFirst({ orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], select: { receivedAt: true } })
    return { bankUsername: BALE_BANK_USERNAME, configured: Boolean(binding), receivingEnabled: Boolean(binding && bank?.active && /^\d{13}$/.test(latinDigits(bank.accountNumber).trim()) && apiEnabled && owner),
      collectionReady: false as const, mode: 'SERVER_ACCOUNT' as const, lastReceivedAt: latest?.receivedAt.toISOString() || null,
      events: { total, page, pages: Math.max(1, Math.ceil(total / 25)), items: rows.map(row => ({ id: row.id, status: row.status, code: row.code,
        kind: row.kind, direction: row.direction, amountRial: row.amountMinor?.toString() || null, referenceLast4: row.transferReference.slice(-4),
        occurredFrom: row.occurredFrom?.toISOString() || null, receivedAt: row.receivedAt.toISOString() })) } }
  })
}
