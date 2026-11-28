import { PayError } from '@/modules/billing/domain/pay'
import { parsePayStatement, type StatementPreview } from '@/modules/billing/domain/pay-statement'
import { payContext, payTransaction, type PayActor } from './context'

export function statementAccounts(actor: PayActor) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const banks = await tx.bankAccount.findMany({
      where: { receipts: { some: { invoice: { kind: 'PAY_COLLECTION' } } } },
      orderBy: [{ bankName: 'asc' }, { id: 'asc' }],
      select: { id: true, bankName: true, holderName: true, cardNumber: true, sheba: true },
    })
    return banks.map(bank => ({ id: bank.id, label: [bank.bankName, bank.holderName, (bank.cardNumber || bank.sheba).slice(-4)].filter(Boolean).join(' · ') }))
  })
}

/** Comparison only. The file never becomes a bank event or a settlement authority. */
export function previewPayStatement(actor: PayActor, input: Record<string, unknown>): Promise<StatementPreview> {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    if (!Number.isSafeInteger(input.bankAccountId) || Number(input.bankAccountId) < 1 || Number(input.bankAccountId) > 2147483647 ||
      Object.keys(input).some(key => key !== 'bankAccountId' && key !== 'csv')) throw new PayError('حساب مقصد معتبر نیست', 422)
    const bankAccountId = Number(input.bankAccountId)
    if (!await tx.bankAccount.count({ where: { id: bankAccountId } })) throw new PayError('حساب مقصد پیدا نشد', 404)
    const { entries, duplicates } = parsePayStatement(input.csv)
    const amounts = [...new Set(entries.map(entry => entry.amountRial))].map(BigInt)
    const references = { in: entries.map(entry => entry.reference), mode: 'insensitive' as const }
    const earliest = new Date(Math.min(...entries.map(entry => Date.parse(entry.at))))
    const [rows, receipts, bankEvents, notices] = await Promise.all([
      tx.paymentReceipt.findMany({
        where: { bankAccountId, status: 'PENDING', userId: null, currency: 'IRR', createdAt: { gte: earliest },
          OR: [{ autoCollection: null, amountMinor: { in: amounts } }, { autoCollection: { receiptAmountRial: { in: amounts } } }],
          invoice: { kind: 'PAY_COLLECTION', status: 'UNPAID', payCollection: { status: 'PENDING' } } },
        take: 10001,
        select: { id: true, amountMinor: true, trackingCode: true, createdAt: true,
          autoCollection: { select: { status: true, receiptAmountRial: true, acceptedAt: true, expiresAt: true } },
          invoice: { select: { payCollection: { select: { payerVerifiedAt: true, expiresAt: true } } } } },
      }),
      tx.paymentReceipt.findMany({
        where: { bankAccountId, userId: null, trackingCode: references,
          OR: [{ status: 'APPROVED' }, { invoice: { status: 'PAID' } }] },
        select: { trackingCode: true },
      }),
      tx.payBankEvent.findMany({
        where: { bankAccountId, status: 'MATCHED', transferReference: references }, select: { transferReference: true },
      }),
      tx.payBaleNotice.findMany({
        where: { bankAccountId, transferReference: references, collectionMatch: { status: 'PAID' } }, select: { transferReference: true },
      }),
    ])
    if (rows.length > 10000) throw new PayError('بازهٔ زمانی فایل را کوچک‌تر کنید و دوباره تلاش کنید', 422)
    const used = new Set([...receipts.map(receipt => receipt.trackingCode), ...[...bankEvents, ...notices].map(event => event.transferReference)].map(ref => ref.toUpperCase()))
    const byAmount = new Map<string, typeof rows>()
    for (const row of rows) {
      const quote = row.autoCollection
      if (quote && (quote.status !== 'UNDER_REVIEW' || quote.receiptAmountRial === null)) continue
      const amount = (quote?.receiptAmountRial ?? row.amountMinor).toString()
      const current = byAmount.get(amount)
      if (current) current.push(row)
      else byAmount.set(amount, [row])
    }
    const matches = new Map<number, StatementPreview['suggestions']>()
    const contested = new Set<number>()
    let ambiguous = 0, unmatched = 0, alreadyUsed = 0
    for (const entry of entries) {
      if (used.has(entry.reference)) { alreadyUsed++; continue }
      const at = Date.parse(entry.at)
      const possible = (byAmount.get(entry.amountRial) ?? []).filter(row => {
        const payment = row.invoice.payCollection
        const quote = row.autoCollection
        const start = quote?.acceptedAt ?? payment?.payerVerifiedAt
        const end = quote?.expiresAt ?? payment?.expiresAt
        return (!row.trackingCode || row.trackingCode.toUpperCase() === entry.reference) &&
          start && end && at >= start.getTime() && at <= end.getTime() && at <= row.createdAt.getTime()
      })
      if (possible.length === 0) { unmatched++; continue }
      if (possible.length > 1) {
        for (const row of possible) contested.add(row.id)
        ambiguous++
        continue
      }
      const receiptId = possible[0].id
      const previous = matches.get(receiptId)
      const proposal = { receiptId, entry }
      if (previous) previous.push(proposal)
      else matches.set(receiptId, [proposal])
    }
    const suggestions = []
    for (const [receiptId, candidates] of matches) {
      if (candidates.length === 1 && !contested.has(receiptId)) suggestions.push(candidates[0])
      else ambiguous += candidates.length
    }
    return { entries: entries.length, duplicates, suggestions, ambiguous, unmatched, alreadyUsed }
  })
}
