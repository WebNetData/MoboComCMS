import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { getSettings } from '@/modules/settings/server'
import { executeCheckout } from '@/modules/checkout/server/checkout'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' })
  const body = await req.json().catch(() => null)
  const idempotencyKey = String(req.headers.get('idempotency-key') || body?.idempotencyKey || '').trim()
  const settings = await getSettings()
  const siteUrl = (settings.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const result = await executeCheckout({
    userId: user.id,
    email: user.email,
    planId: Number(body?.planId) || null,
    offerId: Number(body?.offerId) || null,
    productId: Number(body?.productId) || null,
    variantId: Number(body?.variantId) || null,
    membershipPlanId: Number(body?.membershipPlanId) || null,
    shippingAddress: body?.shippingAddress && typeof body.shippingAddress === 'object' && !Array.isArray(body.shippingAddress) ? body.shippingAddress : undefined,
    username: typeof body?.username === 'string' ? body.username : undefined,
    payWith: body?.payWith === 'wallet' ? 'wallet' : body?.payWith === 'gateway' ? 'gateway' : undefined,
    gatewayRef: typeof body?.gatewayRef === 'string'
      ? body.gatewayRef.trim()
      : Number.isSafeInteger(Number(body?.gatewayId)) && Number(body?.gatewayId) > 0
        ? `db:${Number(body.gatewayId)}`
        : undefined,
    discountCode: typeof body?.discountCode === 'string' ? body.discountCode : undefined,
    idempotencyKey,
    siteUrl,
    channel: 'web',
  })
  if (!result.ok) return err(result.message, result.status, { code: result.code, ...(result.meta || {}) })
  return ok(result.data)
}
