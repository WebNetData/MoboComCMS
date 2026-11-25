import { PayError } from './pay'

export type PayWebhookStatus = 'PENDING' | 'SENDING' | 'RETRY' | 'DELIVERED' | 'FAILED' | 'PAUSED'
export interface PayWebhookEndpointView { id: string; terminalId: string; terminalName: string; url: string; active: boolean; version: number; hasSecret: boolean; updatedAt: string }
export interface PayWebhookAttemptView { id: string; number: number; configVersion: number; url: string; status: string; code: string; httpStatus: number | null; startedAt: string; finishedAt: string | null }
export interface PayWebhookDeliveryView { id: string; paymentId: string; terminalId: string; externalId: string; terminalName: string; status: PayWebhookStatus; attempts: number; version: number; configVersion: number; url: string; lastCode: string; httpStatus: number | null; nextAttemptAt: string; deliveredAt: string | null; createdAt: string; history: PayWebhookAttemptView[] }
export interface PayWebhookOverview { endpoints: PayWebhookEndpointView[]; deliveryEndpoints: PayWebhookEndpointView[]; endpointPage: number; endpointPages: number; deliveries: PayWebhookDeliveryView[]; page: number; pages: number; total: number; counts: { pending: number; delivered: number; attention: number } }
export interface PayWebhookEvent { id: string; type: 'payment.paid'; version: 1; created_at: string; data: { payment_id: string; terminal_id: string; external_id: string; status: 'PAID'; order_amount_rial: string; invoice_total_rial: string; contract_fee_rial: string; merchant_credit_currency: 'IRR' | 'USDT'; merchant_credit_amount: string } }

/** Outbound address, not a customer return URL. Transport also validates and pins DNS. */
export function webhookUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new PayError('نشانی وبهوک معتبر نیست')
  let url: URL
  try { url = new URL(value) } catch { throw new PayError('نشانی وبهوک معتبر نیست') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port && url.port !== '443' || !url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname === 'localhost' || /^[\d.:\[\]]+$/.test(url.hostname)) throw new PayError('وبهوک باید نشانی عمومی HTTPS بدون توکن در URL باشد')
  return url.toString()
}

export const WEBHOOK_MAX_ATTEMPTS = 8
export const webhookRetryMs = (attempt: number) => Math.min(180, 2 ** Math.max(0, attempt - 1)) * 60000
