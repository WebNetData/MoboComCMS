import { createCipheriv, createHash } from 'node:crypto'

// Buy-now-pay-later ("خرید اقساطی") providers: SnappPay, DigiPay (credit /
// BNPL tickets) and Azki Vam. Each follows the same round trip as a bank
// gateway: create a payment → the customer approves it on the provider's
// page → the provider sends the customer back → verify → (our order is
// confirmed) → settle / deliver. A failed confirmation is reverted.
//
// The base URL of every provider is configurable, so the merchant can point
// a gateway at the provider's sandbox before going live.

export type InstallmentCredentials = {
  provider: 'SNAPPPAY' | 'DIGIPAY' | 'AZKI'
  baseUrl: string
  /** SnappPay/DigiPay: OAuth client id · Azki: merchant id. */
  clientId: string
  /** SnappPay/DigiPay: OAuth client secret · Azki: API key. */
  clientSecret: string
  username: string
  password: string
}

export type InstallmentItem = { id: string; name: string; count: number; amountRial: bigint; category: string }
export type CreateInput = { reference: string; amountRial: bigint; shippingRial: bigint; mobile: string; returnUrl: string; items: InstallmentItem[] }
export type CreateResult = { ok: true; token: string; paymentUrl: string } | { ok: false; message: string; ambiguous?: boolean }
export type StepResult = { ok: boolean; message: string; network?: boolean; detail?: Record<string, unknown> }

export const DEFAULT_BASE: Record<InstallmentCredentials['provider'], string> = {
  SNAPPPAY: 'https://fms-gateway-staging.apps.public.teh-1.snappcloud.io',
  DIGIPAY: 'https://api.mydigipay.com',
  AZKI: 'https://api.azkivam.com',
}

const TIMEOUT = 20_000

async function call(url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> | null; network: boolean }> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    return { status: response.status, body, network: false }
  } catch {
    return { status: 0, body: null, network: true }
  }
}

/** "09121234567" / "+989121234567" → the provider's expected form. */
export function mobileFor(provider: InstallmentCredentials['provider'], phone: string): string {
  const digits = phone.replace(/[^\d]/g, '').replace(/^0098/, '').replace(/^98/, '').replace(/^0/, '')
  if (!/^9\d{9}$/.test(digits)) return ''
  return provider === 'SNAPPPAY' ? `+98${digits}` : `0${digits}`
}

const base = (credentials: InstallmentCredentials) => (credentials.baseUrl || DEFAULT_BASE[credentials.provider]).replace(/\/+$/, '')

// ------------------------------------------------------------------ OAuth (SnappPay, DigiPay)

const tokens = new Map<string, { token: string; until: number }>()

