export type CheckoutSurface = 'public' | 'dashboard' | 'cloud'

const CLOUD_KINDS = new Set(['hosting','hosting-renewal','hosting-addon','domain','domain-renewal'])
/** Exact owner discriminator; do not classify arbitrary JSON by substring. */
export function cloudOrderMeta(raw: string | null | undefined): Record<string, unknown> | null {
  try { const meta: unknown = JSON.parse(raw || '{}'); if(!meta || typeof meta !== 'object' || Array.isArray(meta))return null; const kind=(meta as Record<string,unknown>).kind; return typeof kind==='string' && CLOUD_KINDS.has(kind) ? meta as Record<string,unknown> : null } catch { return null }
}

/** A closed presentation choice, never a caller-supplied redirect address. */
export function storedCheckoutSurface(raw: string | null | undefined): CheckoutSurface {
  try { const meta = JSON.parse(raw || '{}'); return meta?.checkoutSurface === 'cloud' && cloudOrderMeta(raw) ? 'cloud' : meta?.checkoutSurface === 'dashboard' ? 'dashboard' : 'public' } catch { return 'public' }
}

export function checkoutPath(path: string, surface: CheckoutSurface = 'public') {
  if (surface === 'cloud') {
    if (path === '/payment/result' || path.startsWith('/payment/result?')) return path.replace('/payment/result','/cloud/dashboard/payment/result')
    if (/^\/invoice\/[^/?#]+(?:\?[^#]*)?$/.test(path)) return path.replace('/invoice/','/cloud/dashboard/invoices/')
    if (/^\/dashboard\/(?:services|domains)\/[1-9]\d*$/.test(path)) return path.replace('/dashboard/','/cloud/dashboard/')
    if (path === '/dashboard/invoices') return '/cloud/dashboard/invoices'
    if (path === '/dashboard/services') return '/cloud/dashboard/services'
    return path
  }
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
