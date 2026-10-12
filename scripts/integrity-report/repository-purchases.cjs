const { parsePurchasePayment, classifyPurchaseRecovery } = require('../../src/modules/repository/domain/purchase-recovery.cjs')

/** Bounded continuation over all history; diagnosis never authorizes a mutation. */
async function repositoryPurchaseIssues(db, { limit = 5000, afterPaymentId = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000 || !Number.isInteger(afterPaymentId) || afterPaymentId < 0 || afterPaymentId > 2147483647) throw Error('invalid Repository diagnostic cursor/limit')
  const scanned = await db.walletTx.findMany({ where: { idempotencyKey: { startsWith: 'repo:buy:' }, id: { gt: afterPaymentId } }, orderBy: { id: 'asc' }, take: limit + 1, select: { id: true, userId: true, idempotencyKey: true, type: true, status: true, currency: true, amountMinor: true } })
  const payments = scanned.slice(0, limit), groups = { unfulfilled: [], ambiguous: [], invalid: [] }
  for (let offset = 0; offset < payments.length; offset += 250) {
    const batch = payments.slice(offset, offset + 250), parsed = batch.map(payment => [payment, parsePurchasePayment(payment)]), valid = parsed.filter(([, entry]) => entry)
    const [users, receipts, refunds] = await Promise.all([
      db.user.findMany({ where: { id: { in: valid.map(([, entry]) => entry.userId) } }, select: { id: true } }),
      db.repoLicense.findMany({ where: { OR: valid.map(([, entry]) => ({ userId: entry.userId, productId: entry.productId, note: `buy:${entry.requestId}` })) }, select: { id: true, userId: true, productId: true, note: true, source: true, currency: true, paidMinor: true } }),
      db.walletTx.findMany({ where: { idempotencyKey: { in: valid.map(([payment]) => `repo:refund:${payment.id}`) } }, select: { idempotencyKey: true, userId: true, status: true, type: true, currency: true, amountMinor: true } }),
    ])
    const userIds = new Set(users.map(row => row.id)), receiptGroups = new Map(), refundsByKey = new Map(refunds.map(row => [row.idempotencyKey, row]))
    for (const receipt of receipts) { const key = `${receipt.userId}:${receipt.productId}:${receipt.note}`; if (!receiptGroups.has(key)) receiptGroups.set(key, []); receiptGroups.get(key).push(receipt) }
    for (const [payment, entry] of parsed) {
      const matched = entry ? receiptGroups.get(`${entry.userId}:${entry.productId}:buy:${entry.requestId}`) || [] : []
      const state = classifyPurchaseRecovery(payment, Boolean(entry && userIds.has(entry.userId)), matched, refundsByKey.get(`repo:refund:${payment.id}`) || null)
      if (state === 'fulfilled' || state === 'refunded') continue
      const group = state === 'unfulfilled' ? 'unfulfilled' : state === 'invalid-payment' ? 'invalid' : 'ambiguous'
      groups[group].push({ paymentId: payment.id, userId: payment.userId, productId: entry?.productId || null, reason: state })
    }
  }
  return { groups, scanned: payments.length, capped: scanned.length > limit, afterPaymentId, nextAfterPaymentId: scanned.length > limit ? payments[payments.length - 1].id : null }
}

module.exports = { repositoryPurchaseIssues }
