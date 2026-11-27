import { PayError, type PayPaymentStatus } from './pay'
import type { PayRoutingRule } from './pay-routing'

export const BOT_ACK_POLICIES = ['JSON_OK', 'JSON_SUCCESS', 'JSON_STATUS_TRUE', 'HTTP_2XX'] as const
export type BotAckPolicy = typeof BOT_ACK_POLICIES[number]
export type BotDeliveryStatus = 'WAITING' | 'QUEUED' | 'SENDING' | 'SENT' | 'UNKNOWN' | 'BLOCKED'
export interface PayBotIntegrationView {
  id: string; terminalId: string; active: boolean; version: number; callbackUrl: string
  ackPolicy: string; responseMode: string; keyPrefix: string; hasCallbackToken: boolean; routingRules: PayRoutingRule[]; routingVersion: number
}
export interface PayBotDeliveryView {
  id: string; paymentId: string; externalId: string; terminalName: string; status: BotDeliveryStatus
  attempts: number; version: number; lastCode: string; httpStatus: number | null; updatedAt: string
  paymentStatus: PayPaymentStatus
}
export interface BotPaymentInput {
  orderId: string; amountRial: string; userId: string; type: 'purchase' | 'renewal' | 'balance_increase'
  paymentCount?: number; membershipDays?: number
}
const own = (input: Record<string, unknown>, allowed: string[]) => Object.keys(input).every(key => allowed.includes(key))

function decimalInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  const number = typeof value === 'string' && /^(?:0|[1-9][0-9]{0,15}|-1)$/.test(value) ? Number(value) : value
  if (typeof number === 'number' && Number.isSafeInteger(number) && number >= minimum && number <= maximum) return number
}

function optionalInteger(value: unknown, minimum: number, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = decimalInteger(value, minimum)
  if (number === undefined) throw new PayError(`مقدار ${field} باید یک عدد صحیح معتبر باشد`)
  return number
}

/** Only merchant-authenticated claims, never bank evidence or a canonical human identity. */
export function parseBotPayment(input: Record<string, unknown>): BotPaymentInput {
  if (!own(input, ['api_key','amount','order_id','user_id','username','first_name','type','payment_count','register','membership_days','balance'])) throw new PayError('فیلد درخواست پرداخت پشتیبانی نمی‌شود')
  const amount = decimalInteger(input.amount, 1, 900_000_000_000_000)
  if (amount === undefined) throw new PayError('مبلغ باید عدد صحیح و معتبر به تومان باشد')
  if (typeof input.order_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(input.order_id)) throw new PayError('شناسهٔ سفارش معتبر نیست')
  const userId = decimalInteger(input.user_id, 1)
  if (userId === undefined) throw new PayError('شناسهٔ کاربر ربات معتبر نیست')
  const { type } = input
  if (type !== 'purchase' && type !== 'renewal' && type !== 'balance_increase') throw new PayError('نوع سفارش پشتیبانی نمی‌شود')
  const paymentCount = optionalInteger(input.payment_count, 0, 'payment_count')
  const membershipDays = optionalInteger(input.membership_days, -1, 'membership_days')
  optionalInteger(input.register, 0, 'register')
  optionalInteger(input.balance, 0, 'balance')
  if (input.username != null && (typeof input.username !== 'string' || !/^[A-Za-z0-9_]{0,64}$/.test(input.username))) throw new PayError('نام کاربری ربات معتبر نیست')
  if (input.first_name != null && (typeof input.first_name !== 'string' || input.first_name.length > 160 || /[\u0000-\u001f]/.test(input.first_name))) throw new PayError('نام سفارش معتبر نیست')
  // Do not retain names, usernames, balance or history supplied by the bot.
  return { orderId: input.order_id, amountRial: (BigInt(amount) * 10n).toString(), userId: String(userId), type, paymentCount, membershipDays }
}

export function botCallbackUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new PayError('نشانی API ربات معتبر نیست')
  let url: URL
  try { url = new URL(value) } catch { throw new PayError('نشانی API ربات معتبر نیست') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443') || url.pathname !== '/api/payment') throw new PayError('نشانی تأیید ربات باید HTTPS و مسیر /api/payment باشد')
  return url.toString()
}

/** Explicit operator-selected compatibility profile; not a claim about an unknown bot. */
export function botAcknowledged(policy: string, status: number, body: string): boolean {
  if (status < 200 || status >= 300) return false
  let value: unknown
  try { value = JSON.parse(body) } catch { return policy === 'HTTP_2XX' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return policy === 'HTTP_2XX'
  const data = value as Record<string, unknown>
  if (data.ok === false || data.success === false || data.status === false || data.status === 'error' || data.status === 'failed') return false
  if (policy === 'HTTP_2XX') return true
  return policy === 'JSON_OK' ? data.ok === true : policy === 'JSON_SUCCESS' ? data.status === 'success' : policy === 'JSON_STATUS_TRUE' ? data.status === true : false
}
