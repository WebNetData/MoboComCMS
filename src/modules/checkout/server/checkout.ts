import { validateGiftOrder } from '@/modules/store/domain/gift-order'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { assertStoreAcceptsOrders } from '@/modules/store/server/order-acceptance'
import { db } from '@/platform/database/prisma'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { isPublishedProduct } from '@/modules/catalog/domain/product-publication'
import { createGatewayInvoice, customerGatewayLabel, gatewayAcceptsCheckoutCurrency, gatewayCallbackUrl, isInstallmentGateway, resolveCheckoutGateway } from '@/modules/billing/server/gateways'
import { createInvoiceForOrder, markInvoicePaid, recordProviderEvent, releaseInvoiceCredit } from '@/modules/billing/server/billing'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'
import { checkUsername, sanitizeUsername, suggestUsername, USERNAME_MIN } from '@/modules/subscriptions/server/usernames'
import { enqueueFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { releaseInventoryReservation, reserveInventory } from '@/modules/catalog/server/inventory'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor, BASE_CURRENCY } from '@/shared/money'
import { emitExtensionEvent } from '@/extensions/server/runtime'
import { promotionCode, promotionDiscount, releasePromotionForOrder } from '@/modules/promotions/server/promotions'
import { isMember, opensMembersOnly } from '@/modules/membership/server/membership'
import { memberPrice } from '@/modules/membership/domain/membership'
import { isModuleEnabled } from '@/extensions/server/modules'
import { addressSnapshot, bookDelivery, getDeliverySettings, validateDelivery } from '@/modules/shipping/server/shipping'
import { checkoutCarrier } from '@/modules/shipping/server/carriers'
import { ShippingError, shippingFeeMinor } from '@/modules/shipping/domain/shipping'
import { MAX_CART_LINES, MAX_LINE_QUANTITY, lineLimit } from '@/modules/store/domain/store'
import { unitPrice } from '@/modules/store/server/pricing'
import { answersComplete, readOrderFields } from '@/modules/store/domain/order-inputs'
import { openAmountPrice, openAnswers } from '@/modules/store/server/order-inputs'
import { StoreError } from '@/modules/store/domain/store'
import { attachFormOrder, formCheckoutQuote } from '@/modules/forms/server/paid'
import { FormsError } from '@/modules/forms/domain/forms'
import { stampFxInvoice } from '@/modules/billing/server/invoice-rules'
import { quoteContent } from '@/modules/paywall/server/paywall'
import { PaywallError, parseContentKey } from '@/modules/paywall/domain/paywall'
import { userOpensAudience } from '@/modules/account/server/item-audience'
import { userOpensSection } from '@/modules/account/server/section-access'
import { groupDeal } from '@/modules/account/server/user-groups'
import { MembershipError } from '@/modules/membership/domain/plans'
import { membershipQuote, planWithTier } from '@/modules/membership/server/quote'
import { tierStanding } from '@/modules/membership/server/tiers'
import { ruleRefusal } from '@/modules/membership/server/rules'
import { HostingError } from '@/modules/hosting/domain/catalog'
import { HostingRefusal, hostingQuote } from '@/modules/hosting/server/services'
import { hostingRenewalQuote } from '@/modules/hosting/server/renewal'
import { hostingAddonQuote, type AddonRequest } from '@/modules/hosting/server/addons'
import { domainOrderQuote, domainRenewQuote, type DomainOrderRequest } from '@/modules/hosting/server/domains'

export interface CheckoutCommand {
  userId: number
  email?: string | null
  planId?: number | null
  offerId?: number | null
  productId?: number | null
  variantId?: number | null
  /** Several store products at once (the shopping cart); replaces productId/variantId. */
  /** A cart line also carries what its buyer gave: the sealed answers and a typed foreign amount. */
  lines?: { productId: number; variantId?: number | null; quantity?: number; inputs?: string | null; openAmountMinor?: bigint | null; openCurrency?: string | null }[] | null
  /** VIP membership plan purchase, as its trial, or at a price the buyer offers on a pay-what-you-want plan. */
  membershipPlanId?: number | null
  membershipTrial?: boolean
  membershipOffer?: string | null
  /** Bought for someone else: the order becomes a code. */
  membershipGift?: { email?: unknown; message?: unknown } | null
  /** A form answer that waits for its payment (the sender's own, unpaid). */
  formSubmissionId?: number | null
  /** Paid content ("post:12", "software:3"): lifetime access to one article or download. */
  contentKey?: string | null
  /** A hosting product, server or cloud size for one billing cycle, with the customer's domain or hostname. */
  hostingProductId?: number | null
  hostingCycle?: string | null
  hostingName?: string | null
  /** One more term of the customer's own fixed-term hosting service, at its fixed price. */
  hostingRenewServiceId?: number | null
  /** Extra traffic packs or an upgrade to a dearer plan on the customer's own service. */
  hostingAddon?: AddonRequest | null
  /** A domain registration or transfer in, and a renewal of the customer's own domain. */
  domainOrder?: DomainOrderRequest | null
  domainRenew?: { domainId: number; years: unknown } | null
  /** Optional displayed-price claim; server still computes the authoritative amount. */
  expectedQuote?: { amountMinor: unknown; currency: unknown } | null
  /** Saved address from the customer's address book (physical products). */
  addressId?: number | null
  /** Chosen delivery day (YYYY-MM-DD, Tehran) and time window. */
  delivery?: { date?: string; slotId?: string } | null
  /** Chosen shipping carrier (when carriers are enabled); the cheapest available one otherwise. */
  carrierId?: string | null
  gift?: unknown
  shippingMode?: 'SHIP' | 'PICKUP'
  /** Legacy inline address; still accepted from API clients. */
  shippingAddress?: { recipient?: string; phone?: string; country?: string; city?: string; postalCode?: string; address?: string }
  username?: string
  payWith?: 'wallet' | 'gateway'
  gatewayRef?: string
  discountCode?: string
  idempotencyKey: string
  siteUrl: string
  channel?: 'web' | 'telegram'
  surface?: 'dashboard'
}

