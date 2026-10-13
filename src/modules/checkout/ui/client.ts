'use client'

import { formatCurrency, BASE_CURRENCY } from '@/shared/money/client'
import { newIdempotencyKey } from '@/shared/security/idempotency'

export interface CheckoutResult {
  ok: boolean
  paid: boolean
  paymentUrl: string
  invoiceUrl: string
  invoiceNumber: string
  orderId: number | null
  subscriptionId: number | null
  username: string
  suggestion: string
  walletApplied: number
  amountDue: number
  needed: number
  balance: number
  currency: string
  fulfillmentPending: boolean
  code: string
  message: string
  status: number
  gatewayLabel: string
  providerAmount: number | null
  providerCurrency: string
}

export interface CheckoutGatewayChoice {
  ref: string
  id: number | null
  name: string
  label: string
  provider: string
  fiat: string
  acceptedCurrencies: string[]
  feePercent: number
  minAmount: number
  isDefault: boolean
}

type CheckoutPayload = { formSubmissionId?: number; contentKey?: string; membershipPlanId?: number; planId?: number; offerId?: number; productId?: number; variantId?: number; addressId?: number; delivery?: { date: string; slotId: string }; shippingAddress?: { recipient: string; phone: string; country: string; city: string; postalCode: string; address: string }; payWith?: 'wallet' | 'gateway'; username?: string; gatewayRef?: string; discountCode?: string }

function storageKey(payload: CheckoutPayload) {
  return `happ.checkout.idempotency.${payload.formSubmissionId ? `form.${payload.formSubmissionId}` : payload.contentKey ? `content.${payload.contentKey}` : payload.membershipPlanId ? `vip.${payload.membershipPlanId}` : payload.offerId ? `offer.${payload.offerId}` : payload.planId ? `plan.${payload.planId}` : `product.${payload.productId}.${payload.variantId || 0}`}.${String(payload.discountCode || '').trim().toUpperCase()}`
}

function idempotencyKey(payload: CheckoutPayload) {
  const key = storageKey(payload)
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const fresh = newIdempotencyKey('web')
    sessionStorage.setItem(key, fresh)
    return fresh
  } catch {
    return newIdempotencyKey('web')
  }
}

export async function startCheckout(payload: CheckoutPayload): Promise<CheckoutResult> {
  const key = idempotencyKey(payload)
  let res: Response
  try {
    res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    // Keep the key: the server may have committed before the connection died.
    throw error
  }
  const data = await res.json().catch(() => null)
  // FrenzyEx v1 has no idempotency-key header. If the network result is
  // ambiguous, preserve the same client key so a retry replays the existing
  // local order instead of creating a second remote checkout.
  if (String(data?.code || '') !== 'GATEWAY_AMBIGUOUS') {
    try { sessionStorage.removeItem(storageKey(payload)) } catch {}
  }

  return {
    ok: res.ok,
    paid: Boolean(data?.paid),
    paymentUrl: String(data?.paymentUrl || ''),
    invoiceUrl: String(data?.invoiceUrl || ''),
    invoiceNumber: String(data?.invoiceNumber || ''),
    orderId: data?.orderId ?? null,
    subscriptionId: data?.subscriptionId ?? null,
    username: String(data?.username || ''),
    suggestion: String(data?.suggestion || ''),
    walletApplied: Number(data?.walletApplied) || 0,
    amountDue: Number(data?.amountDue) || 0,
    needed: Number(data?.needed) || 0,
    balance: Number(data?.balance) || 0,
    currency: String(data?.currency || BASE_CURRENCY),
    fulfillmentPending: Boolean(data?.fulfillmentPending),
    code: String(data?.code || ''),
    message: String(data?.error || ''),
    status: res.status,
    gatewayLabel: String(data?.gatewayLabel || ''),
    providerAmount: data?.providerAmount == null ? null : Number(data.providerAmount),
    providerCurrency: String(data?.providerCurrency || ''),
  }
}

export async function fetchCheckoutGateways(currency?: string): Promise<CheckoutGatewayChoice[]> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : ''
  const res = await fetch(`/api/payment/gateways${query}`, { cache: 'no-store' })
  if (!res.ok) return []
  const data = await res.json().catch(() => null)
  return Array.isArray(data?.gateways) ? data.gateways : []
}

export interface WalletBalanceDto { currency: string; balance: number }

export async function fetchWalletBalances(): Promise<WalletBalanceDto[]> {
  const res = await fetch('/api/me')
  if (!res.ok) return []
  const data = await res.json().catch(() => null)
  return Array.isArray(data?.walletBalances) ? data.walletBalances : []
}

export async function fetchWalletBalance(currency = BASE_CURRENCY): Promise<number> {
  const balances = await fetchWalletBalances()
  return Number(balances.find((item) => item.currency === currency)?.balance || 0)
}

export const money = (n: number, currency = BASE_CURRENCY, locale = 'en-US') => formatCurrency(n, currency, locale)
