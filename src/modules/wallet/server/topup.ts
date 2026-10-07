import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { createGatewayInvoice, gatewayAcceptsCheckoutCurrency, gatewayCallbackUrl, resolveCheckoutGateway } from '@/modules/billing/server/gateways'
import { createInvoiceForOrder, recordProviderEvent } from '@/modules/billing/server/billing'
import { recordPendingTopup } from '@/modules/wallet/server/wallet'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { walletTopupDefaults } from '@/platform/config/financial'

function topupLimit(settings: Record<string, string>, key: 'min' | 'max', currency: string, fallback: number) {
  const suffix = key === 'min' ? 'Min' : 'Max'
  const scoped = Number(settings[`walletTopup${suffix}.${currency}`])
  const generic = Number(settings[`walletTopup${suffix}`])
  return Number.isFinite(scoped) && scoped > 0 ? scoped : Number.isFinite(generic) && generic > 0 ? generic : fallback
}

export async function startWalletTopup(input: {
  userId: number
  email: string
  amount: string | number
  currency?: string
  gatewayRef?: string
  idempotencyKey: string
}) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) return { ok: false as const, status: 400, code: 'IDEMPOTENCY_REQUIRED', message: 'a valid Idempotency-Key is required' }
  const requestedCurrency = input.currency ? normalizeCurrency(input.currency) : undefined
  const gateway = await resolveCheckoutGateway(input.gatewayRef, requestedCurrency)
  if (!gateway) return { ok: false as const, status: input.gatewayRef ? 409 : 503, code: input.gatewayRef ? 'GATEWAY_NOT_AVAILABLE' : 'NO_GATEWAY', message: input.gatewayRef ? 'selected gateway is unavailable for this currency' : 'no usable payment gateway is configured' }
  const currency = normalizeCurrency(requestedCurrency || gateway.fiat)
  if (!gatewayAcceptsCheckoutCurrency(gateway, currency)) return { ok: false as const, status: 409, code: 'GATEWAY_CURRENCY_MISMATCH', message: `gateway does not accept ${currency}` }

  let amountMinor: bigint
  try { amountMinor = toMinor(input.amount, currency) }
  catch (error) { return { ok: false as const, status: 400, code: 'INVALID_AMOUNT', message: error instanceof Error ? error.message : 'invalid amount' } }
  const amount = legacyNumber(amountMinor, currency)
  const settings = await getSettings()
  const defaults = walletTopupDefaults()
  const min = topupLimit(settings, 'min', currency, defaults.min)
  const max = topupLimit(settings, 'max', currency, defaults.max)
  if (amount < min) return { ok: false as const, status: 400, code: 'BELOW_MINIMUM', message: `minimum top-up is ${min} ${currency}` }
  if (amount > max) return { ok: false as const, status: 400, code: 'ABOVE_MAXIMUM', message: `maximum top-up is ${max} ${currency}` }

  const invoiceKey = `wallet-topup:${input.userId}:${input.idempotencyKey}`
  const existing = await db.invoice.findUnique({ where: { idempotencyKey: invoiceKey } })
  if (existing) return {
    ok: true as const, replayed: true, invoiceId: existing.id, invoiceNumber: existing.number,
    paymentUrl: existing.paymentUrl || `/invoice/${existing.number}`,
    manual: !existing.paymentUrl || existing.paymentUrl.startsWith('/invoice/'),
    currency: existing.currency, amount: minorToNumber(existing.totalMinor || toMinor(existing.total, existing.currency), existing.currency),
  }

  const siteUrl = (settings.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const invoice = await createInvoiceForOrder({ userId: input.userId, subtotal: amount, currency, gatewayId: gateway.id, status: 'UNPAID', notes: 'Wallet top-up', kind: 'WALLET_TOPUP', idempotencyKey: invoiceKey })
  const result = await createGatewayInvoice(gateway, {
    orderNumber: invoice.number, amount, currency, email: input.email,
    orderName: `MoboComCMS wallet top-up ${amount} ${currency}`,
    callbackUrl: gatewayCallbackUrl(gateway, siteUrl), successUrl: `${siteUrl}/payment/result?invoice=${invoice.number}`, failUrl: `${siteUrl}/payment/result?invoice=${invoice.number}&failed=1`,
    channel: 'web',
  })
  const payUrl = result.manual ? `/invoice/${invoice.number}` : result.paymentUrl
  if (!result.ok || !payUrl) {
    if (result.ambiguous && gateway.provider === 'FRENZYEX') {
      if (result.txnId) await db.invoice.update({ where: { id: invoice.id }, data: { providerTxnId: result.txnId } }).catch(() => {})
      if (result.providerAmount != null && result.providerCurrency) {
        await recordProviderEvent({
          provider: 'FRENZYEX', event: 'payment.requested',
          eventKey: result.txnId ? `frenzyex:create:${result.txnId}` : `frenzyex:create:invoice:${invoice.id}`,
          status: 'PENDING', gatewayId: gateway.id, invoiceId: invoice.id, userId: input.userId,
          amount: result.providerAmount, currency: result.providerCurrency, providerTxnId: result.txnId || '',
          raw: { ambiguous: true, kind: 'WALLET_TOPUP' },
        }).catch(() => {})
      }
      console.warn(`[wallet] FrenzyEx response ambiguous for ${invoice.number}: ${result.message || 'unknown'}`)
      return { ok: false as const, status: 502, code: 'GATEWAY_AMBIGUOUS', message: 'payment gateway response is ambiguous; check this invoice before retrying', invoiceNumber: invoice.number, invoiceUrl: `/invoice/${invoice.number}` }
    }
    await db.invoice.updateMany({ where: { id: invoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'VOID' } }).catch(() => {})
    console.warn(`[wallet] gateway invoice failed for ${invoice.number}: ${result.message || 'unknown'}`)
    return { ok: false as const, status: 502, code: 'GATEWAY_FAILED', message: 'could not start the payment' }
  }
  await db.invoice.update({ where: { id: invoice.id }, data: { providerTxnId: result.txnId || '', paymentUrl: payUrl } })
  if (gateway.provider === 'FRENZYEX' && result.txnId && result.providerAmount != null && result.providerCurrency) {
    await recordProviderEvent({
      provider: 'FRENZYEX', event: 'payment.requested', eventKey: `frenzyex:create:${result.txnId}`, status: 'PENDING',
      gatewayId: gateway.id, invoiceId: invoice.id, userId: input.userId,
      amount: result.providerAmount, currency: result.providerCurrency, providerTxnId: result.txnId,
      raw: { expiresAt: result.expiresAt || null, kind: 'WALLET_TOPUP' },
    })
  }
  const pending = await recordPendingTopup({ userId: input.userId, amount, currency, invoiceId: invoice.id, description: `Wallet top-up ${invoice.number}`, idempotencyKey: `wallet-topup-ledger:${input.userId}:${input.idempotencyKey}` })
  return { ok: true as const, replayed: false, invoiceId: invoice.id, invoiceNumber: invoice.number, paymentUrl: payUrl, manual: Boolean(result.manual), pendingTxId: pending.id, currency, amount }
}