export type CheckoutFailure = { ok: false; status: number; code: string; message: string; meta?: Record<string, unknown> }
export type CheckoutSuccess = { ok: true; data: Record<string, unknown> }
export type CheckoutOutcome = CheckoutFailure | CheckoutSuccess

function fail(status: number, code: string, message: string, meta?: Record<string, unknown>): CheckoutFailure {
  return { ok: false, status, code, message, meta }
}

function validKey(key: string) {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(key)
}

async function replayOrder(userId: number, idempotencyKey: string): Promise<CheckoutOutcome | null> {
  const order = await db.order.findUnique({ where: { idempotencyKey }, include: { invoice: true, subscriptions: { take: 1 } } })
  if (!order) return null
  if (order.userId !== userId) return fail(409, 'IDEMPOTENCY_CONFLICT', 'idempotency key belongs to another request')
  const invoice = order.invoice
  const subscription = order.subscriptions[0]
  return {
    ok: true,
    data: {
      replayed: true,
      paid: order.status === 'PAID',
      orderId: order.id,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.number || '',
      invoiceUrl: invoice ? `/invoice/${invoice.number}` : '',
      paymentUrl: order.paymentUrl || (invoice ? `/invoice/${invoice.number}` : ''),
      subscriptionId: subscription?.id ?? null,
      username: subscription?.username === 'pending' ? '' : subscription?.username || '',
      walletApplied: invoice ? minorToNumber(invoice.walletAppliedMinor, invoice.currency) : 0,
      amountDue: invoice ? minorToNumber(invoice.totalMinor - invoice.walletAppliedMinor, invoice.currency) : 0,
      currency: order.currency,
      fulfillmentPending: order.status === 'PAID' && Boolean(order.planId) && !subscription,
    },
  }
}

