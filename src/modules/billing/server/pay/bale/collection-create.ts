import { createHash, randomBytes, randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { invoiceDueMinor } from '@/modules/billing/server/billing'
import { PayError } from '@/modules/billing/domain/pay'
import { invoicePrincipalRial } from '@/modules/billing/domain/pay-bale-collection'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { auditSystemStrict } from '@/platform/audit/server'
import { payTransaction } from '../context'
import { baleCollectionContext } from './collection-context'

export async function createBaleCollectionInTransaction(tx: Prisma.TransactionClient, invoiceNumber: string, gatewayId: number, renewal = false) {
  const context = await baleCollectionContext(tx, gatewayId), { bank, binding, owner, policy } = context
  const invoice = await tx.invoice.findUnique({ where: { number: invoiceNumber }, include: { payCollection: { include: { merchant: true, terminal: true } } } })
  if (!invoice || invoice.gatewayId !== gatewayId || invoice.saleSource === 'COUNTER') throw new PayError('فاکتور این درگاه معتبر نیست', 409)
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${invoice.id} FOR UPDATE`)
  const now = new Date()
  if (invoice.status !== 'UNPAID' || (invoice.expiresAt && invoice.expiresAt <= now)) throw new PayError('فاکتور دیگر قابل پرداخت نیست', 409)
  const gateway = await tx.gateway.findFirst({ where: { id: gatewayId, active: true, provider: { in: ['MOBOCOM_PAY','CARD_TRANSFER'] } } })
  if (!gateway) throw new PayError('درگاه موبوکام غیرفعال است', 409)
  if (gateway.feeBps !== 0 || gateway.feePercent !== 0) throw new PayError('کارمزد این روش از تنظیمات تطبیق بانکی تعیین می‌شود؛ ردیف درگاه را با کارمزد درصدی صفر ذخیره کنید', 409)
  if (invoice.userId !== null) {
    const user = await tx.user.findUnique({ where: { id: invoice.userId }, select: { status: true } })
    if (user?.status !== 'ACTIVE' || await globalAuthenticationDenied(invoice.userId, now, tx)) throw new PayError('حساب پرداخت‌کننده در دسترس نیست', 403)
  }
  const pay = invoice.payCollection
  if (pay?.creditCurrency === 'USDT' && (!pay.purchaseAcceptedAt || pay.purchaseAcceptedHash !== pay.purchaseTermsHash)) throw new PayError('شرایط خرید تتر تأیید نشده است', 409)
  if (invoice.kind === 'PAY_COLLECTION' && (!pay || pay.status !== 'PENDING' || ((!renewal || pay.creditCurrency === 'USDT') && pay.expiresAt <= now) || pay.walletTxId !== null || !pay.payerVerifiedAt ||
    !['MOBOCOM_PAY','CARD_TRANSFER'].includes(pay.gatewayAttemptProvider) || pay.gatewayAttemptRef !== `db:${gateway.id}` || !context.settings.incomingEnabled ||
    pay.merchant.status !== 'ACTIVE' || !pay.merchant.baleAllowed || !pay.terminal.baleEnabled || !pay.terminal.active)) throw new PayError('پرداخت پذیرنده برای این روش مجاز نیست', 409)
  if (await tx.paymentReceipt.count({ where: { invoiceId: invoice.id, status: 'PENDING' } })) throw new PayError('رسید در انتظار بررسی است؛ درخواست تازه صادر نمی‌شود', 409)
  const previous = await tx.payBaleCollection.findUnique({ where: { activeInvoiceId: invoice.id } })
  if (previous && (previous.status === 'UNDER_REVIEW' || previous.expiresAt > now)) {
    if (previous.gatewayId !== gateway.id) throw new PayError('اتصال درخواست قبلی تغییر کرده؛ ابتدا آن را بررسی کنید', 409)
    return previous
  }
  if (previous) {
    const changed = await tx.payBaleCollection.updateMany({ where: { id: previous.id, status: 'PENDING', activeInvoiceId: invoice.id }, data: { status: 'EXPIRED', activeInvoiceId: null, reviewReason: 'EXPIRED' } })
    if (changed.count !== 1) throw new PayError('درخواست پرداخت هم‌زمان تغییر کرده است', 409)
  }
  const dueMinor = invoiceDueMinor(invoice), principalRial = invoicePrincipalRial(dueMinor, invoice.currency)
  if (principalRial < gateway.minAmountMinor) throw new PayError('مبلغ کمتر از حداقل درگاه است', 422)
  const min = BigInt(policy.minAdjustmentRial), max = BigInt(policy.maxAdjustmentRial)
  // The principal stays exact; the separately disclosed addition aligns the BANK total to whole Toman.
  const first = ((principalRial + min + 9n) / 10n) * 10n, last = ((principalRial + max) / 10n) * 10n
  const slots = Number((last - first) / 10n + 1n)
  if (slots < 1) throw new PayError('بازهٔ تمایز برای این مبلغ ظرفیت ندارد', 409, 'BALE_POOL_EXHAUSTED')
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(1885432166, 0)`)
  const occupied = new Set((await tx.payBaleCollection.findMany({ where: { collectedRial: { gte: first, lte: last } }, select: { collectedRial: true } })).map(row => row.collectedRial.toString()))
  const offset = randomInt(slots)
  let collectedRial: bigint | null = null
  for (let step = 0; step < slots; step++) { const candidate = first + BigInt((offset + step) % slots) * 10n; if (!occupied.has(candidate.toString())) { collectedRial = candidate; break } }
  if (collectedRial === null) throw new PayError('ظرفیت مبالغ متمایز این حساب پر شده است؛ روش دیگری انتخاب کنید یا با پشتیبانی تماس بگیرید', 409, 'BALE_POOL_EXHAUSTED')
  const limit = Math.min(now.getTime() + policy.minutes * 60000, invoice.expiresAt?.getTime() || Infinity, pay?.creditCurrency === 'USDT' ? pay.expiresAt.getTime() : Infinity)
  const validFrom = now, expiresAt = new Date(limit)
  if (expiresAt.getTime() - validFrom.getTime() < 1000) throw new PayError('مهلت فاکتور برای درخواست تازه کافی نیست', 409)
  const row = await tx.payBaleCollection.create({ data: {
    id: randomBytes(24).toString('base64url'), invoiceId: invoice.id, activeInvoiceId: invoice.id, gatewayId, bankAccountId: bank.id, ownerUserId: owner.id,
    sourceTypes: JSON.stringify(context.sourceTypes), sourceInstanceId: binding?.instanceId || '', sourceAccountId: binding?.accountId || '', bankPeerId: binding?.bankPeerId || '',
    sourceBindings: JSON.stringify({ bale: binding ? { instanceId: binding.instanceId, accountId: binding.accountId, peerId: binding.bankPeerId } : null, sms: context.sms.map(source => ({ id: source.id, version: source.version })) }),
    currency: invoice.currency, dueMinor, principalRial, adjustmentRial: collectedRial - principalRial, collectedRial,
    policyRevision: createHash('sha256').update(JSON.stringify(policy)).digest('hex'), validFrom, expiresAt, createdAt: now,
  } })
  // Explicit renewal advances the canonical pointer; the first initiation is saved by its existing caller.
  if (invoice.providerTxnId) {
    const saved = await tx.invoice.updateMany({ where: { id: invoice.id, status: 'UNPAID', gatewayId, providerTxnId: invoice.providerTxnId, paymentUrl: invoice.paymentUrl }, data: { providerTxnId: row.id, paymentUrl: baleCollectionUrl(row.id) } })
    if (saved.count !== 1) throw new PayError('نشانی پرداخت هم‌زمان تغییر کرده است', 409)
  }
  await auditSystemStrict({ actor: owner, action: 'mobocom-pay.bale.quote', targetType: 'mobocom-pay', targetId: row.id, metadata: { invoiceId: invoice.id, principalRial, adjustmentRial: row.adjustmentRial, collectedRial } }, tx)
  return row
}

/** Gateway-owned internal admission; the caller has already created/authorized the canonical invoice. */
export async function prepareBaleGateway(gatewayId: number, invoiceNumber: string) {
  baleCollectionUrl('validation')
  const row = await payTransaction(tx => createBaleCollectionInTransaction(tx, invoiceNumber, gatewayId))
  return { ok: true as const, txnId: row.id, paymentUrl: baleCollectionUrl(row.id), expiresAt: row.expiresAt.toISOString() }
}
function baleCollectionUrl(id: string) {
  const site = new URL(process.env.NEXTAUTH_URL || '')
  if (site.username || site.password || site.protocol !== 'https:') throw new PayError('نشانی امن سایت تنظیم نشده است', 503)
  return `${site.origin}/pay/bank/${id}`
}
