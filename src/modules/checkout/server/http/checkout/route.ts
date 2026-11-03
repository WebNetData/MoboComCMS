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
    membershipTrial: body?.membershipTrial === true,
    membershipGift: body?.membershipGift && typeof body.membershipGift === 'object' ? { email: body.membershipGift.email, message: body.membershipGift.message } : null,
    membershipOffer: typeof body?.membershipOffer === 'string' ? body.membershipOffer.slice(0, 24) : null,
    formSubmissionId: Number(body?.formSubmissionId) || null,
    contentKey: typeof body?.contentKey === 'string' ? body.contentKey.slice(0, 40) : null,
    expectedQuote: body?.expectedQuote && typeof body.expectedQuote === 'object' ? { amountMinor: body.expectedQuote.amountMinor, currency: body.expectedQuote.currency } : null,
    addressId: Number.isSafeInteger(Number(body?.addressId)) && Number(body?.addressId) > 0 ? Number(body.addressId) : null,
    delivery: body?.delivery && typeof body.delivery === 'object' ? { date: String(body.delivery.date || '').slice(0, 10), slotId: String(body.delivery.slotId || '').slice(0, 20) } : null,
    carrierId: typeof body?.carrierId === 'string' ? body.carrierId.slice(0, 30) : null,
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
