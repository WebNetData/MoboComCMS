import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { userOpensSection } from '@/modules/account/server/section-access'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { enqueue } from '@/modules/operations/server/enqueue'
import { botAcknowledged } from '@/modules/billing/domain/pay-bot'
import { payAudit, payTransaction } from '../context'
import { sendBotVerification } from '@/modules/billing/server/pay/bot/transport'

/** Called only after the payment's status and Wallet link were claimed in the same transaction. */
export async function queueBotDelivery(tx: Prisma.TransactionClient, paymentId: string) {
  const row = await tx.payBotDelivery.findUnique({ where: { paymentId } })
  if (!row || row.status !== 'WAITING') return
  const claimed = await tx.payBotDelivery.updateMany({ where: { id: row.id, status: 'WAITING', version: row.version }, data: { status: 'QUEUED', version: { increment: 1 } } })
  if (claimed.count !== 1) throw new Error('Bot delivery intent changed')
  await enqueue('pay.bot-delivery', { deliveryId: row.id }, { dedupeKey: 'pay-bot:' + row.id }, tx)
}

async function canDeliver(tx: Prisma.TransactionClient, row: Awaited<ReturnType<typeof deliveryRow>>) {
  if (!row) return false
  const { integration, payment } = row, merchant = payment.merchant
  return payment.status === 'PAID' && !!payment.walletTxId && integration.active && integration.version === row.configVersion
    && integration.terminalId === payment.terminalId && payment.terminal.active && merchant.status === 'ACTIVE' && merchant.user.status === 'ACTIVE'
    && await isModuleEnabled('mobocom-pay', tx) && !await globalAuthenticationDenied(merchant.userId, new Date(), tx)
    && (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
}
const deliveryRow = (tx: Prisma.TransactionClient, id: string) => tx.payBotDelivery.findUnique({ where: { id }, include: { integration: true, payment: { include: { merchant: { include: { user: true } }, terminal: true } } } })

/** Queue replay never repeats an uncertain outbound action. */
export async function deliverBotPayment(payload: Record<string, unknown>) {
  const id = String(payload.deliveryId || '')
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid bot delivery intent')
  const existing = await deliveryRow(db, id)
  if (!existing || ['WAITING','SENT','UNKNOWN','BLOCKED'].includes(existing.status)) return { status: existing?.status || 'MISSING' }
  if (existing.status === 'SENDING') {
    if (!existing.lastAttemptAt || existing.lastAttemptAt.getTime() > Date.now() - 120_000) return { status: 'SENDING' }
    await payTransaction(async tx => {
      const claim = await tx.payBotDelivery.updateMany({ where: { id, status: 'SENDING', version: existing.version }, data: { status: 'UNKNOWN', lastCode: 'INTERRUPTED_AFTER_CLAIM', version: { increment: 1 } } })
      if (claim.count) await payAudit(tx, { id: existing.payment.merchant.userId, email: existing.payment.merchant.user.email }, 'bot.interrupted', id, { paymentId: existing.paymentId, status: 'UNKNOWN' })
    })
    return { status: 'UNKNOWN' }
  }
  const sectionAllowed = await userOpensSection('mobocom-pay', existing.payment.merchant.userId)
  const maintenance = !!(await loadMaintenance(true))['mobocom-pay']?.enabled
  const attempt = await payTransaction(async tx => {
    const row = await deliveryRow(tx, id)
    if (!row || row.status !== 'QUEUED') return null
    if (!sectionAllowed || maintenance || !await canDeliver(tx, row)) {
      const changed = await tx.payBotDelivery.updateMany({ where: { id, status: 'QUEUED', version: row.version }, data: { status: 'BLOCKED', lastCode: 'CONFIG_OR_AUTHORITY_CHANGED', version: { increment: 1 } } })
      if (!changed.count) throw new Error('Bot delivery claim changed')
      await payAudit(tx, { id: row.payment.merchant.userId, email: row.payment.merchant.user.email }, 'bot.blocked', id, { paymentId: row.paymentId, code: 'CONFIG_OR_AUTHORITY_CHANGED' })
      return null
    }
    const token = randomUUID()
    const claim = await tx.payBotDelivery.updateMany({ where: { id, status: 'QUEUED', version: row.version }, data: { status: 'SENDING', attemptToken: token, lastAttemptAt: new Date(), attempts: { increment: 1 }, version: { increment: 1 } } })
    if (!claim.count) return null
    // Durable reconciliation also covers a process dying after the external system applied the action.
    await enqueue('pay.bot-delivery', { deliveryId: id }, { dedupeKey: 'pay-bot-reconcile:' + id + ':' + token, runAt: new Date(Date.now() + 125_000) }, tx)
    await payAudit(tx, { id: row.payment.merchant.userId, email: row.payment.merchant.user.email }, 'bot.sending', id, { paymentId: row.paymentId, attempt: row.attempts + 1 })
    return { row, token }
  })
  if (!attempt) return { status: 'BLOCKED_OR_CLAIMED' }
  let status = 'UNKNOWN', code = 'RESPONSE_UNKNOWN', httpStatus: number | null = null
  try {
    const response = await sendBotVerification(attempt.row.callbackUrl, decryptPanelCredential(attempt.row.callbackTokenCiphertext), attempt.row.payment.externalId)
    httpStatus = response.status
    if (botAcknowledged(attempt.row.ackPolicy, response.status, response.body)) { status = 'SENT'; code = 'ACKNOWLEDGED' }
    else code = 'ACK_NOT_MATCHED'
  } catch { /* Never persist token, URL credentials, remote body or raw transport error. */ }
  await payTransaction(async tx => {
    const claim = await tx.payBotDelivery.updateMany({ where: { id, status: 'SENDING', attemptToken: attempt.token }, data: { status, lastCode: code, httpStatus, confirmedAt: status === 'SENT' ? new Date() : null, version: { increment: 1 } } })
    if (!claim.count) return
    await payAudit(tx, { id: attempt.row.payment.merchant.userId, email: attempt.row.payment.merchant.user.email }, 'bot.result', id, { paymentId: attempt.row.paymentId, status, code, httpStatus })
  })
  return { status }
}
