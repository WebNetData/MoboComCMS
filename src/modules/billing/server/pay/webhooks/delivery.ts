import { createHash, createHmac, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { userOpensSection } from '@/modules/account/server/section-access'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { enqueue } from '@/modules/operations/server/enqueue'
import { minorToDecimal } from '@/shared/money'
import { webhookRetryMs, WEBHOOK_MAX_ATTEMPTS, type PayWebhookEvent } from '@/modules/billing/domain/pay-webhooks'
import { payAudit, payTransaction } from '../context'
import { publicHttpsPost } from '../outbound'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const deliveryRow = (tx: Prisma.TransactionClient, id: string) => tx.payWebhookDelivery.findUnique({ where: { id }, include: { endpoint: true, payment: { include: { terminal: true, merchant: { include: { user: true } } } } } })
type Delivery = NonNullable<Awaited<ReturnType<typeof deliveryRow>>>
const systemActor = (row: Delivery) => ({ id: row.payment.merchant.userId, email: row.payment.merchant.user.email })

/** Committed with the canonical paid claim and wallet credit; body contains only finalized Pay facts. */
export async function queuePayWebhook(tx: Prisma.TransactionClient, paymentId: string) {
  if (await tx.payWebhookDelivery.findUnique({ where: { paymentId } })) return
  const payment = await tx.payPayment.findUnique({ where: { id: paymentId }, include: { terminal: { include: { webhookEndpoint: true } } } })
  if (!payment || payment.status !== 'PAID' || !payment.paidAt || !payment.walletTxId) throw new Error('WEBHOOK_PAID_PROOF_MISSING')
  const endpoint = payment.terminal.webhookEndpoint
  if (!endpoint) return
  if (payment.creditCurrency !== 'IRR' && payment.creditCurrency !== 'USDT') throw new Error('WEBHOOK_CURRENCY_INVALID')
  const id = randomUUID()
  const event: PayWebhookEvent = { id, type: 'payment.paid', version: 1, created_at: payment.paidAt.toISOString(), data: {
    payment_id: payment.id, terminal_id: payment.terminalId, external_id: payment.externalId, status: 'PAID',
    order_amount_rial: payment.amountMinor.toString(), invoice_total_rial: payment.totalMinor.toString(), contract_fee_rial: payment.feeMinor.toString(),
    merchant_credit_currency: payment.creditCurrency, merchant_credit_amount: minorToDecimal(payment.creditMinor, payment.creditCurrency),
  } }
  const payloadJson = JSON.stringify(event)
  const row = await tx.payWebhookDelivery.create({ data: { id, endpointId: endpoint.id, paymentId, configVersion: endpoint.version, url: endpoint.url, secretCiphertext: endpoint.secretCiphertext, payloadJson, payloadHash: hash(payloadJson), status: endpoint.active ? 'PENDING' : 'PAUSED', lastCode: endpoint.active ? '' : 'ENDPOINT_INACTIVE' } })
  if (row.status === 'PENDING') await enqueue('pay.webhook-delivery', { deliveryId: id }, { dedupeKey: 'pay-webhook-new:' + id }, tx)
}

async function canDeliver(tx: Prisma.TransactionClient, row: Delivery) {
  const { endpoint, payment } = row, merchant = payment.merchant
  return payment.status === 'PAID' && !!payment.paidAt && !!payment.walletTxId && endpoint.active && endpoint.version === row.configVersion && endpoint.url === row.url && endpoint.secretCiphertext === row.secretCiphertext && endpoint.terminalId === payment.terminalId && payment.terminal.active && merchant.status === 'ACTIVE' && merchant.user.status === 'ACTIVE' && await isModuleEnabled('mobocom-pay', tx) && !await globalAuthenticationDenied(merchant.userId, new Date(), tx) && (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
}

/** Runs after process interruptions too. Network success is at-least-once, never an additional credit. */
export async function deliverPayWebhook(payload: Record<string, unknown>) {
  const id = String(payload.deliveryId || '')
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('WEBHOOK_INTENT_INVALID')
  const existing = await deliveryRow(db, id)
  if (!existing || ['DELIVERED','FAILED','PAUSED'].includes(existing.status)) return { status: existing?.status || 'MISSING' }
  if (existing.status === 'SENDING') {
    if (!existing.leaseExpiresAt || existing.leaseExpiresAt.getTime() > Date.now()) return { status: 'SENDING' }
    await payTransaction(async tx => {
      const row = await deliveryRow(tx, id)
      if (!row || row.status !== 'SENDING' || !row.leaseExpiresAt || row.leaseExpiresAt > new Date()) return
      const exhausted = row.cycleAttempts >= WEBHOOK_MAX_ATTEMPTS, next = new Date(Date.now() + webhookRetryMs(row.cycleAttempts))
      const claimed = await tx.payWebhookDelivery.updateMany({ where: { id, status: 'SENDING', version: row.version, attemptToken: row.attemptToken }, data: { status: exhausted ? 'FAILED' : 'RETRY', version: { increment: 1 }, attemptToken: '', leaseExpiresAt: null, nextAttemptAt: next, lastCode: 'INTERRUPTED_UNKNOWN', httpStatus: null } })
      if (!claimed.count) return
      const history = await tx.payWebhookAttempt.updateMany({ where: { deliveryId: id, token: row.attemptToken, status: 'STARTED' }, data: { status: 'UNKNOWN', code: 'INTERRUPTED_UNKNOWN', finishedAt: new Date() } })
      if (history.count !== 1) throw new Error('WEBHOOK_ATTEMPT_HISTORY_INVALID')
      if (!exhausted) await enqueue('pay.webhook-delivery', { deliveryId: id }, { dedupeKey: 'pay-webhook-retry:' + id + ':' + (row.version + 1), runAt: next }, tx)
      await payAudit(tx, systemActor(row), 'webhook.interrupted', id, { paymentId: row.paymentId, status: exhausted ? 'FAILED' : 'RETRY' })
    })
    return { status: 'INTERRUPTED' }
  }
  const attempt = await payTransaction(async tx => {
    const row = await deliveryRow(tx, id)
    if (!row || !['PENDING','RETRY'].includes(row.status)) return null
    if (row.nextAttemptAt > new Date()) return null
    const sectionAllowed = await userOpensSection('mobocom-pay', row.payment.merchant.userId, true)
    const maintenance = !!(await loadMaintenance(true))['mobocom-pay']?.enabled
    if (!sectionAllowed || maintenance || !await canDeliver(tx, row) || hash(row.payloadJson) !== row.payloadHash) {
      const changed = await tx.payWebhookDelivery.updateMany({ where: { id, status: row.status, version: row.version }, data: { status: 'PAUSED', lastCode: 'CONFIG_OR_AUTHORITY_CHANGED', version: { increment: 1 } } })
      if (changed.count) await payAudit(tx, systemActor(row), 'webhook.paused', id, { paymentId: row.paymentId, code: 'CONFIG_OR_AUTHORITY_CHANGED' })
      return null
    }
    const token = randomUUID(), now = new Date(), leaseExpiresAt = new Date(now.getTime() + 120000)
    const claimed = await tx.payWebhookDelivery.updateMany({ where: { id, status: row.status, version: row.version }, data: { status: 'SENDING', attemptToken: token, leaseExpiresAt, attempts: { increment: 1 }, cycleAttempts: { increment: 1 }, version: { increment: 1 } } })
    if (!claimed.count) return null
    await tx.payWebhookAttempt.create({ data: { id: randomUUID(), deliveryId: id, token, number: row.attempts + 1, url: row.url, configVersion: row.configVersion } })
    await enqueue('pay.webhook-delivery', { deliveryId: id }, { dedupeKey: 'pay-webhook-reconcile:' + id + ':' + token, runAt: new Date(now.getTime() + 125000) }, tx)
    await payAudit(tx, systemActor(row), 'webhook.sending', id, { paymentId: row.paymentId, attempt: row.attempts + 1 })
    return { row, token }
  })
  if (!attempt) return { status: 'PAUSED_OR_CLAIMED' }
  let httpStatus: number | null = null, code = 'RESPONSE_UNKNOWN', delivered = false
  try {
    const timestamp = String(Math.floor(Date.now() / 1000)), secret = decryptPanelCredential(attempt.row.secretCiphertext)
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('WEBHOOK_SECRET_INVALID')
    const signature = createHmac('sha256', secret).update(timestamp + '.').update(attempt.row.payloadJson).digest('hex')
    const response = await publicHttpsPost(attempt.row.url, attempt.row.payloadJson, { 'X-MoboCom-Event-Id': id, 'X-MoboCom-Timestamp': timestamp, 'X-MoboCom-Signature': 'v1=' + signature, 'X-MoboCom-Attempt-Id': attempt.token })
    httpStatus = response.status; delivered = response.status >= 200 && response.status < 300; code = delivered ? 'ACKNOWLEDGED' : 'HTTP_NOT_2XX'
  } catch { /* Never retain remote body, raw transport errors or credentials. */ }
  await payTransaction(async tx => {
    const row = await deliveryRow(tx, id)
    if (!row || row.status !== 'SENDING' || row.attemptToken !== attempt.token) return
    const exhausted = row.cycleAttempts >= WEBHOOK_MAX_ATTEMPTS, next = new Date(Date.now() + webhookRetryMs(row.cycleAttempts)), status = delivered ? 'DELIVERED' : exhausted ? 'FAILED' : 'RETRY'
    const claim = await tx.payWebhookDelivery.updateMany({ where: { id, status: 'SENDING', version: row.version, attemptToken: attempt.token }, data: { status, lastCode: code, httpStatus, deliveredAt: delivered ? new Date() : null, nextAttemptAt: next, attemptToken: '', leaseExpiresAt: null, version: { increment: 1 } } })
    if (!claim.count) return
    const history = await tx.payWebhookAttempt.updateMany({ where: { deliveryId: id, token: attempt.token, status: 'STARTED' }, data: { status: delivered ? 'DELIVERED' : 'FAILED', code, httpStatus, finishedAt: new Date() } })
    if (history.count !== 1) throw new Error('WEBHOOK_ATTEMPT_HISTORY_INVALID')
    if (status === 'RETRY') await enqueue('pay.webhook-delivery', { deliveryId: id }, { dedupeKey: 'pay-webhook-retry:' + id + ':' + (row.version + 1), runAt: next }, tx)
    await payAudit(tx, systemActor(row), 'webhook.result', id, { paymentId: row.paymentId, status, code, httpStatus })
  })
  return { status: delivered ? 'DELIVERED' : 'RETRY_OR_FAILED' }
}
