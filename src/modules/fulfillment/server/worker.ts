import { processFulfillmentBatch, recoverHostingOrders, recoverMissingPaidFulfillment, recoverPaidWalletTopups } from '@/modules/fulfillment/server/jobs'
import { alertStuckFulfillment } from '@/modules/fulfillment/server/alerts'
import { releaseExpiredReservations } from '@/modules/catalog/server/inventory'
import { syncAllCodeStock } from '@/modules/store/server/digital-codes'
import { processFrenzyReconciliationBatch } from '@/modules/billing/server/frenzyex-reconciliation'
import { recoverVoidInvoiceCredit } from '@/modules/billing/server/billing'
import { cleanupResellerBotUpdates, retryResellerDeliveries } from '@/modules/reseller/server/reseller-bot-sales'
import { releaseTerminalPromotionReservations } from '@/modules/promotions/server/promotions'
import { logEvent } from '@/platform/observability/logger'
import { syncRecentInvoiceEvents } from '@/modules/notifications/server/inbox'
import { recoverReferralRewards } from '@/modules/referrals/server/referrals'
import { recoverInterruptedRefunds } from '@/modules/store/server/returns'
import { eraseFinishedOrderInputs, recoverStoreSaleRecords } from '@/modules/store/server/orders'

/**
 * One pass of the order worker: reconcile payments, retry fulfillment and
 * reseller deliveries, alert on stuck orders and release expired holds.
 * Runs about once a minute, from the built-in scheduler or POST /api/internal/fulfillment/run.
 */
export async function runFulfillmentWorker(limit = 20, requestId?: string) {
  // Recover authoritative payment state before side-effect retries/cleanup. A step that
  // fails is reported and the next ones still run: paid orders are delivered and expired
  // holds released even while payment reconciliation is failing.
  const failedStep = <T>(step: string, fallback: T) => (error: unknown) => { logEvent('error', 'worker.step_failed', { step, error }); return fallback }
  const payments = await processFrenzyReconciliationBatch(limit).catch(failedStep('payments', { checked: 0, paid: 0, pending: 0, expired: 0, canceled: 0, failed: 1, untracked: 0, deferred: 0 }))
  const topups = await recoverPaidWalletTopups(limit).catch(failedStep('topups', { checked: 0, credited: 0, failed: 1 }))
  const referrals = await recoverReferralRewards().catch(failedStep('referrals', { checked: 0, paid: 0, failed: 1 }))
  const refunds = await recoverInterruptedRefunds(limit).catch(failedStep('refunds', { checked: 0, finished: 0, failed: 1 }))
  const voidCredit = await recoverVoidInvoiceCredit(limit).catch(failedStep('voidCredit', { checked: 0, released: 0, failed: 1 }))
  const recovered = await recoverMissingPaidFulfillment(limit).catch(failedStep('recovery', { checked: 0, enqueued: 0, failed: 1 }))
  const hosting = await recoverHostingOrders(limit).catch(failedStep('hosting', { checked: 0, enqueued: 0, failed: 1 }))
  const saleRecords = await recoverStoreSaleRecords(limit).catch(failedStep('saleRecords', { checked: 0, recorded: 0, failed: 1 }))
  const fulfillment = await processFulfillmentBatch(limit).catch(failedStep('fulfillment', { checked: 0, done: 0, failed: 1 }))
  const inbox = await syncRecentInvoiceEvents().catch(error => { logEvent('error', 'inbox.sync_failed', { error }); return { checked: -1 } })
  const resellerDeliveries = await retryResellerDeliveries(limit).catch((error) => {
    logEvent('error', 'reseller.delivery_batch_failed', { error })
    return -1
  })
  const resellerUpdatesCleaned = await cleanupResellerBotUpdates().catch(() => 0)
  const promotionsReleased = await releaseTerminalPromotionReservations(Math.max(100, limit * 5)).catch(() => 0)
  const alerts = await alertStuckFulfillment(Math.min(limit, 10)).catch((error) => {
    logEvent('error', 'fulfillment.alert_batch_failed', { error })
    return { sent: 0, failed: 1 }
  })
  const releasedReservations = await releaseExpiredReservations(Math.max(100, limit * 5)).catch(failedStep('reservations', -1))
  // Logins and details a buyer gave for an order are wiped a week after the order is done.
  const inputsErased = await eraseFinishedOrderInputs().catch(failedStep('orderInputs', -1))
  // Products that deliver codes: stock follows the pool again if something else wrote the stock column.
  const codeStock = await syncAllCodeStock().catch(failedStep('codeStock', { checked: 0, changed: 0, failed: 1 }))
  const lateDeliveries = await (await import('@/modules/store/server/staff-delivery')).alertLateDeliveries().catch(failedStep('lateDeliveries', { checked: 0, alerted: 0 }))
  const warn = Boolean(payments.failed || payments.untracked || topups.failed || referrals.failed || refunds.failed || voidCredit.failed || recovered.failed || hosting.failed || saleRecords.failed || fulfillment.failed || inbox.checked < 0 || alerts.failed || resellerDeliveries < 0 || releasedReservations < 0)
  logEvent(warn ? 'warn' : 'info', 'worker.batch', { requestId, limit, payments, topups, referrals, refunds, voidCredit, recovered, hosting, saleRecords, fulfillment, inbox, resellerDeliveries, resellerUpdatesCleaned, promotionsReleased, alerts, releasedReservations, inputsErased, codeStock, lateDeliveries })
  return { payments, topups, referrals, refunds, voidCredit, recovered, saleRecords, fulfillment, inbox, resellerDeliveries, resellerUpdatesCleaned, promotionsReleased, alerts, releasedReservations, codeStock, lateDeliveries }
}
