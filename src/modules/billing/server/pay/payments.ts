import { acquisitionSnapshot } from './assets'
import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { idempotencyKey, paymentAmounts, reference, text, rial, merchantFeeTerms } from '@/modules/billing/domain/pay-policy'
import { assertPayTerminal, merchantFor, payAudit, payContext, payTransaction, type PayActor } from './context'
import { isModuleEnabled } from '@/extensions/server/modules'
import { reconcileReference } from './reconcile'
import { listCheckoutGateways } from '@/modules/billing/server/gateways'
import { validRoutingRef } from '@/modules/billing/domain/pay-routing'
import { payCollectionBank } from './bank-destination'
import { eligiblePayGateways, payGatewayOptions } from './gateway-options'

export const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function createPayPayment(actor: PayActor, input: Record<string, unknown>, key: string, transaction?: Prisma.TransactionClient) {
  const terminalId = text(input.terminalId, 60),
    externalId = text(input.externalId, 100),
    rawIdem = idempotencyKey(key)
  assertPayTerminal(actor, terminalId)
  const idem = actor.terminalKey ? fingerprint(['pay-terminal', terminalId, rawIdem]) : rawIdem
  const requestedGatewayRef = input.gatewayRef === undefined ? '' : input.gatewayRef
  if (input.gatewayRef !== undefined && !validRoutingRef(input.gatewayRef)) throw new PayError('شناسهٔ درگاه معتبر نیست', 422, 'PAY_GATEWAY_REF_INVALID')
  const gatewayRef = String(requestedGatewayRef)
  const work = async (tx: Prisma.TransactionClient) => {
    const merchant = await merchantFor(actor, tx, true),
      { settings } = await payContext(actor, tx)
    const amount = rial(input.amountRial)
    const hash = fingerprint({ terminalId, externalId, amount: amount.toString(), ...(gatewayRef ? { gatewayRef } : {}) })
    const previous = await tx.payPayment.findUnique({
      where: { merchantId_idempotencyKey: { merchantId: merchant.id, idempotencyKey: idem } },
    })
    if (previous) {
      if (previous.fingerprint !== hash)
        throw new PayError('کلید تکرار با درخواست دیگری استفاده شده است', 409, 'IDEMPOTENCY_CONFLICT')
      return previous
    }
    const amounts = paymentAmounts(input.amountRial, settings, merchantFeeTerms(settings, merchant))
    if (!settings.incomingEnabled)
      throw new PayError('دریافت وجه هنوز آماده نیست', 503, 'PAY_NOT_READY')
    const terminal = await tx.payTerminal.findFirst({
      where: { id: terminalId, merchantId: merchant.id, active: true },
    })
    if (!terminal) throw new PayError('پایانهٔ فعال پیدا نشد', 404)
    if (await tx.payPayment.count({ where: { terminalId, externalId } }))
      throw new PayError('شناسهٔ سفارش قبلاً استفاده شده است', 409)
    const bank = await payCollectionBank(tx, settings.bankAccountIds)
    const catalog = await listCheckoutGateways('IRR', tx, undefined, 'pay', terminal.bankAccountId)
    const methods = eligiblePayGateways(catalog, { merchant, terminal }, {
      totalMinor: amounts.totalMinor, creditCurrency: merchant.creditCurrency, requestedGatewayRef: gatewayRef, hasBankAccount: Boolean(bank),
    })
    if (!methods.length) throw gatewayRef
      ? new PayError('این درگاه برای این پایانه و مبلغ مجاز یا آماده نیست', 422, 'PAY_GATEWAY_NOT_AVAILABLE')
      : new PayError('هیچ روش پرداخت مجازی برای این پایانه و مبلغ آماده نیست', 503, 'PAY_NOT_READY')
    const cardTransfer = methods.some(method => method.provider === 'CARD_TRANSFER' && method.manual)
    const assignedBankAccountId = !gatewayRef || methods.some(method => method.automatic) ? terminal.bankAccountId : null
    const bankAccountId = cardTransfer ? bank?.id ?? null : null
    const lockedBankIds = [...new Set([assignedBankAccountId, bankAccountId].filter(id => id !== null))]
    if (lockedBankIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "BankAccount" WHERE id IN (${Prisma.join(lockedBankIds)}) ORDER BY id FOR SHARE`)
    const now = new Date(), id = randomBytes(24).toString('base64url'), expiresAt = new Date(now.getTime() + settings.paymentMinutes * 60000)
    const credit = await acquisitionSnapshot(tx, { id, merchantId: merchant.id, name: merchant.name, currency: merchant.creditCurrency, netMinor: amounts.netMinor, totalMinor: amounts.totalMinor, expiresAt, maxAgeMinutes: settings.usdtRateMaxAgeMinutes })
    const row = await tx.payPayment.create({
      data: {
        id,
        ...credit,
        merchantId: merchant.id,
        terminalId,
        bankAccountId,
        assignedBankAccountId,
        requestedGatewayRef: gatewayRef,
        externalId,
        idempotencyKey: idem,
        fingerprint: hash,
        ...amounts,
        createdAt: now,
        expiresAt,
      },
    })
    await payAudit(tx, actor, 'payment.create', row.id, { terminalId, amountRial: row.amountMinor, ...(gatewayRef ? { gatewayRef } : {}) })
    return row
  }
  return transaction ? work(transaction) : payTransaction(work)
}
export async function publicPayment(tx: Prisma.TransactionClient, id: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) throw new PayError('پرداخت پیدا نشد', 404)
  const row = await tx.payPayment.findUnique({
    where: { id },
    include: { merchant: true, terminal: true, bankAccount: true, invoice: { include: { gateway: true } } },
  })
  if (!row) throw new PayError('پرداخت پیدا نشد', 404)
  return row
}
/** A customer-supplied reference is a matching hint, never a payment confirmation. */
export async function reportPayReference(id: string, value: unknown) {
  const transferReference = reference(value)
  return payTransaction(async (tx) => {
    if (!(await isModuleEnabled('mobocom-pay', tx))) throw new PayError('درگاه غیرفعال است', 404)
    const row = await publicPayment(tx, id)
    if (row.status !== 'PENDING' || row.expiresAt <= new Date())
      throw new PayError('مهلت یا وضعیت این پرداخت تغییر کرده است', 409)
    if (row.merchant.status !== 'ACTIVE' || !row.terminal.active)
      throw new PayError('دریافت پایانه متوقف شده است', 409)
    if (!row.invoiceId && (row.requestedGatewayRef || row.terminal.gatewayPolicy || row.merchant.gatewayPolicy) &&
      !(await payGatewayOptions(row, tx)).some(method => method.provider === 'CARD_TRANSFER' && method.manual))
      throw new PayError('انتقال بانکی برای این پرداخت مجاز نیست', 409, 'PAY_GATEWAY_NOT_AVAILABLE')
    if (row.transferReference && row.transferReference !== transferReference)
      throw new PayError('شمارهٔ پیگیری قبلاً ثبت شده؛ برای اصلاح با پشتیبانی تماس بگیرید', 409)
    // Duplicate hints create ambiguity and cannot steal a previously matched event.
    const changed = await tx.payPayment.updateMany({
      where: { id, status: 'PENDING', transferReference: row.transferReference },
      data: { transferReference },
    })
    if (changed.count !== 1) throw new PayError('پرداخت هم‌زمان تغییر کرده است', 409)
    if (!row.payerVerifiedAt) throw new PayError('ابتدا شمارهٔ موبایل را تأیید کنید', 401)
    if (row.bankAccountId) await reconcileReference(tx, row.bankAccountId, transferReference)
    return tx.payPayment.findUniqueOrThrow({ where: { id } })
  })
}