export async function executeCheckout(command: CheckoutCommand): Promise<CheckoutOutcome> {
  if (!validKey(command.idempotencyKey)) return fail(400, 'IDEMPOTENCY_REQUIRED', 'a valid Idempotency-Key is required')
  const replay = await replayOrder(command.userId, command.idempotencyKey)
  if (replay) return replay

  const offerId = Number(command.offerId) || null
  const offer = offerId ? await db.serviceOffer.findUnique({ where: { id: offerId } }) : null
  if (offerId && (!offer?.active || offer.ownerKey !== 'SITE')) return fail(404, 'OFFER_NOT_FOUND', 'service offer not found')
  if (offerId && command.planId) return fail(400, 'BAD_ITEM', 'choose a plan or an offer')
  const planId = offer?.planId || Number(command.planId) || null
  const cartLines = Array.isArray(command.lines) && command.lines.length ? command.lines : null
  if (cartLines && command.productId) return fail(400, 'BAD_ITEM', 'choose a product or cart lines, not both')
  if (cartLines && cartLines.length > MAX_CART_LINES) return fail(400, 'BAD_ITEM', 'too many cart lines')
  const productId = Number(cartLines ? cartLines[0]?.productId : command.productId) || null
  const membershipPlanId = Number(command.membershipPlanId) || null
  const content = command.contentKey ? parseContentKey(command.contentKey) : null
  if (command.contentKey && !content) return fail(400, 'BAD_ITEM', 'invalid content key')
  if (productId && !await isStoreEnabled()) return fail(403, 'STORE_DISABLED', 'فروشگاه در حال حاضر غیرفعال است')
  if (productId) {
    try { await assertStoreAcceptsOrders() } catch (error) { if (error instanceof StoreError) return fail(error.status, error.code, error.message); throw error }
  }
  const formSubmissionId = Number(command.formSubmissionId) || null
  const hostingProductId = Number(command.hostingProductId) || null
  const hostingRenewServiceId = Number(command.hostingRenewServiceId) || null
  const hostingAddon = command.hostingAddon && Number(command.hostingAddon.serviceId) > 0 ? command.hostingAddon : null
  const domainOrder = command.domainOrder && command.domainOrder.name ? command.domainOrder : null
  const domainRenew = command.domainRenew && Number(command.domainRenew.domainId) > 0 ? command.domainRenew : null
  if ([planId, productId, membershipPlanId, content, formSubmissionId, hostingProductId, hostingRenewServiceId, hostingAddon, domainOrder, domainRenew].filter(Boolean).length !== 1) return fail(400, 'BAD_ITEM', 'exactly one purchasable item is required')
  if (planId && !await isModuleEnabled('vpn')) return fail(403, 'VPN_DISABLED', 'فروش این سرویس در حال حاضر فعال نیست')
  if (planId && !await userOpensSection('vpn', command.userId)) return fail(403, 'VPN_FORBIDDEN', 'این بخش برای اعضای ویژه یا گروه‌های انتخاب‌شده باز است')
  if ((hostingProductId || hostingRenewServiceId || hostingAddon || domainOrder || domainRenew) && !await isModuleEnabled('hosting')) return fail(403, 'HOSTING_DISABLED', 'فروش میزبانی و سرور در حال حاضر فعال نیست')
  if (membershipPlanId && !await isModuleEnabled('membership')) return fail(403, 'MEMBERSHIP_DISABLED', 'اشتراک ویژه در حال حاضر فعال نیست')
  // VIP status decides member-only items, member prices and member-only codes.
  const member = await isMember(command.userId)
  // Members-only plans and products are open to everybody while the VIP module is off; member prices are not.
  const opens = await opensMembersOnly(command.userId, member)
  let memberDiscount = false

  let amountMinor = 0n
  let amount = 0
  let currency: string = BASE_CURRENCY
  let label = ''
  let meta: Record<string, unknown> = {}
  let shippingMinor = 0n
  let delivery: { date: string; slot: { id: string; label: string } } | null = null
  let carrier: Awaited<ReturnType<typeof checkoutCarrier>> = null
  // Foreign currencies the price followed: a typed foreign amount, a product priced by the rate, a form's foreign amount.
  const fxCodes: string[] = []
  const orderLines: { line: number; productId: number; variantId: number | null; name: string; variantName: string; sku: string; image: string; kind: string; quantity: number; unitPriceMinor: bigint; listPriceMinor: bigint; totalMinor: bigint; currency: string; sellerId: number | null; inputs: string; openAmountMinor: bigint; openCurrency: string; openRate: string; unitCostMinor?: bigint | null }[] = []

  if (formSubmissionId) {
    try {
      const quote = await formCheckoutQuote(formSubmissionId, command.userId)
      currency = normalizeCurrency(quote.currency)
      amountMinor = quote.amountMinor
      amount = legacyNumber(amountMinor, currency)
      label = quote.title
      fxCodes.push(...quote.fxCurrencies)
      meta = { kind: 'form', formId: quote.formId, submissionId: quote.submissionId, formTitle: quote.title, invoiceTitle: quote.invoiceTitle, invoiceText: quote.invoiceText, contentPath: '/dashboard/requests' }
    } catch (error) {
      if (error instanceof FormsError) return fail(error.status, 'FORM_REQUEST', error.message)
      throw error
    }
  } else if (content) {
    try {
      const quote = await quoteContent(content, { userId: command.userId, member })
      currency = normalizeCurrency(quote.currency)
      amountMinor = quote.amountMinor
      amount = legacyNumber(amountMinor, currency)
      label = quote.label
      memberDiscount = quote.memberPrice
      meta = { kind: 'content', ownerType: quote.ownerType, ownerId: quote.ownerId, contentTitle: quote.label, contentPath: quote.path }
    } catch (error) {
      if (error instanceof PaywallError) return fail(error.status, error.code, error.message, error.code === 'ALREADY_OPEN' ? { contentPath: '' } : undefined)
      throw error
    }
  } else if (hostingProductId || hostingRenewServiceId || hostingAddon || domainOrder || domainRenew) {
    try {
      const quote = domainOrder ? await domainOrderQuote(domainOrder) : domainRenew ? await domainRenewQuote(command.userId, Number(domainRenew.domainId), domainRenew.years) : hostingAddon ? await hostingAddonQuote(command.userId, hostingAddon) : hostingRenewServiceId ? await hostingRenewalQuote(hostingRenewServiceId, command.userId) : await hostingQuote({ productId: hostingProductId!, cycle: String(command.hostingCycle || ''), hostname: command.hostingName })
      currency = normalizeCurrency(quote.currency)
      amountMinor = quote.amountMinor
      amount = legacyNumber(amountMinor, currency)
      label = quote.label
      meta = quote.meta
    } catch (error) {
      if (error instanceof HostingRefusal) return fail(error.status, error.code, error.message)
      if (error instanceof HostingError) return fail(400, 'HOSTING', error.message)
      throw error
    }
  } else if (membershipPlanId) {
    const vip = await planWithTier(membershipPlanId)
    if (!vip || !vip.active) return fail(404, 'MEMBERSHIP_PLAN_NOT_FOUND', 'پلن اشتراک ویژه یافت نشد')
    try {
      const quote = await membershipQuote(vip, command.userId, { trial: command.membershipTrial, offered: command.membershipOffer, gift: command.membershipGift })
      if (quote.amountMinor <= 0n) return fail(400, 'MEMBERSHIP_FREE_TRIAL', 'این دوره رایگان است و پرداختی ندارد')
      currency = quote.currency
      amountMinor = quote.amountMinor
      meta = quote.meta
    } catch (error) {
      if (error instanceof MembershipError) return fail(error.status, error.code, error.message)
      throw error
    }
    amount = legacyNumber(amountMinor, currency)
    label = `VIP · ${vip.nameEn || vip.name}`
  } else if (planId) {
    const plan = await db.plan.findUnique({ where: { id: planId }, include: { panel: true } })
    if (!plan || !plan.active) return fail(404, 'PLAN_NOT_FOUND', 'پلن یافت نشد')
    if (!plan.panel || !plan.panel.active) return fail(503, 'PANEL_INACTIVE', 'پنل این پلن فعال نیست')
    if (plan.access === 'MEMBERS' && !opens) return fail(403, 'MEMBERS_ONLY', 'این پلن مخصوص اعضای ویژه است', { upgradeUrl: '/vip' })
    currency = normalizeCurrency(plan.currency)
    amountMinor = offer ? offer.priceMinor : plan.priceMinor || toMinor(plan.price, currency)
    if (!offer) {
      const priced = memberPrice(amountMinor, plan.memberPriceMinor, member)
      amountMinor = priced.amountMinor
      memberDiscount = priced.memberDiscount
    }
    if (offer && normalizeCurrency(offer.currency) !== currency) return fail(409, 'OFFER_CURRENCY', 'offer currency no longer matches the plan')
    amount = legacyNumber(amountMinor, currency)
    label = offer ? offer.nameEn || offer.nameFa : plan.name
    meta = offer ? { kind: 'offer', offerId: offer.id, planId: plan.id, planName: plan.name, trafficGB: offer.trafficGB, days: offer.days, deviceLimit: offer.deviceLimit } : { kind: 'plan', planId: plan.id, planName: plan.name }
  } else {
    const requested: NonNullable<CheckoutCommand['lines']> = cartLines || [{ productId: productId!, variantId: Number(command.variantId) || null, quantity: 1 }]
    const many = requested.length > 1
    const seen = new Set<string>()
    for (const [index, want] of requested.entries()) {
      const quantity = Math.floor(Number(want.quantity ?? 1))
      const product = await db.product.findUnique({ where: { id: Number(want.productId) || 0 }, include: { variants: { where: { active: true } } } })
      if (!product || !isPublishedProduct(product) || !await userOpensAudience(product.audienceGroups, 'product', command.userId) || !await userOpensSection('store', command.userId)) return fail(404, 'PRODUCT_NOT_FOUND', 'محصول یافت نشد')
      if (await ruleRefusal(command.userId, [{ ownerType: 'product', ownerId: product.id }])) return fail(403, 'MEMBERS_ONLY', 'این محصول برای سطح اشتراک شما باز نیست', { upgradeUrl: '/vip' })
      const named = (message: string) => (many && product ? `${product.name}: ${message}` : message)
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return fail(400, 'BAD_QUANTITY', named('تعداد معتبر نیست'))
      if (product.access === 'MEMBERS' && !opens) return fail(403, 'MEMBERS_ONLY', named('این محصول مخصوص اعضای ویژه است'), { upgradeUrl: '/vip' })
      if (product.digitalMode === 'FILES' && !await db.productFile.count({ where: { productId: product.id, active: true } })) return fail(409, 'FILES_UNAVAILABLE', named('فایل فعالی برای این محصول ثبت نشده است'))
      if (product.stock === 0) return fail(409, 'OUT_OF_STOCK', named('این محصول ناموجود است'))
      const variantId = Number(want.variantId) || null
      if (product.variants.length && !variantId) return fail(400, 'VARIANT_REQUIRED', named('لطفاً نوع محصول را انتخاب کنید'))
      const variant = variantId ? product.variants.find((row) => row.id === variantId) || null : null
      if (variantId && !variant) return fail(404, 'VARIANT_NOT_FOUND', named('نوع انتخاب‌شده موجود نیست'))
      if (variant?.stock === 0) return fail(409, 'OUT_OF_STOCK', named('نوع انتخاب‌شده ناموجود است'))
      const key = `${product.id}:${variant?.id || 0}`
      if (seen.has(key)) return fail(400, 'BAD_ITEM', 'duplicate cart line')
      seen.add(key)
      const limit = lineLimit(product.stock, variant ? variant.stock : null, product.maxPerOrder)
      if (quantity > limit) return fail(409, 'QUANTITY_LIMIT', named(`حداکثر ${limit.toLocaleString('fa-IR')} عدد از این کالا قابل سفارش است`), { productId: product.id, limit })
      // What the order needs from its buyer travels on the cart line; a purchase that skips the cart has none.
      const sealed = String(want.inputs || '')
      if (!answersComplete(readOrderFields(product.orderFields), variant?.name || '', openAnswers(sealed))) return fail(409, 'INPUT_REQUIRED', named('اطلاعات لازم این سفارش وارد نشده است؛ از صفحهٔ محصول آن را به سبد اضافه کنید'), { productId: product.id })
      let price = unitPrice(product, variant, member, undefined, await groupDeal(command.userId, [product.id]))
      let openRate = ''
      const openAmountMinor = product.openAmount ? BigInt(want.openAmountMinor ?? 0n) : 0n
      const openCurrency = product.openAmount ? String(want.openCurrency || '') : ''
      if (product.openAmount) {
        // The buyer typed the foreign amount: it is priced again here, with the rate of this moment.
        if (quantity !== 1) return fail(400, 'BAD_QUANTITY', named('این خدمت در هر سفارش یک بار ثبت می‌شود'))
        try {
          const quote = await openAmountPrice(product, openAmountMinor, openCurrency)
          price = { ...price, unitMinor: quote.priceMinor, regularMinor: quote.priceMinor, listMinor: 0n, memberDiscount: false }
          openRate = String(quote.rate)
        } catch (error) {
          if (error instanceof StoreError) return fail(error.status, error.code || 'OPEN_AMOUNT', named(error.message), { productId: product.id })
          throw error
        }
      }
      if (product.openAmount && openCurrency) fxCodes.push(openCurrency)
      if (product.pricingMode === 'FX' && product.fxCurrency) fxCodes.push(product.fxCurrency)
      if (index === 0) currency = price.currency
      else if (price.currency !== currency) return fail(409, 'MIXED_CURRENCY', 'کالاهای یک سفارش باید واحد پول یکسان داشته باشند')
      memberDiscount ||= price.memberDiscount
      amountMinor += price.unitMinor * BigInt(quantity)
      orderLines.push({
        line: index, productId: product.id, variantId: variant?.id ?? null, name: product.name, variantName: variant?.name || '', sku: variant?.sku || product.sku,
        image: product.image, kind: product.kind, quantity, unitPriceMinor: price.unitMinor, listPriceMinor: price.listMinor, totalMinor: price.unitMinor * BigInt(quantity), currency: price.currency,
        sellerId: product.sellerId ?? null, inputs: sealed, openAmountMinor, openCurrency, openRate, unitCostMinor: variant?.costMinor ?? product.costMinor,
      })
      if (index === 0) meta = { kind: 'product', productId: product.id, productName: product.name, variantId: variant?.id || null, variantName: variant?.name || '', variantSku: variant?.sku || '', variantAttributes: variant?.attributes || '{}' }
      if (product.isService && product.kind === 'VIRTUAL') {
        const ids = Array.isArray(meta.serviceProductIds) ? meta.serviceProductIds as number[] : []
        meta = { ...meta, serviceProductIds: [...new Set([...ids, product.id])] }
      }
    }
    const physical = orderLines.some((line) => line.kind === 'PHYSICAL')
    try {
      if (command.gift != null) {
        const settings = await getStoreSettings()
        const gift = validateGiftOrder(command.gift, { enabled: settings.giftOrdersEnabled, wrapEnabled: settings.giftWrapEnabled, physical })
        if (gift) meta = { ...meta, gift }
      }
    } catch (error) {
      if (error instanceof StoreError) return fail(error.status, error.code, error.message)
      throw error
    }
    let shippingAddress: Record<string, string> | undefined
    if (physical && command.shippingMode === 'PICKUP') {
      const pickup = (await getDeliverySettings()).pickup
      if(!pickup?.enabled || !pickup.address.trim())return fail(409,'PICKUP_DISABLED','تحویل حضوری در حال حاضر فعال نیست')
      const customer=await db.user.findUnique({where:{id:command.userId},select:{phone:true,name:true}})
    if(!customer?.phone || !(await import('@/modules/sms/domain/sms')).normalizeMobile(customer.phone))return fail(400,'PICKUP_PHONE_REQUIRED','برای پیامک تحویل، ابتدا موبایل معتبر را در حساب خود ثبت کنید')
      meta={...meta,shippingMode:'PICKUP',pickupAddress:pickup.address,pickupInstructions:pickup.instructions}
    }
    if (physical && command.shippingMode !== 'PICKUP') {
      const deliverySettings = await getDeliverySettings()
      try {
        if (command.addressId) shippingAddress = await addressSnapshot(command.userId, Number(command.addressId))
        else {
          const input = command.shippingAddress || {}
          const required = ['recipient', 'phone', 'country', 'city', 'address'] as const
          shippingAddress = Object.fromEntries(([...required, 'postalCode'] as const).map(key => [key, String(input[key] || '').trim().slice(0, key === 'address' ? 500 : 120)]))
          if (required.some(key => !shippingAddress?.[key]) || !/^[+0-9 ()-]{7,24}$/.test(shippingAddress.phone)) return fail(400, 'SHIPPING_REQUIRED', 'یک آدرس ارسال از دفترچهٔ آدرس انتخاب کنید', { addressesUrl: '/dashboard/addresses' })
        }
        // With carriers on, the chosen carrier decides whether a delivery time is picked (the shop's own courier).
        const dest = { province: String(shippingAddress?.province || ''), city: String(shippingAddress?.city || '') }
        carrier = await checkoutCarrier({ carrierId: command.carrierId, lines: orderLines.filter((line) => line.kind === 'PHYSICAL'), dest, itemMinor: amountMinor, currency, memberFree: (await tierStanding(command.userId))?.freeShipping })
        if (deliverySettings.enabled && (!carrier || carrier.scheduled)) {
          if (!command.delivery?.date || !command.delivery.slotId) return fail(400, 'DELIVERY_REQUIRED', 'روز و بازهٔ زمانی ارسال را انتخاب کنید')
          delivery = await validateDelivery(command.delivery.date, command.delivery.slotId)
        }
      } catch (error) {
        if (error instanceof ShippingError) return fail(error.status, error.code, error.message)
        throw error
      }
    }
    amount = legacyNumber(amountMinor, currency)
    const head = orderLines[0]
    label = `${head.name}${head.variantName ? ` · ${head.variantName}` : ''}${many ? ` و ${(orderLines.length - 1).toLocaleString('fa-IR')} کالای دیگر` : ''}`
    meta = { ...meta, productKind: physical ? 'PHYSICAL' : 'VIRTUAL', lineCount: orderLines.length, itemCount: orderLines.reduce((sum, line) => sum + line.quantity, 0), fromCart: Boolean(cartLines), shippingAddress, delivery }
    if (many) meta = { ...meta, variantId: null, variantName: '', variantSku: '', variantAttributes: '{}' }
  }
  if (amountMinor <= 0n) return fail(400, 'INVALID_PRICE', 'item price must be greater than zero')
  if (command.expectedQuote) {
    const quoted = command.expectedQuote
    if (typeof quoted.amountMinor !== 'string' || !/^\d{1,14}$/.test(quoted.amountMinor) || typeof quoted.currency !== 'string') return fail(400, 'BAD_QUOTE', 'قیمت نمایش‌داده‌شده معتبر نیست')
    if (BigInt(quoted.amountMinor) !== amountMinor || quoted.currency !== currency) return fail(409, 'PRICE_CHANGED', 'قیمت یا شرایط عضویت تغییر کرده است؛ صفحه را تازه کنید و قیمت جدید را ببینید')
  }
  const subtotalMinor = amountMinor
  let discountMinor = 0n
  let promotion: Awaited<ReturnType<typeof db.promotion.findUnique>> = null
  const code = promotionCode(command.discountCode)
  // A typed foreign amount is money passed on, not a margin: a discount code does not cut into it.
  if (code && formSubmissionId) return fail(409, 'PROMOTION_NOT_APPLICABLE', 'کد تخفیف روی پرداخت فرم اعمال نمی‌شود')
  if (code && (hostingProductId || hostingRenewServiceId || hostingAddon || domainOrder || domainRenew)) return fail(409, 'PROMOTION_NOT_APPLICABLE', 'کد تخفیف فعلاً روی میزبانی و سرور اعمال نمی‌شود')
  if (code && orderLines.some((line) => line.openAmountMinor > 0n)) return fail(409, 'PROMOTION_NOT_APPLICABLE', 'کد تخفیف روی سفارشی که «پرداخت با مبلغ دلخواه» دارد اعمال نمی‌شود')
  if (code) {
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return fail(400, 'PROMOTION_INVALID', 'invalid discount code')
    promotion = await db.promotion.findUnique({ where: { code } })
    if (!promotion) return fail(404, 'PROMOTION_NOT_FOUND', 'discount code not found')
    if (promotion.membersOnly && !member) return fail(403, 'PROMOTION_MEMBERS_ONLY', 'این کد تخفیف مخصوص اعضای ویژه است', { upgradeUrl: '/vip' })
    const quote = promotionDiscount(promotion, { planId, membershipPlanId, amountMinor, currency })
    if (!quote.ok) return fail(409, quote.code, 'discount code cannot be applied to this order')
    discountMinor = quote.discountMinor
    amountMinor -= discountMinor
    amount = legacyNumber(amountMinor, currency)
  }
  // Shipping is charged on what the customer pays for the item (after discounts) and is never discounted itself.
  if (productId && meta.productKind === 'PHYSICAL' && carrier && command.shippingMode !== 'PICKUP') {
    // Re-priced on what the customer pays for the items (free-shipping thresholds count after discounts).
    const physicalLines = orderLines.filter((line) => line.kind === 'PHYSICAL')
    const dest = meta.shippingAddress as Record<string, string> | undefined
    try {
      carrier = await checkoutCarrier({ carrierId: carrier.carrierId, lines: physicalLines, dest: { province: String(dest?.province || ''), city: String(dest?.city || '') }, itemMinor: amountMinor, currency, memberFree: (await tierStanding(command.userId))?.freeShipping }) || carrier
    } catch (error) {
      if (error instanceof ShippingError) return fail(error.status, error.code, error.message)
      throw error
    }
    shippingMinor = carrier.feeMinor
    meta = { ...meta, shipping: { carrierId: carrier.carrierId, carrierName: carrier.name, zone: carrier.zone, weightGrams: carrier.weightGrams, eta: carrier.eta, ...(carrier.collect ? { collect: true } : {}) } }
    amountMinor += shippingMinor
    amount = legacyNumber(amountMinor, currency)
  } else if (productId && meta.productKind === 'PHYSICAL' && command.shippingMode !== 'PICKUP') {
    shippingMinor = (await tierStanding(command.userId))?.freeShipping ? 0n : shippingFeeMinor(await getDeliverySettings(), currency, amountMinor)
    amountMinor += shippingMinor
    amount = legacyNumber(amountMinor, currency)
  }

  let desiredUsername: string | undefined
  if (planId && command.username?.trim()) {
    const raw = command.username.trim()
    const clean = sanitizeUsername(raw)
    if (clean.length < USERNAME_MIN || clean !== raw.toLowerCase()) {
      return fail(400, 'INVALID_USERNAME', 'نام کانفیگ نامعتبر است')
    }
    const check = await checkUsername(clean, planId)
    if (!check.available) return fail(409, 'USERNAME_TAKEN', 'این نام کانفیگ قبلاً استفاده شده است', { suggestion: suggestUsername(clean) })
    desiredUsername = clean
  }

  const balance = await walletBalance(command.userId, currency)
  const balanceMinor = toMinor(balance, currency)
  const walletOnly = command.payWith === 'wallet'
  if (walletOnly && balanceMinor < amountMinor) {
    return fail(402, 'INSUFFICIENT_FUNDS', 'موجودی کیف پول کافی نیست', {
      balance,
      amount,
      needed: minorToNumber(amountMinor - balanceMinor, currency),
      currency,
    })
  }
  const creditMinor = balanceMinor >= amountMinor ? amountMinor : walletOnly ? 0n : balanceMinor
  const dueMinor = amountMinor - creditMinor

  let gateway: Awaited<ReturnType<typeof resolveCheckoutGateway>> = null
  if (dueMinor > 0n) {
    gateway = await resolveCheckoutGateway(command.gatewayRef, currency)
    if (!gateway) {
      return fail(command.gatewayRef ? 409 : 503, command.gatewayRef ? 'GATEWAY_NOT_AVAILABLE' : 'NO_GATEWAY', command.gatewayRef ? 'درگاه انتخاب‌شده فعال یا سازگار نیست' : 'هیچ درگاه پرداخت فعالی تنظیم نشده است', { balance, amount, currency })
    }
    if (!gatewayAcceptsCheckoutCurrency(gateway, currency)) {
      return fail(409, 'GATEWAY_CURRENCY_MISMATCH', `درگاه ${customerGatewayLabel(gateway)} از واحد ${currency} پشتیبانی نمی‌کند`, { currency, gatewayCurrency: gateway.fiat })
    }
  }
  // Installment providers approve the purchase against the customer's verified mobile number.
  let installmentMobile = ''
  if (gateway && isInstallmentGateway(gateway.provider)) {
    const customer = await db.user.findUnique({ where: { id: command.userId }, select: { phone: true, phoneVerifiedAt: true } })
    if (!customer?.phone || !customer.phoneVerifiedAt) return fail(400, 'PHONE_REQUIRED', 'برای خرید اقساطی ابتدا شمارهٔ موبایل خود را در حساب کاربری ثبت و تأیید کنید', { profileUrl: '/dashboard/profile' })
    installmentMobile = customer.phone
  }

  let order
  try {
    order = await db.$transaction(async tx => {
      if (productId) await assertStoreAcceptsOrders(tx)
      if (promotion) {
        const claimed = await tx.promotion.updateMany({ where: { id: promotion.id, active: true, reservedCount: promotion.reservedCount }, data: { reservedCount: { increment: 1 } } })
        if (claimed.count !== 1) throw Error('PROMOTION_CONFLICT')
        const usedByCustomer = await tx.promotionRedemption.count({ where: { promotionId: promotion.id, userId: command.userId, status: { in: ['RESERVED', 'USED'] } } })
        if (usedByCustomer >= promotion.perUserLimit) throw Error('PROMOTION_USER_LIMIT')
      }
      const created = await tx.order.create({ data: {
        ...(command.shippingMode==='PICKUP' && meta.productKind==='PHYSICAL'?{receiptToken:(await import('node:crypto')).randomBytes(24).toString('hex'),customerPhone:(await tx.user.findUniqueOrThrow({where:{id:command.userId},select:{phone:true}})).phone}:{}),
        userId: command.userId,
        planId,
        productId,
        totalAmount: amount,
        totalMinor: amountMinor,
        currency,
        idempotencyKey: command.idempotencyKey,
        status: 'PENDING',
        provider: dueMinor === 0n ? 'wallet' : gateway!.provider.toLowerCase(),
        gatewayId: gateway?.id ?? null,
        meta: JSON.stringify({ ...meta, ...(command.surface === 'dashboard' ? { checkoutSurface: 'dashboard' } : {}), walletApplied: minorToNumber(creditMinor, currency), username: desiredUsername || '', discountCode: code, discountMinor: discountMinor.toString(), memberPrice: memberDiscount, shippingMinor: shippingMinor.toString() }),
      } })
      if (delivery) await bookDelivery(tx, created.id, delivery.date, delivery.slot.id)
      for (const line of orderLines) await tx.orderLine.create({ data: { ...line, orderId: created.id } })
      if(command.shippingMode==='PICKUP' && meta.productKind==='PHYSICAL')await (await import('@/modules/store/server/pickup')).createStorePickup(tx,created.id)
      if (orderLines.length) await tx.orderEvent.create({ data: { orderId: created.id, status: 'PENDING', note: 'سفارش ثبت شد' } })
      if (promotion) await tx.promotionRedemption.create({ data: { promotionId: promotion.id, userId: command.userId, orderId: created.id } })
      return created
    })
  } catch (error) {
    const replayAfterRace = await replayOrder(command.userId, command.idempotencyKey)
    if (replayAfterRace) return replayAfterRace
    if (error instanceof Error && error.message.startsWith('PROMOTION_')) return fail(409, error.message, 'discount code could not be reserved; please retry')
    if (error instanceof ShippingError) return fail(error.status, error.code, error.message)
    if (error instanceof StoreError) return fail(error.status, error.code, error.message)
    throw error
  }

  await emitExtensionEvent('order.created', { orderId: order.id, userId: command.userId, planId: order.planId, productId: order.productId, totalMinor: order.totalMinor.toString(), currency: order.currency })

  if (productId) {
    const reserved = await reserveInventory({ orderId: order.id })
    if (!reserved.ok) {
      await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } }).catch(() => {})
      await releasePromotionForOrder(order.id)
      return fail(409, 'OUT_OF_STOCK', reserved.message || 'out of stock')
    }
  }

  if (formSubmissionId) await attachFormOrder(formSubmissionId, order.id)
  const invoice = await createInvoiceForOrder({
    orderId: order.id,
    userId: command.userId,
    planId,
    productId,
    subtotal: legacyNumber(subtotalMinor + shippingMinor, currency),
    discount: legacyNumber(discountMinor, currency),
    currency,
    gatewayId: gateway?.id ?? null,
    walletApplied: legacyNumber(creditMinor, currency),
    notes: [shippingMinor > 0n ? `Shipping: ${legacyNumber(shippingMinor, currency)} ${currency}` : '', creditMinor > 0n ? `Wallet credit applied: ${legacyNumber(creditMinor, currency)} ${currency}` : ''].filter(Boolean).join('\n'),
    idempotencyKey: `checkout:${command.idempotencyKey}:invoice`,
  })
  // A price that followed a rate holds for a while only (see billing/server/invoice-rules.ts).
  if (fxCodes.length && !invoice.fxRates) await stampFxInvoice(invoice.id, fxCodes)

  if (creditMinor > 0n) {
    const debit = await moveWallet({
      userId: command.userId,
      amount: -legacyNumber(creditMinor, currency),
      currency,
      type: 'PURCHASE',
      description: `${label} ${invoice.number}`,
      orderId: order.id,
      invoiceId: invoice.id,
      idempotencyKey: `checkout:${command.idempotencyKey}:wallet`,
    })
    if (!debit.ok) {
      await releaseInventoryReservation(order.id)
      await db.invoice.updateMany({ where: { id: invoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'VOID', walletApplied: 0, walletAppliedMinor: 0n } }).catch(() => {})
      await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } }).catch(() => {})
      await releasePromotionForOrder(order.id)
      return fail(409, 'WALLET_FAILED', debit.message || 'wallet debit failed')
    }
  }

  if (dueMinor === 0n) {
    const settled = await markInvoicePaid({ invoiceId: invoice.id, provider: 'WALLET', amount: 0, raw: { source: 'wallet' } })
    if (!settled.ok) return fail(500, 'SETTLEMENT_FAILED', settled.message || 'invoice settlement failed')
    const kind = formSubmissionId ? 'FORM_PAID' : hostingProductId ? 'HOSTING_PROVISION' : hostingRenewServiceId ? 'HOSTING_RENEW' : hostingAddon ? 'HOSTING_ADDON' : domainOrder ? 'DOMAIN_ORDER' : domainRenew ? 'DOMAIN_RENEW' : content ? 'GRANT_CONTENT' : membershipPlanId ? 'GRANT_MEMBERSHIP' : planId ? 'PROVISION_SUBSCRIPTION' : 'DELIVER_PRODUCT'
    const job = await enqueueFulfillment({ kind, dedupeKey: `${kind}:order:${order.id}`, orderId: order.id, invoiceId: invoice.id })
    const processed = await processFulfillmentJob(job.id)
    const subscription = planId ? await db.subscription.findFirst({ where: { orderId: order.id } }) : null
    await db.order.update({ where: { id: order.id }, data: { paymentUrl: `/invoice/${invoice.number}` } }).catch(() => {})
    return {
      ok: true,
      data: {
        paid: true,
        settledFrom: 'wallet',
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        invoiceUrl: `/invoice/${invoice.number}`,
        paymentUrl: `/invoice/${invoice.number}`,
        subscriptionId: subscription?.id ?? null,
        username: subscription?.username === 'pending' ? '' : subscription?.username || '',
        walletApplied: amount,
        amountDue: 0,
        balance: minorToNumber(balanceMinor - amountMinor, currency),
        currency,
        fulfillmentPending: !processed.ok,
      },
    }
  }

  const due = legacyNumber(dueMinor, currency)
  const result = await createGatewayInvoice(gateway!, {
    orderNumber: invoice.number,
    amount: due,
    currency,
    email: command.email || undefined,
    orderName: `MoboComCMS - ${label}`,
    callbackUrl: gatewayCallbackUrl(gateway!, command.siteUrl),
    successUrl: `${command.siteUrl}/payment/result?order=${order.id}`,
    failUrl: `${command.siteUrl}/payment/result?order=${order.id}&failed=1`,
    channel: command.channel || 'web',
    mobile: installmentMobile || undefined,
    items: orderLines.length ? orderLines.map((line) => ({ id: String(line.productId), name: `${line.name}${line.variantName ? ` · ${line.variantName}` : ''}`, count: line.quantity, unitAmount: legacyNumber(line.unitPriceMinor, currency) })) : undefined,
    shippingAmount: shippingMinor > 0n ? legacyNumber(shippingMinor, currency) : undefined,
  })
  const invoiceUrl = result.manual ? `/invoice/${invoice.number}` : result.paymentUrl
  if (!result.ok || !invoiceUrl) {
    // FrenzyEx v1 has no idempotency-key header. A timeout can mean the remote
    // request was created even though we never received its response. Keep the
    // local invoice pending and the wallet reservation intact so a retry cannot
    // silently create/charge a second checkout.
    if (result.ambiguous && gateway?.provider === 'FRENZYEX') {
      if (result.txnId) {
        await db.order.update({ where: { id: order.id }, data: { providerTxnId: result.txnId } }).catch(() => {})
        await db.invoice.update({ where: { id: invoice.id }, data: { providerTxnId: result.txnId } }).catch(() => {})
      }
      // Persist the expected provider-side amount even when the create response
      // was lost. A later signed callback can then be reconciled safely by
      // order_ref + exact amount without issuing a duplicate create request.
      if (result.providerAmount != null && result.providerCurrency) {
        await recordProviderEvent({
          provider: 'FRENZYEX',
          event: 'payment.requested',
          eventKey: result.txnId ? `frenzyex:create:${result.txnId}` : `frenzyex:create:invoice:${invoice.id}`,
          status: 'PENDING',
          gatewayId: gateway.id,
          orderId: order.id,
          invoiceId: invoice.id,
          userId: command.userId,
          amount: result.providerAmount,
          currency: result.providerCurrency,
          providerTxnId: result.txnId || '',
          raw: { ambiguous: true, channel: command.channel || 'web' },
        }).catch(() => {})
      }
      return fail(502, 'GATEWAY_AMBIGUOUS', 'پاسخ درگاه نامشخص بود. برای جلوگیری از پرداخت تکراری، دوباره سفارش جدید نسازید و وضعیت همین فاکتور را بررسی کنید.', {
        invoiceNumber: invoice.number,
        invoiceUrl: `/invoice/${invoice.number}`,
      })
    }
    await releaseInvoiceCredit(invoice.id, `credit released ${invoice.number}`)
    await releaseInventoryReservation(order.id)
    await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } }).catch(() => {})
    await db.invoice.updateMany({ where: { id: invoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'VOID' } }).catch(() => {})
    await releasePromotionForOrder(order.id)
    return fail(502, 'GATEWAY_ERROR', 'خطا در ایجاد پرداخت: ' + (result.message || ''))
  }
  await db.order.update({ where: { id: order.id }, data: { providerTxnId: result.txnId || '', paymentUrl: invoiceUrl } })
  await db.invoice.update({ where: { id: invoice.id }, data: { providerTxnId: result.txnId || '', paymentUrl: invoiceUrl } }).catch(() => {})
  if (gateway?.provider === 'FRENZYEX' && result.txnId && result.providerAmount != null && result.providerCurrency) {
    await recordProviderEvent({
      provider: 'FRENZYEX',
      event: 'payment.requested',
      eventKey: `frenzyex:create:${result.txnId}`,
      status: 'PENDING',
      gatewayId: gateway.id,
      orderId: order.id,
      invoiceId: invoice.id,
      userId: command.userId,
      amount: result.providerAmount,
      currency: result.providerCurrency,
      providerTxnId: result.txnId,
      raw: { expiresAt: result.expiresAt || null, channel: command.channel || 'web' },
    })
  }
  return {
    ok: true,
    data: {
      paid: false,
      orderId: order.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      invoiceUrl: `/invoice/${invoice.number}`,
      paymentUrl: invoiceUrl,
      manual: Boolean(result.manual),
      walletApplied: minorToNumber(creditMinor, currency),
      amountDue: due,
      balance: minorToNumber(balanceMinor - creditMinor, currency),
      currency,
      gatewayLabel: customerGatewayLabel(gateway),
      providerAmount: result.providerAmount ?? null,
      providerCurrency: result.providerCurrency || '',
    },
  }
}
