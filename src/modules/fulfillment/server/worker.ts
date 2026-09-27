import { processFulfillmentBatch, recoverMissingPaidFulfillment, recoverPaidWalletTopups } from '@/modules/fulfillment/server/jobs'
import { alertStuckFulfillment } from '@/modules/fulfillment/server/alerts'
import { releaseExpiredReservations } from '@/modules/catalog/server/inventory'
import { processFrenzyReconciliationBatch } from '@/modules/billing/server/frenzyex-reconciliation'
import { cleanupResellerBotUpdates, retryResellerDeliveries } from '@/modules/reseller/server/reseller-bot-sales'
import { releaseTerminalPromotionReservations } from '@/modules/promotions/server/promotions'
import { logEvent } from '@/platform/observability/logger'
import { syncRecentInvoiceEvents } from '@/modules/notifications/server/inbox'

/**
 * One pass of the order worker: reconcile payments, retry fulfillment and
 * reseller deliveries, alert on stuck orders and release expired holds.
 * Runs about once a minute, from the built-in scheduler or POST /api/internal/fulfillment/run.
 */
export async function runFulfillmentWorker(limit = 20, requestId?: string) {
  // Recover authoritative payment state before side-effect retries/cleanup.
  const payments = await processFrenzyReconciliationBatch(limit)
  const topups = await recoverPaidWalletTopups(limit)
  const recovered = await recoverMissingPaidFulfillment(limit)
  const fulfillment = await processFulfillmentBatch(limit)
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
  const releasedReservations = await releaseExpiredReservations(Math.max(100, limit * 5))
  const warn = Boolean(payments.failed || payments.untracked || topups.failed || recovered.failed || fulfillment.failed || inbox.checked < 0 || alerts.failed || resellerDeliveries < 0)
  logEvent(warn ? 'warn' : 'info', 'worker.batch', { requestId, limit, payments, topups, recovered, fulfillment, inbox, resellerDeliveries, resellerUpdatesCleaned, promotionsReleased, alerts, releasedReservations })
  return { payments, topups, recovered, fulfillment, inbox, resellerDeliveries, resellerUpdatesCleaned, promotionsReleased, alerts, releasedReservations }
}
