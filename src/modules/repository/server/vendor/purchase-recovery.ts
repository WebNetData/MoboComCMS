import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { RepoError } from '@/modules/repository/domain/repository'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { minorToDecimal } from '@/shared/money'
import { sha256 } from '../crypto'
import { assertVendorLicenseAuthority, commitVendorLicense, type VendorLicenseContext } from './license-command'
import { issueLicense } from './issue-license'

/** A preview is evidence for a later explicit command, never authorization or an automatic repair. */
export async function previewPurchaseRecovery(paymentId: number, context: VendorLicenseContext) {
  return db.$transaction(async tx => {
    await assertVendorLicenseAuthority(context, tx)
    const finance = await requirePerm(context.req, 'finance.manage', tx)
    if (!finance || finance.id !== context.actor.id) throw new RepoError('forbidden', 403)
    return readPurchaseRecovery(paymentId, tx)
  }, { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 15000 })
}

/** The same snapshot reader will be used by the guarded execution transaction. No writes or secrets. */
async function readPurchaseRecovery(paymentId: number, tx: Prisma.TransactionClient) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || paymentId > 2147483647) throw new RepoError('شناسهٔ پرداخت معتبر نیست', 400)
  const payment = await tx.walletTx.findUnique({ where: { id: paymentId } })
  if (!payment) throw new RepoError('پرداخت پیدا نشد', 404)
  const key = /^repo:buy:([1-9]\d*):([1-9]\d*):([A-Za-z0-9_-]{8,40})$/.exec(payment.idempotencyKey || '')
  const userId = key ? Number(key[1]) : 0, productId = key ? Number(key[2]) : 0
  const valid = Boolean(key && userId === payment.userId && productId <= 2147483647 && payment.status === 'DONE' && payment.type === 'PURCHASE' && payment.amountMinor < 0n && /^[A-Z0-9]{3,12}$/.test(payment.currency))
  const buyer = valid ? await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }) : null
  const product = valid ? await tx.repoProduct.findUnique({ where: { id: productId }, select: { id: true, name: true, currency: true, active: true, siteLimit: true, supportDays: true } }) : null
  const receipts = valid ? await tx.repoLicense.findMany({ where: { userId, productId, note: `buy:${key![3]}` }, orderBy: { id: 'asc' }, select: { id: true, source: true, status: true, currency: true, paidMinor: true, updatesUntil: true } }) : []
  const refund = valid ? await tx.walletTx.findUnique({ where: { idempotencyKey: `repo:refund:${payment.id}` } }) : null
  const matchingReceipt = receipts.length === 1 && receipts[0].source === 'PURCHASE' && receipts[0].currency === payment.currency && receipts[0].paidMinor === -payment.amountMinor
  const matchingRefund = refund && refund.status === 'DONE' && refund.type === 'REFUND' && refund.userId === userId && refund.currency === payment.currency && refund.amountMinor === -payment.amountMinor
  const state = !valid || !buyer ? 'invalid-payment' : receipts.length > 1 ? 'duplicate-receipts' : refund && (receipts.length || !matchingRefund) ? 'refund-conflict' : refund ? 'refunded' : receipts.length && !matchingReceipt ? 'receipt-mismatch' : receipts.length ? 'fulfilled' : 'unfulfilled'
  const termsValid = product && product.active && product.currency === payment.currency && Number.isInteger(product.siteLimit) && product.siteLimit >= 0 && product.siteLimit <= 1000 && Number.isInteger(product.supportDays) && product.supportDays >= 0 && product.supportDays <= 3650
  const summary = {
    payment: { id: payment.id, userId: payment.userId, productId: valid ? productId : null, requestId: valid ? key![3] : null, amountMinor: payment.amountMinor.toString(), currency: payment.currency, paidAt: payment.createdAt.toISOString(), status: payment.status, type: payment.type },
    buyer, product, state,
    receipts: receipts.map(row => ({ ...row, paidMinor: row.paidMinor.toString(), updatesUntil: row.updatesUntil?.toISOString() || null })),
    refund: refund ? { id: refund.id, status: refund.status, type: refund.type, userId: refund.userId, currency: refund.currency, amountMinor: refund.amountMinor.toString() } : null,
    canRestore: state === 'unfulfilled' && Boolean(termsValid), canRefund: state === 'unfulfilled',
  }
  return { ...summary, evidence: sha256(JSON.stringify(summary)) }
}

/** Explicit data-only recovery: never rewrite the debit, reactivate a receipt or infer historical terms. */
export async function recoverPurchase(paymentId: number, input: { mode: unknown; evidence: unknown; acknowledgeCurrentTerms?: unknown }, context: VendorLicenseContext) {
  return commitVendorLicense(context, async tx => {
    const finance = await requirePerm(context.req, 'finance.manage', tx)
    if (!finance || finance.id !== context.actor.id) throw new RepoError('forbidden', 403)
    if (input.mode !== 'restore' && input.mode !== 'refund') throw new RepoError('نوع بازیابی معتبر نیست', 400)
    const preview = await readPurchaseRecovery(paymentId, tx)
    // Replaying an already completed matching decision must not create another entitlement or credit.
    if (input.mode === 'restore' && preview.state === 'fulfilled') return { mode: 'restore', licenseId: preview.receipts[0].id, repeated: true }
    if (input.mode === 'refund' && preview.state === 'refunded') return { mode: 'refund', walletTxId: preview.refund!.id, repeated: true }
    if (preview.state !== 'unfulfilled' || typeof input.evidence !== 'string' || input.evidence !== preview.evidence) throw new RepoError('وضعیت پرداخت تغییر کرده یا نیاز به بررسی دستی دارد؛ دوباره بررسی کنید', 409)
    if (input.mode === 'restore') {
      if (!preview.canRestore || input.acknowledgeCurrentTerms !== true) throw new RepoError('شرایط فعلی محصول باید بررسی و تأیید شود', 409)
      const { license } = await issueLicense({ productId: preview.product!.id, userId: preview.buyer!.id, email: preview.buyer!.email, source: 'PURCHASE', paidMinor: -BigInt(preview.payment.amountMinor), note: `buy:${preview.payment.requestId}`, paidAt: new Date(preview.payment.paidAt) }, tx)
      await tx.repoProduct.update({ where: { id: preview.product!.id }, data: { sold: { increment: 1 } } })
      return { mode: 'restore', licenseId: license.id, repeated: false }
    }
    const credited = await moveWallet({ userId: preview.buyer!.id, amount: minorToDecimal(-BigInt(preview.payment.amountMinor), preview.payment.currency), currency: preview.payment.currency, type: 'REFUND', description: `بازپرداخت خرید ناقص مخزن (${paymentId})`, idempotencyKey: `repo:refund:${paymentId}` }, tx)
    if (!credited.ok || !credited.txId) throw new RepoError('بازپرداخت انجام نشد', 409)
    return { mode: 'refund', walletTxId: credited.txId, repeated: false }
  }, result => ({ action: 'recover', targetId: paymentId, metadata: { mode: result.mode, repeated: result.repeated, ...('licenseId' in result ? { licenseId: result.licenseId } : { walletTxId: result.walletTxId }) } }))
}
