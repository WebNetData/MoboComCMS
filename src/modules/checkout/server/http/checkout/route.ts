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
    hostingProductId: Number.isSafeInteger(Number(body?.hostingProductId)) && Number(body?.hostingProductId) > 0 ? Number(body.hostingProductId) : null,
    hostingCycle: typeof body?.hostingCycle === 'string' ? body.hostingCycle.slice(0, 10) : null,
    hostingName: typeof body?.hostingName === 'string' ? body.hostingName.slice(0, 260) : null,
    domainOrder: body?.domainOrder && typeof body.domainOrder === 'object' && typeof body.domainOrder.name === 'string'
      ? { name: body.domainOrder.name.slice(0, 260), years: Number(body.domainOrder.years) || 1, transfer: body.domainOrder.transfer === true, handle: typeof body.domainOrder.handle === 'string' ? body.domainOrder.handle.slice(0, 40) : '', authCode: typeof body.domainOrder.authCode === 'string' ? body.domainOrder.authCode.slice(0, 200) : '' }
      : null,
    domainRenew: body?.domainRenew && typeof body.domainRenew === 'object' && Number.isSafeInteger(Number(body.domainRenew.domainId)) && Number(body.domainRenew.domainId) > 0 ? { domainId: Number(body.domainRenew.domainId), years: Number(body.domainRenew.years) || 1 } : null,
    hostingAddon: body?.hostingAddon && typeof body.hostingAddon === 'object' && (body.hostingAddon.kind === 'TRAFFIC' || body.hostingAddon.kind === 'UPGRADE') && Number.isSafeInteger(Number(body.hostingAddon.serviceId)) && Number(body.hostingAddon.serviceId) > 0
      ? { serviceId: Number(body.hostingAddon.serviceId), kind: body.hostingAddon.kind, packs: Number(body.hostingAddon.packs) || undefined, productId: Number(body.hostingAddon.productId) || undefined }
      : null,
    hostingRenewServiceId: Number.isSafeInteger(Number(body?.hostingRenewServiceId)) && Number(body?.hostingRenewServiceId) > 0 ? Number(body.hostingRenewServiceId) : null,
    expectedQuote: body?.expectedQuote && typeof body.expectedQuote === 'object' ? { amountMinor: body.expectedQuote.amountMinor, currency: body.expectedQuote.currency } : null,
    addressId: Number.isSafeInteger(Number(body?.addressId)) && Number(body?.addressId) > 0 ? Number(body.addressId) : null,
    delivery: body?.delivery && typeof body.delivery === 'object' ? { date: String(body.delivery.date || '').slice(0, 10), slotId: String(body.delivery.slotId || '').slice(0, 20) } : null,
    carrierId: typeof body?.carrierId === 'string' ? body.carrierId.slice(0, 30) : null,
    shippingMode: body?.shippingMode === 'PICKUP' ? 'PICKUP' : 'SHIP',
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
    surface: body?.surface === 'dashboard' ? 'dashboard' : undefined,
  })
  if (!result.ok) return err(result.message, result.status, { code: result.code, ...(result.meta || {}) })
  return ok(result.data)
}
