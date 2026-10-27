'use client'

import { newIdempotencyKey } from '@/shared/security/idempotency'

// Browser helpers for the cart API. Every change broadcasts the new item
// count so the header cart button stays in sync without a page reload.

export type CartLine = {
  id: number; productId: number; variantId: number | null; slug: string; name: string; variantName: string; attributes: Record<string, string>
  image: string; brand: string; kind: string; instant?: boolean; quantity: number; maxQuantity: number; unitPrice: number; listPrice: number; lineTotal: number; currency: string; issue: string
  inputs?: { label: string; value: string }[]; openAmount?: { amount: string; currency: string } | null
}
export type Cart = {
  token: string; lines: CartLine[]; count: number; currency: string; itemsTotal: number; listTotal: number; saving: number
  shipping: number; total: number; hasPhysical: boolean; blocked: boolean; shippingByAddress?: boolean; waiting?: number; overLimit?: number
  /** Open free-shipping offers: the minimum in the cart's currency and the place it applies to. */
  freeShipping?: { id: string; label: string; place: string; min: number }[]
}
export type CartResult = { ok: true; cart: Cart; limited?: boolean } | { ok: false; error: string; code: string; status: number }

export const CART_EVENT = 'mc:cart'

function broadcast(cart: Cart) {
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { count: cart.count } }))
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<CartResult> {
  try {
    const response = await fetch('/api/cart', {
      method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.cart) return { ok: false, error: String(data?.error || 'درخواست انجام نشد'), code: String(data?.code || ''), status: response.status }
    if (method !== 'GET') broadcast(data.cart)
    return { ok: true, cart: data.cart, limited: Boolean(data.limited) }
  } catch {
    return { ok: false, error: 'ارتباط برقرار نشد؛ دوباره تلاش کنید', code: 'NETWORK_ERROR', status: 0 }
  }
}

export const loadCart = () => call('GET')
/** `extra`: what the product asks its buyer (answers by field key) and a typed foreign amount. */
export type CartExtra = { inputs?: Record<string, string>; openAmount?: { amount: string; currency: string } }
export const addToCart = (productId: number, variantId: number | null, quantity = 1, extra?: CartExtra) => call('POST', { productId, variantId, quantity, ...extra })
export const addBundleToCart = (bundleId: number) => call('POST', { bundleId })
export const setLineQuantity = (lineId: number, quantity: number) => call('PATCH', { lineId, quantity })
export const emptyCart = () => call('DELETE')

const KEY = 'mc.cart.checkout.key'

/** Places the order for the whole cart. The idempotency key survives a lost response. */
export async function checkoutCart(payload: { addressId?: number; delivery?: { date: string; slotId: string }; carrierId?: string; gatewayRef?: string; discountCode?: string; payWith?: 'wallet' | 'gateway' }) {
  let key = ''
  try { key = sessionStorage.getItem(KEY) || '' } catch { key = '' }
  if (!key) {
    key = newIdempotencyKey('web')
    try { sessionStorage.setItem(KEY, key) } catch { /* private mode */ }
  }
  const response = await fetch('/api/cart/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload) })
  const data = await response.json().catch(() => null)
  const validSuccess = response.ok && Number.isSafeInteger(data?.orderId) && data.orderId > 0
  // Unresolved outcomes must retry the same order, including malformed replies.
  if (validSuccess || (response.status >= 400 && response.status < 500 && String(data?.code || '') !== 'GATEWAY_AMBIGUOUS')) {
    try { sessionStorage.removeItem(KEY) } catch { /* private mode */ }
  }
  if (validSuccess) void loadCart().then(result => { if (result.ok) broadcast(result.cart) })
  return {
    ok: validSuccess,
    code: response.ok && !validSuccess ? 'CHECKOUT_RESPONSE_INVALID' : String(data?.code || ''),
    message: response.ok && !validSuccess ? 'وضعیت سفارش مشخص نشد؛ دوباره تلاش کنید یا سفارش‌ها را بررسی کنید.' : String(data?.error || ''),
    paid: Boolean(data?.paid),
    paymentUrl: String(data?.paymentUrl || ''),
    invoiceUrl: String(data?.invoiceUrl || ''),
    invoiceNumber: String(data?.invoiceNumber || ''),
    orderId: Number(data?.orderId) || null,
    needed: Number(data?.needed) || 0,
    currency: String(data?.currency || ''),
  }
}
