import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_BASE_URL = 'https://frenzy.fastsnap.info'
const REQUEST_TIMEOUT_MS = 12_000

export interface FrenzyCreateInput {
  amountToman: bigint
  orderRef: string
  description?: string
}

export interface FrenzyCreateResult {
  ok: boolean
  message?: string
  requestId?: string
  status?: string
  checkoutUrl?: string
  payUrl?: string
  botPayUrl?: string
  expiresAt?: string
  ambiguous?: boolean
}

function baseUrl() {
  const raw = String(process.env.FRENZYEX_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('FRENZYEX_BASE_URL is invalid') }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local)) {
    throw new Error('FrenzyEx base URL must use HTTPS')
  }
  return url.toString().replace(/\/+$/, '')
}

async function fetchBounded(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store', redirect: 'error' })
  } finally {
    clearTimeout(timer)
  }
}

function compactError(status: number, body: unknown) {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    for (const key of ['detail', 'message', 'error']) {
      const value = obj[key]
      if (typeof value === 'string' && value.trim()) return `${status}: ${value.trim().slice(0, 300)}`
    }
  }
  return `FrenzyEx returned HTTP ${status}`
}

/**
 * Creates a v1 FrenzyEx request for the standard Iranian card-to-card rail.
 * The provider API intentionally has no idempotency-key header, so callers
 * must never retry this POST blindly after an ambiguous network failure.
 */
export async function createFrenzyPayment(apiKey: string, input: FrenzyCreateInput): Promise<FrenzyCreateResult> {
  if (!apiKey.trim()) return { ok: false, message: 'FrenzyEx API key is missing' }
  if (input.amountToman <= 0n) return { ok: false, message: 'payment amount must be greater than zero' }
  if (!input.orderRef.trim()) return { ok: false, message: 'order_ref is required' }
  if (input.amountToman > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, message: 'payment amount is too large' }

  let response: Response
  try {
    response = await fetchBounded(`${baseUrl()}/api/v1/payment-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        amount: Number(input.amountToman),
        amount_ccy: 'TMN',
        payment_method: 'standard',
        order_ref: input.orderRef.trim(),
        description: String(input.description || '').slice(0, 240),
      }),
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'request timed out' : 'network request failed'
    return { ok: false, ambiguous: true, message: `FrenzyEx ${reason}; do not retry blindly—check the merchant panel first` }
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) return { ok: false, message: compactError(response.status, body) }

  const requestId = String(body?.request_id || '').trim()
  const checkoutUrl = String(body?.checkout_url || '').trim()
  const payUrl = String(body?.pay_url || '').trim()
  const botPayUrl = String(body?.bot_pay_url || '').trim()
  if (!requestId) return { ok: false, ambiguous: true, message: 'FrenzyEx returned success without request_id; verify the merchant panel before retrying' }
  if (!checkoutUrl && !payUrl && !botPayUrl) return { ok: false, ambiguous: true, requestId, message: 'FrenzyEx created the request but returned no customer payment URL' }

  return {
    ok: true,
    requestId,
    status: String(body?.status || ''),
    checkoutUrl,
    payUrl,
    botPayUrl,
    expiresAt: String(body?.expires_at || ''),
  }
}

export interface FrenzyPaymentSnapshot {
  requestId: string
  status: string
  orderRef: string
  amount: string
  amountCcy: string
  expiresAt: string
  paidAt: string
  txHash: string
  payCurrency: string
  paymentMethod: string
  raw: Record<string, unknown>
}

export interface FrenzyStatusResult {
  ok: boolean
  statusCode?: number
  message?: string
  retryable?: boolean
  snapshot?: FrenzyPaymentSnapshot
}

function snapshotFromBody(body: Record<string, unknown> | null): FrenzyPaymentSnapshot | undefined {
  if (!body) return undefined
  const requestId = String(body.request_id || body.payment_id || body.purchase_id || '').trim()
  if (!requestId) return undefined
  return {
    requestId,
    status: String(body.status || '').trim().toLowerCase(),
    orderRef: String(body.order_ref || body.order_id || '').trim(),
    amount: String(body.amount ?? body.price_amount ?? '').trim(),
    amountCcy: String(body.amount_ccy || body.price_currency || '').trim().toUpperCase(),
    expiresAt: String(body.expires_at || '').trim(),
    paidAt: String(body.paid_at || '').trim(),
    txHash: String(body.tx_hash || '').trim(),
    payCurrency: String(body.pay_currency || body.asset || '').trim(),
    paymentMethod: String(body.payment_method || '').trim(),
    raw: body,
  }
}

/** Authenticated recovery lookup. Safe to retry; unlike create it cannot create another checkout. */
export async function getFrenzyPayment(apiKey: string, requestId: string): Promise<FrenzyStatusResult> {
  if (!apiKey.trim()) return { ok: false, message: 'FrenzyEx API key is missing' }
  const id = requestId.trim()
  if (!id || id.length > 256) return { ok: false, message: 'invalid FrenzyEx request_id' }
  try {
    const response = await fetchBounded(`${baseUrl()}/api/v1/payment-requests/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        retryable: response.status === 429 || response.status >= 500,
        message: compactError(response.status, body),
        snapshot: snapshotFromBody(body),
      }
    }
    const snapshot = snapshotFromBody(body)
    if (!snapshot) return { ok: false, statusCode: response.status, retryable: true, message: 'FrenzyEx status response has no request_id' }
    return { ok: true, statusCode: response.status, snapshot }
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError'
    return { ok: false, retryable: true, message: timeout ? 'FrenzyEx status request timed out' : 'FrenzyEx status request failed' }
  }
}

