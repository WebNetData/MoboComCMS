// @ts-check
// Pure canonical policy shared by the application and the existing Node integrity report.
/** @typedef {{userId:number|null,idempotencyKey:string|null,status:string,type:string,amountMinor:bigint,currency:string}} Payment */
/** @typedef {{source:string,currency:string,paidMinor:bigint}} Receipt */
/** @typedef {{status:string,type:string,userId:number|null,currency:string,amountMinor:bigint}} Refund */

/** @param {Payment} payment */
function parsePurchasePayment(payment) {
  const key = /^repo:buy:([1-9]\d*):([1-9]\d*):([A-Za-z0-9_-]{8,40})$/.exec(payment.idempotencyKey || '')
  const userId = key ? Number(key[1]) : 0, productId = key ? Number(key[2]) : 0
  if (!key || userId !== payment.userId || productId > 2147483647 || payment.status !== 'DONE' || payment.type !== 'PURCHASE' || payment.amountMinor >= 0n || !/^[A-Z0-9]{3,12}$/.test(payment.currency)) return null
  return { userId, productId, requestId: key[3] }
}

/** @param {Payment} payment @param {boolean} buyerExists @param {Receipt[]} receipts @param {Refund|null} refund */
function classifyPurchaseRecovery(payment, buyerExists, receipts, refund) {
  const parsed = parsePurchasePayment(payment)
  if (!parsed || !buyerExists) return 'invalid-payment'
  if (receipts.length > 1) return 'duplicate-receipts'
  const matchingReceipt = receipts.length === 1 && receipts[0].source === 'PURCHASE' && receipts[0].currency === payment.currency && receipts[0].paidMinor === -payment.amountMinor
  const matchingRefund = refund && refund.status === 'DONE' && refund.type === 'REFUND' && refund.userId === parsed.userId && refund.currency === payment.currency && refund.amountMinor === -payment.amountMinor
  if (refund && (receipts.length || !matchingRefund)) return 'refund-conflict'
  if (refund) return 'refunded'
  if (receipts.length && !matchingReceipt) return 'receipt-mismatch'
  return receipts.length ? 'fulfilled' : 'unfulfilled'
}

module.exports = { parsePurchasePayment, classifyPurchaseRecovery }
