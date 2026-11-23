/** Server-side merchant example. Keep apiKey on your own backend, never in a button or web app. */
export function mobocomPayClient({ origin, apiKey, fetchImpl = fetch }) {
  const site = new URL(origin)
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new Error('An HTTPS MoboCom origin is required')
  if (!apiKey || /\s/.test(apiKey)) throw new Error('A private merchant API key is required')
  async function request(path, options = {}) {
    const response = await fetchImpl(new URL('/api/v1/pay/' + path, site.origin), {
      ...options, signal: AbortSignal.timeout(15000), redirect: 'error',
      headers: { Authorization: 'Bearer ' + apiKey, Origin: site.origin, ...options.headers },
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error('MoboComPay request failed: ' + response.status)
    return result.data
  }
  return {
    /** Persist this request/key before sending; retry an uncertain create with the same key and body. */
    async create({ terminalId, externalId, amountRial, idempotencyKey }) {
      if (typeof amountRial !== 'string' || !/^\d{1,19}$/.test(amountRial)) throw new Error('Exact IRR string required')
      const payment = await request('payments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ terminalId, externalId, amountRial }) })
      const checkout = new URL(payment.checkoutUrl, site.origin)
      if (checkout.origin !== site.origin || !/^\/pay\/[A-Za-z0-9_-]{32}$/.test(checkout.pathname) || checkout.search || checkout.hash) throw new Error('Invalid checkout response')
      return { ...payment, checkoutUrl: checkout.href }
    },
    /** Poll unfinished local orders with backoff. Dispatch delivery only after this authenticated check. */
    async verify(expected) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(expected.id)) throw new Error('Invalid stored payment ID')
      const payment = await request('payments/' + expected.id)
      for (const field of ['id', 'terminalId', 'externalId', 'amountRial', 'totalRial', 'netRial']) if (payment[field] !== expected[field]) throw new Error('Payment/order mismatch: ' + field)
      return { paid: payment.status === 'PAID', payment, deliveryKey: 'mobocom-pay:' + payment.id }
    },
  }
}

/** Pass the returned reply_markup to YOUR bot; this module never calls Telegram. */
export function paymentButton(checkoutUrl, { webApp = false } = {}) {
  const url = new URL(checkoutUrl)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS checkout URL required')
  return { inline_keyboard: [[{ text: 'پرداخت', ...(webApp ? { web_app: { url: url.href } } : { url: url.href }) }]] }
}