/** Cancel an unpaid request. A 409 is a state conflict and must be reconciled with GET. */
export async function cancelFrenzyPayment(apiKey: string, requestId: string): Promise<FrenzyStatusResult> {
  if (!apiKey.trim()) return { ok: false, message: 'FrenzyEx API key is missing' }
  const id = requestId.trim()
  if (!id || id.length > 256) return { ok: false, message: 'invalid FrenzyEx request_id' }
  try {
    const response = await fetchBounded(`${baseUrl()}/api/v1/payment-requests/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        retryable: response.status === 429 || response.status >= 500,
        message: compactError(response.status, body),
        snapshot: snapshotFromBody(body),
      }
    }
    // The guide does not require a specific cancel response body. A successful
    // 2xx is accepted and the reconciler will confirm the terminal state via GET.
    return { ok: true, statusCode: response.status, snapshot: snapshotFromBody(body) }
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError'
    return { ok: false, retryable: true, message: timeout ? 'FrenzyEx cancel request timed out' : 'FrenzyEx cancel request failed' }
  }
}

/**
 * Safe credential test: an authenticated lookup for a deliberately unknown
 * request id should return 404 with a valid key, while invalid keys return 401.
 * It never creates a payment request.
 */
export async function testFrenzyCredentials(apiKey: string) {
  if (!apiKey.trim()) return { ok: false, message: 'API key is missing' }
  try {
    const response = await fetchBounded(`${baseUrl()}/api/v1/payment-requests/__happvpn_connection_test__`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
    })
    if (response.status === 404) return { ok: true, detail: 'FrenzyEx reachable; bearer key accepted' }
    if (response.status === 401) return { ok: false, message: 'FrenzyEx rejected the API key' }
    if (response.status === 403) return { ok: false, message: 'FrenzyEx merchant account is inactive or forbidden' }
    if (response.ok) return { ok: true, detail: `FrenzyEx reachable (HTTP ${response.status})` }
    return { ok: false, message: `FrenzyEx connection test returned HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.name === 'AbortError' ? 'FrenzyEx connection test timed out' : 'FrenzyEx is unreachable' }
  }
}

export function verifyFrenzySignature(rawBody: Uint8Array, signature: string, secret: string) {
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(signature || '')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const received = Buffer.from(signature.toLowerCase(), 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}
