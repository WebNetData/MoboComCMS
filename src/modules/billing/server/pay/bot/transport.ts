import { botCallbackUrl } from '@/modules/billing/domain/pay-bot'
import { publicHttpsPost } from '../outbound'
export { publicBotAddress } from '../outbound'

/** The bot protocol remains restricted to its registered /api/payment callback. */
export async function sendBotVerification(destination: string, token: string, orderId: string) {
  const url = botCallbackUrl(destination)
  if (!token || token.length > 512 || /[\r\n\u0000]/.test(token)) throw new Error('BOT_TOKEN_INVALID')
  return publicHttpsPost(url, JSON.stringify({ order_id: orderId, actions: 'custom_payment_verify' }), { Token: token }, true)
}
