import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { processFulfillmentBatch, recoverMissingPaidFulfillment, recoverPaidWalletTopups } from '@/modules/fulfillment/server/jobs'
import { alertStuckFulfillment } from '@/modules/fulfillment/server/alerts'
import { releaseExpiredReservations } from '@/modules/catalog/server/inventory'
import { processFrenzyReconciliationBatch } from '@/modules/billing/server/frenzyex-reconciliation'
import { cleanupResellerBotUpdates, retryResellerDeliveries } from '@/modules/reseller/server/reseller-bot-sales'
import { releaseTerminalPromotionReservations } from '@/modules/promotions/server/promotions'
import { err, ok } from '@/platform/http/response'
import { env } from '@/platform/config/env'
import { logEvent, requestIdFrom } from '@/platform/observability/logger'
import { syncRecentInvoiceEvents } from '@/modules/notifications/server/inbox'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

function authorized(req: NextRequest) {
  const expected = env('INTERNAL_JOBS_SECRET')
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers.get('x-internal-secret') || '').trim()
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!env('INTERNAL_JOBS_SECRET')) return err('internal worker secret is not configured', 503, { code: 'WORKER_NOT_CONFIGURED' })
  if (!authorized(req)) return err('unauthorized', 401, { code: 'UNAUTHORIZED' })
  const rawLimit = Number(req.nextUrl.searchParams.get('limit') || 20)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 20
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
  logEvent(warn ? 'warn' : 'info', 'worker.batch', { requestId: requestIdFrom(req.headers), limit, payments, topups, recovered, fulfillment, inbox, resellerDeliveries, resellerUpdatesCleaned, promotionsReleased, alerts, releasedReservations })
  return ok({ payments, topups, recovered, fulfillment, inbox, resellerDeliveries, resellerUpdatesCleaned, promotionsReleased, alerts, releasedReservations })
}
