export type CheckoutSurface = 'public' | 'dashboard'

/** A closed presentation choice, never a caller-supplied redirect address. */
export function storedCheckoutSurface(raw: string | null | undefined): CheckoutSurface {
  try { return JSON.parse(raw || '{}')?.checkoutSurface === 'dashboard' ? 'dashboard' : 'public' } catch { return 'public' }
}

export function checkoutPath(path: string, surface: CheckoutSurface = 'public') {
  if (surface !== 'dashboard') return path
  if (path === '/payment/result' || path.startsWith('/payment/result?')) return path.replace('/payment/result', '/dashboard/payment/result')
  if (/^\/invoice\/[^/?#]+(?:\?[^#]*)?$/.test(path)) return path.replace('/invoice/', '/dashboard/invoices/')
  if (path === '/cart') return '/dashboard/cart'
  if (path === '/checkout/cart') return '/dashboard/checkout'
  return path
}

export function checkoutDestination(result: { paid: boolean; invoiceNumber: string; paymentUrl?: string; invoiceUrl?: string }, surface: CheckoutSurface = 'public') {
  return result.paid
    ? checkoutPath(`/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}`, surface)
    : result.paymentUrl || checkoutPath(result.invoiceUrl || '', surface)
}
