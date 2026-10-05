import { renewalTerms } from '@/modules/subscriptions/server/renewal-preview'
// Single implementation of subscription operations, shared by the admin panel,
// the customer panel and the public REST API (/api/v1).
import { db } from '@/platform/database/prisma'
import { getPanelAdapter, type PanelDevice } from '@/modules/providers/server/panels'
import { syncSubscription } from '@/modules/subscriptions/server/provision'
import { createInvoiceForOrder, markInvoicePaid } from '@/modules/billing/server/billing'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'
import { randomToken } from '@/shared/security/random'
import { enqueueFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'

export const SUB_ACTIONS = [
  'enable',
  'disable',
  'rotate',
  'renew',
  'reset-traffic',
  'reset-devices',
  'devices',
  'delete-device',
  'sync',
] as const
export type SubAction = (typeof SUB_ACTIONS)[number]
export const CUSTOMER_SUB_ACTIONS = SUB_ACTIONS.filter(action => action !== 'reset-traffic')

export interface SubActionResult {
  ok: boolean
  message?: string
  /** machine readable reason so the UI can localise the failure */
  code?: string
  data?: unknown
}

export async function loadSubscription(id: number) {
  return db.subscription.findUnique({
    where: { id },
    include: { plan: { include: { panel: true } }, panel: true },
  })
}

function adapterFor(sub: { panel?: any; plan: { panel: any } }) {
  return (sub.panel || sub.plan.panel) ? getPanelAdapter(sub.panel || sub.plan.panel) : null
}

export async function subscriptionAction(
  subId: number,
  action: SubAction,
  payload: { expectedTerms?: string; hwid?: string; chargeFromWallet?: boolean; idempotencyKey?: string } = {}
): Promise<SubActionResult> {
  const sub = await loadSubscription(subId)
  if (!sub) return { ok: false, message: 'subscription not found' }
  const adapter = adapterFor(sub)

  const needPanel = ['enable', 'disable', 'rotate', 'renew', 'reset-traffic', 'reset-devices', 'devices', 'delete-device', 'sync']
  if (needPanel.includes(action) && !adapter) return { ok: false, message: 'panel not configured for this subscription' }

  switch (action) {
    case 'enable':
    case 'disable': {
      const disabled = action === 'disable'
      const res = await adapter!.updateUser(sub.username, { disabled })
      if (!res.ok) return { ok: false, message: res.message || 'panel rejected the change' }
      const updated = await db.subscription.update({
        where: { id: sub.id },
        data: { status: disabled ? 'DISABLED' : 'ACTIVE', lastSyncAt: new Date() },
      })
      return { ok: true, data: { id: updated.id, status: updated.status } }
    }

    case 'rotate': {
      const res = await adapter!.revokeSubscription(sub.username)
      if (!res.ok) return { ok: false, message: res.message || 'panel rejected the rotation' }
      // rotate the local sub token too so the old link stops working everywhere
      const updated = await db.subscription.update({
        where: { id: sub.id },
        data: { subToken: randomToken(24), panelSubUrl: res.subUrl || sub.panelSubUrl, lastSyncAt: new Date() },
      })
      return { ok: true, data: { id: updated.id, subToken: updated.subToken } }
    }

    case 'reset-traffic': {
      const res = await adapter!.resetTraffic(sub.username)
      if (!res.ok) return { ok: false, message: res.message || 'panel rejected the reset' }
      await db.subscription.update({ where: { id: sub.id }, data: { trafficUsed: 0, status: 'ACTIVE', lastSyncAt: new Date() } })
      return { ok: true, data: { id: sub.id, trafficUsed: 0 } }
    }

    case 'reset-devices': {
      const res = await adapter!.resetDevices(sub.username)
      if (!res.ok) return { ok: false, message: res.message || 'panel rejected the reset' }
      return { ok: true, data: { id: sub.id } }
    }

    case 'devices': {
      const res = await adapter!.listDevices(sub.username)
      if (!res.ok) return { ok: false, message: res.message || 'device list unavailable', data: { devices: [] as PanelDevice[] } }
      return { ok: true, data: { devices: res.devices } }
    }

    case 'delete-device': {
      const hwid = String(payload.hwid || '').trim()
      if (!hwid) return { ok: false, message: 'hwid is required' }
      const res = await adapter!.deleteDevice(sub.username, hwid)
      if (!res.ok) return { ok: false, message: res.message || 'panel rejected the deletion' }
      return { ok: true, data: { id: sub.id, hwid } }
    }

    case 'sync': {
      const res = await syncSubscription(sub.id)
      if (!res.ok) return { ok: false, message: res.message || 'sync failed' }
      const fresh = await db.subscription.findUnique({ where: { id: sub.id } })
      return { ok: true, data: fresh }
    }

    case 'renew': {
      const idempotencyKey = String(payload.idempotencyKey || '').trim()
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
        return { ok: false, code: 'IDEMPOTENCY_REQUIRED', message: 'a valid Idempotency-Key is required for renewal' }
      }
      const orderKey = `renew:${sub.id}:${idempotencyKey}`
      const previous = await db.order.findUnique({ where: { idempotencyKey: orderKey }, include: { invoice: true } })
      if (previous?.status === 'FAILED') return { ok: false, code: 'WALLET_FAILED', message: 'this renewal attempt failed; start a new one' }
      // A previous attempt that is still pending stopped part-way (possibly after the wallet was charged):
      // the same request carries on from there instead of answering "in progress" for ever.
      if (previous && previous.status !== 'PENDING') {
        const job = await db.fulfillmentJob.findUnique({ where: { dedupeKey: `RENEW_SUBSCRIPTION:order:${previous.id}` } })
        const fresh = await db.subscription.findUnique({ where: { id: sub.id } })
        return {
          ok: true,
          data: {
            id: sub.id,
            expiresAt: fresh?.expiresAt || sub.expiresAt,
            status: fresh?.status || sub.status,
            charged: previous.totalAmount,
            currency: previous.currency,
            invoiceNumber: previous.invoice?.number || '',
            fulfillmentPending: job ? job.status !== 'DONE' : true,
            replayed: true,
          },
        }
      }

      if (!previous && payload.expectedTerms !== undefined && payload.expectedTerms !== renewalTerms(sub.plan)) return { ok: false, code: 'RENEWAL_CHANGED', message: 'Renewal terms changed; refresh the preview before paying.' }

      // A resumed attempt keeps the price and allowance it froze when it started.
      const frozen = previous ? (() => { try { return JSON.parse(previous.meta || '{}') as Record<string, unknown> } catch { return {} } })() : null
      const currency = normalizeCurrency(previous ? previous.currency : sub.plan.currency)
      const priceMinor = previous ? previous.totalMinor : sub.plan.priceMinor || toMinor(sub.plan.price, currency)
      const price = legacyNumber(priceMinor, currency)
      const balance = await walletBalance(sub.userId, currency)
      // Not asked again on a resume: the wallet may already have been charged for it; the charge itself decides.
      if (!previous && toMinor(balance, currency) < priceMinor) {
        return {
          ok: false,
          code: 'INSUFFICIENT_FUNDS',
          message: `insufficient ${currency} wallet balance`,
          data: { needed: price - balance, balance, currency },
        }
      }

      if (!previous && (!Number.isFinite(sub.plan.days) || sub.plan.days <= 0 || !Number.isFinite(sub.plan.trafficGB) || sub.plan.trafficGB < 0)) {
        return { ok: false, code: 'INVALID_RENEWAL_PLAN', message: 'renewal plan allowance is invalid' }
      }
      // Freeze the purchased allowance; later plan edits must not change a paid renewal.
      const renewal = frozen
        ? { subscriptionId: sub.id, days: Number(frozen.days), trafficGB: Number(frozen.trafficGB), renewalVersion: Number(frozen.renewalVersion) || 2 }
        : { subscriptionId: sub.id, days: sub.plan.days, trafficGB: sub.plan.trafficGB, renewalVersion: 2 }
      if (!Number.isFinite(renewal.days) || renewal.days <= 0 || !Number.isFinite(renewal.trafficGB) || renewal.trafficGB < 0) return { ok: false, code: 'INVALID_RENEWAL_PLAN', message: 'renewal plan allowance is invalid' }
      const order = previous || await db.order.create({
        data: {
          userId: sub.userId,
          planId: sub.planId,
          totalAmount: price,
          totalMinor: priceMinor,
          currency,
          idempotencyKey: orderKey,
          status: 'PENDING',
          provider: 'wallet',
          meta: JSON.stringify({ kind: 'renewal', ...renewal }),
        },
      })
      const invoice = await createInvoiceForOrder({
        orderId: order.id,
        userId: sub.userId,
        planId: sub.planId,
        subtotal: price,
        currency,
        walletApplied: price,
        notes: `Renewal of subscription #${sub.id}`,
        idempotencyKey: `renew-invoice:${sub.id}:${idempotencyKey}`,
      })
      const debit = await moveWallet({
        userId: sub.userId,
        amount: -price,
        currency,
        type: 'RENEWAL',
        description: `${sub.plan.name} renewal ${invoice.number}`,
        orderId: order.id,
        invoiceId: invoice.id,
        idempotencyKey: `renew-wallet:${sub.id}:${idempotencyKey}`,
      })
      if (!debit.ok) {
        // Nothing was charged, so there is no credit to give back; only an invoice that is still open is closed.
        await db.invoice.updateMany({ where: { id: invoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'VOID', walletApplied: 0, walletAppliedMinor: 0n } }).catch(() => {})
        await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } }).catch(() => {})
        return { ok: false, code: 'WALLET_FAILED', message: debit.message || 'wallet charge failed' }
      }
      const settled = await markInvoicePaid({ invoiceId: invoice.id, amount: 0, provider: 'WALLET', raw: { source: 'renewal' } })
      if (!settled.ok) return { ok: false, code: 'SETTLEMENT_FAILED', message: settled.message || 'invoice settlement failed' }

      const job = await enqueueFulfillment({
        kind: 'RENEW_SUBSCRIPTION',
        dedupeKey: `RENEW_SUBSCRIPTION:order:${order.id}`,
        orderId: order.id,
        invoiceId: invoice.id,
        subscriptionId: sub.id,
        payload: renewal,
      })
      const processed = await processFulfillmentJob(job.id)
      const fresh = await db.subscription.findUnique({ where: { id: sub.id } })
      return {
        ok: true,
        data: {
          id: sub.id,
          expiresAt: fresh?.expiresAt || sub.expiresAt,
          status: fresh?.status || sub.status,
          charged: price,
          currency,
          invoiceNumber: invoice.number,
          fulfillmentPending: !processed.ok,
          ...(previous ? { replayed: true } : {}),
        },
      }
    }

    default:
      return { ok: false, message: `unknown action: ${action}` }
  }
}
