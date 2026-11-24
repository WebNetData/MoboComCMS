import { PayError } from '@/modules/billing/domain/pay'
import type { PayBotDeliveryView } from '@/modules/billing/domain/pay-bot'
import { enqueue } from '@/modules/operations/server/enqueue'
import { merchantFor, payAudit, payTransaction, type PayActor } from '../context'

export async function botDeliveries(actor: PayActor): Promise<PayBotDeliveryView[]> {
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx)
    const rows = await tx.payBotDelivery.findMany({ where: { payment: { merchantId: merchant.id } }, include: { payment: { include: { terminal: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100 })
    return rows.map(row => ({ id: row.id, paymentId: row.paymentId, externalId: row.payment.externalId, terminalName: row.payment.terminal.name, status: row.status as PayBotDeliveryView['status'], paymentStatus: row.payment.status === 'PENDING' && row.payment.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : row.payment.status as PayBotDeliveryView['paymentStatus'], attempts: row.attempts, version: row.version, lastCode: row.lastCode, httpStatus: row.httpStatus, updatedAt: row.updatedAt.toISOString() }))
  })
}

export async function recoverBotDelivery(actor: PayActor, input: Record<string, unknown>) {
  if (actor.machine) throw new PayError('بررسی نتیجه فقط از حساب پذیرنده انجام می‌شود', 403)
  if (typeof input.id !== 'string' || !Number.isSafeInteger(input.version) || !['retry','confirm'].includes(String(input.action)) || input.confirmed !== true) throw new PayError('تأیید آگاهانه و نسخهٔ فعلی نتیجه لازم است')
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx, true)
    const row = await tx.payBotDelivery.findFirst({ where: { id: input.id as string, payment: { merchantId: merchant.id } }, include: { integration: true, payment: { include: { terminal: true } } } })
    if (!row) throw new PayError('نتیجه پیدا نشد', 404)
    if (row.version !== input.version || !['UNKNOWN','BLOCKED'].includes(row.status) || row.payment.status !== 'PAID' || !row.payment.walletTxId) throw new PayError('وضعیت تغییر کرده یا قابل بررسی مجدد نیست', 409)
    const retry = input.action === 'retry'
    if (retry && (!row.integration.active || !row.payment.terminal.active)) throw new PayError('ابتدا اتصال و پایانه را فعال کنید', 409)
    const claim = await tx.payBotDelivery.updateMany({ where: { id: row.id, version: row.version, status: row.status }, data: {
      status: retry ? 'QUEUED' : 'SENT', version: { increment: 1 }, lastCode: retry ? 'EXPLICIT_RETRY' : 'MERCHANT_CONFIRMED',
      ...(retry ? { configVersion: row.integration.version, callbackUrl: row.integration.callbackUrl, callbackTokenCiphertext: row.integration.callbackTokenCiphertext, ackPolicy: row.integration.ackPolicy, attemptToken: '', httpStatus: null } : { confirmedAt: new Date() }),
    } })
    if (!claim.count) throw new PayError('نتیجه هم‌زمان تغییر کرده است', 409)
    if (retry) await enqueue('pay.bot-delivery', { deliveryId: row.id }, { dedupeKey: 'pay-bot-explicit:' + row.id + ':' + (row.version + 1) }, tx)
    await payAudit(tx, actor, retry ? 'bot.explicit-retry' : 'bot.external-confirmation', row.id, { paymentId: row.paymentId, before: row.status, duplicateRiskAccepted: retry })
    return { saved: true }
  })
}