async function oauthToken(credentials: InstallmentCredentials): Promise<string | null> {
  const key = `${credentials.provider}:${base(credentials)}:${credentials.clientId}:${credentials.username}`
  const cached = tokens.get(key)
  if (cached && cached.until > Date.now()) return cached.token
  const path = credentials.provider === 'SNAPPPAY' ? '/api/online/v1/oauth/token' : '/digipay/api/oauth/token'
  const form = new URLSearchParams({ grant_type: 'password', username: credentials.username, password: credentials.password })
  if (credentials.provider === 'SNAPPPAY') form.set('scope', 'online-merchant')
  const result = await call(`${base(credentials)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  })
  const token = typeof result.body?.access_token === 'string' ? result.body.access_token : null
  if (token) tokens.set(key, { token, until: Date.now() + Math.max(60, Number(result.body?.expires_in) || 600) * 1000 - 30_000 })
  return token
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' })
const message = (body: Record<string, unknown> | null, fallback: string) => {
  const error = body?.errorData as Record<string, unknown> | undefined
  const result = body?.result as Record<string, unknown> | undefined
  return String(error?.message || body?.message || result?.message || body?.rsMessage || body?.error_description || fallback).slice(0, 300)
}

// ------------------------------------------------------------------ Azki signature

/** Azki: hex(AES-256-CBC(`${path}#${unix}#${METHOD}#${apiKey}`)), key = API key, zero IV. */
export function azkiSignature(path: string, method: string, apiKey: string, unix = Math.floor(Date.now() / 1000)): string {
  const key = /^[0-9a-f]{64}$/i.test(apiKey) ? Buffer.from(apiKey, 'hex') : createHash('sha256').update(apiKey).digest()
  const cipher = createCipheriv('aes-256-cbc', key, Buffer.alloc(16, 0))
  return Buffer.concat([cipher.update(`${path}#${unix}#${method.toUpperCase()}#${apiKey}`, 'utf8'), cipher.final()]).toString('hex')
}

async function azki(credentials: InstallmentCredentials, path: string, payload: Record<string, unknown>) {
  return call(`${base(credentials)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Signature: azkiSignature(path, 'POST', credentials.clientSecret), MerchantId: credentials.clientId },
    body: JSON.stringify(payload),
  })
}

// ------------------------------------------------------------------ create

export async function createInstallment(credentials: InstallmentCredentials, input: CreateInput): Promise<CreateResult> {
  const mobile = mobileFor(credentials.provider, input.mobile)
  if (!mobile) return { ok: false, message: 'برای خرید اقساطی یک شمارهٔ موبایل تأییدشده در حساب شما لازم است' }
  if (credentials.provider === 'AZKI') {
    const result = await azki(credentials, '/payment/purchase', {
      amount: Number(input.amountRial), redirect_uri: input.returnUrl, fallback_uri: `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}failed=1`,
      provider_id: input.reference, mobile_number: mobile, merchant_id: credentials.clientId,
      items: input.items.map((item) => ({ name: item.name.slice(0, 100), count: item.count, amount: Number(item.amountRial), url: '' })),
    })
    const payload = result.body?.result as Record<string, unknown> | undefined
    if (result.body?.rsCode === 0 && typeof payload?.ticket_id === 'string' && typeof payload.payment_uri === 'string') return { ok: true, token: payload.ticket_id, paymentUrl: payload.payment_uri }
    return { ok: false, message: result.network ? 'ارتباط با ازکی برقرار نشد' : message(result.body, 'ازکی درخواست را نپذیرفت'), ambiguous: result.network }
  }
  const token = await oauthToken(credentials)
  if (!token) return { ok: false, message: `ورود به ${credentials.provider === 'SNAPPPAY' ? 'اسنپ‌پی' : 'دیجی‌پی'} انجام نشد (شناسه، رمز یا نام کاربری پذیرنده را بررسی کنید)` }
  if (credentials.provider === 'SNAPPPAY') {
    const itemsTotal = input.items.reduce((sum, item) => sum + item.amountRial * BigInt(item.count), 0n)
    const result = await call(`${base(credentials)}/api/online/payment/v1/token`, {
      method: 'POST', headers: bearer(token),
      body: JSON.stringify({
        amount: Number(input.amountRial), discountAmount: Math.max(0, Number(itemsTotal + input.shippingRial - input.amountRial)), externalSourceAmount: 0,
        mobile, paymentMethodTypeDto: 'INSTALLMENT', returnURL: input.returnUrl, transactionId: input.reference,
        cartList: [{
          cartId: 1, isShipmentIncluded: input.shippingRial > 0n, isTaxIncluded: false, shippingAmount: Number(input.shippingRial), taxAmount: 0, totalAmount: Number(itemsTotal + input.shippingRial),
          cartItems: input.items.map((item) => ({ id: item.id, name: item.name.slice(0, 100), amount: Number(item.amountRial), count: item.count, category: item.category || 'general', commissionType: 100 })),
        }],
      }),
    })
    const response = result.body?.response as Record<string, unknown> | undefined
    if (result.body?.successful === true && typeof response?.paymentToken === 'string' && typeof response.paymentPageUrl === 'string') return { ok: true, token: response.paymentToken, paymentUrl: response.paymentPageUrl }
    return { ok: false, message: result.network ? 'ارتباط با اسنپ‌پی برقرار نشد' : message(result.body, 'اسنپ‌پی درخواست را نپذیرفت'), ambiguous: result.network }
  }
  // DigiPay credit (BNPL) ticket.
  const result = await call(`${base(credentials)}/digipay/api/tickets/business?type=11`, {
    method: 'POST', headers: bearer(token),
    body: JSON.stringify({
      amount: Number(input.amountRial), cellNumber: mobile, providerId: input.reference, callbackUrl: input.returnUrl,
      basketDetailsDto: { basketId: input.reference, items: input.items.map((item) => ({ productCode: item.id, productType: 1, count: item.count, categoryId: 0, brand: '', sellerId: '', supplierId: '', title: item.name.slice(0, 100), amount: Number(item.amountRial) })) },
    }),
  })
  const status = (result.body?.result as Record<string, unknown> | undefined)?.status
  if (status === 0 && typeof result.body?.ticket === 'string' && typeof result.body?.redirectUrl === 'string') return { ok: true, token: result.body.ticket, paymentUrl: result.body.redirectUrl }
  return { ok: false, message: result.network ? 'ارتباط با دیجی‌پی برقرار نشد' : message(result.body, 'دیجی‌پی درخواست را نپذیرفت'), ambiguous: result.network }
}

// ------------------------------------------------------------------ verify / settle / revert

/** The provider's reference that later calls need (SnappPay: payment token, DigiPay: tracking code, Azki: ticket). */
export type Reference = { token: string; reference: string; trackingCode?: string; type?: string }

export async function verifyInstallment(credentials: InstallmentCredentials, ref: Reference): Promise<StepResult> {
  if (credentials.provider === 'AZKI') {
    const result = await azki(credentials, '/payment/verify', { ticket_id: ref.token })
    // rsCode 0 = verified now; 25/28 = already verified (idempotent replies).
    const ok = result.body?.rsCode === 0 || result.body?.rsCode === 25 || result.body?.rsCode === 28
    return { ok, network: result.network, message: ok ? '' : message(result.body, 'تأیید پرداخت ازکی انجام نشد') }
  }
  const token = await oauthToken(credentials)
  if (!token) return { ok: false, network: true, message: 'ورود به سرویس اقساطی انجام نشد' }
  if (credentials.provider === 'SNAPPPAY') {
    const result = await call(`${base(credentials)}/api/online/payment/v1/verify`, { method: 'POST', headers: bearer(token), body: JSON.stringify({ paymentToken: ref.token }) })
    const response = result.body?.response as Record<string, unknown> | undefined
    const ok = result.body?.successful === true && (!response?.transactionId || String(response.transactionId) === ref.reference)
    return { ok, network: result.network, message: ok ? '' : message(result.body, 'تأیید پرداخت اسنپ‌پی انجام نشد') }
  }
  if (!ref.trackingCode) return { ok: false, message: 'کد پیگیری دیجی‌پی دریافت نشد' }
  const result = await call(`${base(credentials)}/digipay/api/purchases/verify?type=${encodeURIComponent(ref.type || '11')}`, { method: 'POST', headers: bearer(token), body: JSON.stringify({ trackingCode: ref.trackingCode, providerId: ref.reference }) })
  const status = (result.body?.result as Record<string, unknown> | undefined)?.status
  const ok = status === 0 && (!result.body?.providerId || String(result.body.providerId) === ref.reference)
  return { ok, network: result.network, message: ok ? '' : message(result.body, 'تأیید پرداخت دیجی‌پی انجام نشد'), detail: result.body || undefined }
}

/** Final confirmation after our order is recorded (SnappPay settle, DigiPay deliver; Azki needs none). */
export async function settleInstallment(credentials: InstallmentCredentials, ref: Reference, items: InstallmentItem[] = []): Promise<StepResult> {
  if (credentials.provider === 'AZKI') return { ok: true, message: '' }
  const token = await oauthToken(credentials)
  if (!token) return { ok: false, network: true, message: 'ورود به سرویس اقساطی انجام نشد' }
  if (credentials.provider === 'SNAPPPAY') {
    const result = await call(`${base(credentials)}/api/online/payment/v1/settle`, { method: 'POST', headers: bearer(token), body: JSON.stringify({ paymentToken: ref.token }) })
    return { ok: result.body?.successful === true, network: result.network, message: message(result.body, 'تسویهٔ اسنپ‌پی انجام نشد') }
  }
  const result = await call(`${base(credentials)}/digipay/api/purchases/deliver?type=${encodeURIComponent(ref.type || '11')}`, {
    method: 'POST', headers: bearer(token),
    body: JSON.stringify({ invoiceNumber: ref.reference, deliveryDate: Date.now(), trackingCode: ref.trackingCode, products: items.map((item) => item.name.slice(0, 100)) }),
  })
  const status = (result.body?.result as Record<string, unknown> | undefined)?.status
  return { ok: status === 0, network: result.network, message: message(result.body, 'ثبت تحویل دیجی‌پی انجام نشد') }
}

/** Cancels a verified payment we could not honour (the customer's credit is released). */
export async function revertInstallment(credentials: InstallmentCredentials, ref: Reference): Promise<StepResult> {
  if (credentials.provider === 'AZKI') {
    const result = await azki(credentials, '/payment/cancel', { ticket_id: ref.token })
    return { ok: result.body?.rsCode === 0, network: result.network, message: message(result.body, 'لغو ازکی انجام نشد') }
  }
  const token = await oauthToken(credentials)
  if (!token) return { ok: false, network: true, message: 'ورود به سرویس اقساطی انجام نشد' }
  if (credentials.provider === 'SNAPPPAY') {
    const result = await call(`${base(credentials)}/api/online/payment/v1/revert`, { method: 'POST', headers: bearer(token), body: JSON.stringify({ paymentToken: ref.token }) })
    return { ok: result.body?.successful === true, network: result.network, message: message(result.body, 'برگشت اسنپ‌پی انجام نشد') }
  }
  const result = await call(`${base(credentials)}/digipay/api/reverse?type=${encodeURIComponent(ref.type || '11')}`, { method: 'POST', headers: bearer(token), body: JSON.stringify({ trackingCode: ref.trackingCode, providerId: ref.reference }) })
  const status = (result.body?.result as Record<string, unknown> | undefined)?.status
  return { ok: status === 0, network: result.network, message: message(result.body, 'برگشت دیجی‌پی انجام نشد') }
}

/** Connection test: credentials accepted (OAuth) or, for Azki, a signed status call answered. */
export async function testInstallment(credentials: InstallmentCredentials): Promise<StepResult> {
  if (credentials.provider === 'AZKI') {
    if (!credentials.clientId || !credentials.clientSecret) return { ok: false, message: 'شناسهٔ پذیرنده و کلید API ازکی را وارد کنید' }
    const result = await azki(credentials, '/payment/status', { ticket_id: 'connection-test' })
    if (result.network) return { ok: false, network: true, message: 'ارتباط با ازکی برقرار نشد' }
    // An "unknown ticket" answer still proves the signature and merchant id were accepted.
    return result.status === 401 || result.status === 403 ? { ok: false, message: 'ازکی امضای درخواست یا شناسهٔ پذیرنده را نپذیرفت' } : { ok: true, message: 'اتصال به ازکی برقرار است' }
  }
  if (!credentials.clientId || !credentials.clientSecret || !credentials.username || !credentials.password) return { ok: false, message: 'Client ID، Client Secret، نام کاربری و رمز پذیرنده را کامل وارد کنید' }
  tokens.clear()
  return (await oauthToken(credentials)) ? { ok: true, message: 'ورود به سرویس اقساطی موفق بود' } : { ok: false, message: 'ورود انجام نشد؛ اطلاعات پذیرنده یا نشانی سرویس را بررسی کنید' }
}
