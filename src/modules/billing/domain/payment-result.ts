/** Read-only presentation of persisted payment states; never settles an invoice. */
export function paymentResultState(invoiceStatus: string, orderStatus?: string | null, callbackFailed = false) {
  if (invoiceStatus === 'REFUNDED' || orderStatus === 'REFUNDED') return 'refunded'
  if (invoiceStatus === 'PAID') return 'paid'
  if (invoiceStatus === 'VOID' || orderStatus === 'FAILED' || callbackFailed) return 'failed'
  return 'pending'
}

/** The lookup and login continuation use exactly the same bounded local locator. */
export function paymentResultTarget(input: { invoice?: unknown; order?: unknown }) {
  const invoiceNumber = typeof input.invoice === 'string' && input.invoice.length <= 255 ? input.invoice : ''
  const number = typeof input.order === 'string' || typeof input.order === 'number' ? Number(input.order) : 0
  const orderId = Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : 0
  const query = invoiceNumber ? `invoice=${encodeURIComponent(invoiceNumber)}` : orderId ? `order=${orderId}` : ''
  return { invoiceNumber, orderId, href: '/payment/result' + (query ? `?${query}` : '') }
}
