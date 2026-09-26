// Plisio crypto payment gateway integration
// Docs: https://plisio.net/documentation/endpoints/create-an-invoice
import crypto from 'crypto'

export interface PlisioInvoiceResult {
  ok: boolean
  message?: string
  txnId?: string
  invoiceUrl?: string
  invoiceTotalSum?: string
}

export interface PlisioCallbackData {
  txn_id: string
  status: string // new | pending | completed | expired | cancelled | error ...
  order_number: string
  amount?: string
  currency?: string
  source_currency?: string
  source_amount?: string
  confirmations?: string
  verify_hash: string
  [key: string]: unknown
}

const PLISIO_API = 'https://api.plisio.net/api/v1'

export function plisioConfigured() {
  return Boolean(process.env.PLISIO_API_KEY)
}

export interface PlisioCreds {
  apiKey: string
  fiat?: string
  currencies?: string
}

/** Lightweight connection test: lists supported cryptocurrencies for the account. */
export async function plisioCurrencies(
  apiKey: string,
  fiat = 'USD'
): Promise<{ ok: boolean; message?: string; detail?: string }> {
  if (!apiKey) return { ok: false, message: 'API key is missing' }
  try {
    const res = await fetch(`${PLISIO_API}/currencies/${encodeURIComponent(fiat)}?api_key=${encodeURIComponent(apiKey)}`, {
      cache: 'no-store',
    })
    const data = await res.json().catch(() => null)
    if (data?.status !== 'success') {
      return { ok: false, message: data?.data?.message || data?.message || `HTTP ${res.status}` }
    }
    const list = data?.data ? Object.keys(data.data) : []
    return { ok: true, detail: `${list.length} currencies available` }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'plisio request failed' }
  }
}

export interface CreateInvoiceInput {
  orderNumber: string // unique per order
  sourceAmount: number
  sourceCurrency: string
  email?: string
  orderName?: string
  callbackUrl: string
  successUrl: string
  failUrl: string
}

export async function createInvoice(
  input: CreateInvoiceInput,
  creds?: PlisioCreds
): Promise<PlisioInvoiceResult> {
  const apiKey = creds?.apiKey || process.env.PLISIO_API_KEY
  if (!apiKey) return { ok: false, message: 'PLISIO_API_KEY is not configured' }

  const params = new URLSearchParams()
  const sourceCurrency = String(input.sourceCurrency || creds?.fiat || process.env.PLISIO_FIAT_CURRENCY || 'USD').toUpperCase()
  params.set('source_currency', sourceCurrency)
  params.set('source_amount', String(input.sourceAmount))
  params.set('order_number', input.orderNumber)
  params.set('order_name', input.orderName || 'MoboComCMS subscription')
  params.set('callback_url', input.callbackUrl)
  params.set('success_invoice_url', input.successUrl)
  params.set('fail_invoice_url', input.failUrl)
  if (input.email) params.set('email', input.email)
  const currencies = (creds?.currencies ?? process.env.PLISIO_CURRENCIES ?? '').trim()
  if (currencies) params.set('allowed_psys_cids', currencies)
  params.set('api_key', apiKey)

  try {
    const res = await fetch(`${PLISIO_API}/invoices/new?${params.toString()}`, {
      cache: 'no-store',
    })
    const data = await res.json().catch(() => null)
    if (data?.status !== 'success' || !data?.data?.txn_id) {
      return { ok: false, message: data?.data?.message || data?.message || `HTTP ${res.status}` }
    }
    return {
      ok: true,
      txnId: data.data.txn_id,
      invoiceUrl: data.data.invoice_url,
      invoiceTotalSum: data.data.invoice_total_sum,
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'plisio request failed' }
  }
}

// ============ Callback signature verification ============
// Per Plisio docs: ksort by key, special-case expire_utc & tx_urls, JSON.stringify, HMAC-SHA1 with SECRET_KEY
export function verifyCallback(data: PlisioCallbackData, secretKey: string): boolean {
  if (!data || !data.verify_hash || !secretKey) return false
  const ordered: Record<string, unknown> = { ...data }
  delete ordered.verify_hash
  const keys = Object.keys(ordered).sort()
  const sorted: Record<string, unknown> = {}
  for (const k of keys) sorted[k] = ordered[k]
  if ('expire_utc' in sorted) sorted.expire_utc = String(sorted.expire_utc)
  if ('tx_urls' in sorted) {
    try {
      sorted.tx_urls = JSON.parse(String(sorted.tx_urls))
    } catch {
      // leave as-is
    }
  }
  const str = JSON.stringify(sorted)
  const hash = crypto.createHmac('sha1', secretKey).update(str).digest('hex')
  const expected = Buffer.from(hash, 'utf8')
  const provided = Buffer.from(String(data.verify_hash), 'utf8')
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
}

export function mapPlisioStatus(status: string): 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' {
  switch (status) {
    case 'completed':
      return 'PAID'
    case 'error':
      return 'FAILED'
    case 'expired':
      return 'EXPIRED'
    case 'cancelled':
    case 'cancelled duplicate':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}
