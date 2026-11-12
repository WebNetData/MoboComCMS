import type { Prisma } from '@prisma/client'
import type { CounterSaleInput } from '@/modules/store/domain/counter-sales'
import { StoreError } from '@/modules/store/domain/store'
import { counterPromotion } from '@/modules/promotions/server/counter'
import { getDeliverySettings, validateDelivery } from '@/modules/shipping/server/shipping'
import { checkoutCarrier } from '@/modules/shipping/server/carriers'
import { shippingFeeMinor } from '@/modules/shipping/domain/shipping'
import { tierStanding } from '@/modules/membership/server/tiers'

/** One server quote for a counter handover or a warehouse shipment; coupons never discount postage. */
export async function counterTotals(tx: Prisma.TransactionClient, input: CounterSaleInput, customerId: number | null, lines: { productId: number | null; kind: string; quantity: number }[], subtotalMinor: bigint, currency: string) {
  const { promotion, discountMinor } = await counterPromotion(tx, { code: input.discountCode, userId: customerId, pendingAccount: !!input.customerPhone, amountMinor: subtotalMinor, currency })
  const afterDiscount = subtotalMinor - discountMinor
  let shippingMinor = 0n
  let shipping: Record<string, unknown> | null = null
  let delivery: Awaited<ReturnType<typeof validateDelivery>> | null = null
  if (input.shipment) {
    if (!customerId && !input.customerPhone) throw new StoreError('برای ارسال، مشتری را با موبایل مشخص کنید')
    if (lines.some(line => line.kind !== 'PHYSICAL')) throw new StoreError('سفارش ارسالی صندوق فقط کالای فیزیکی می‌گیرد')
    if (!await tx.stockLocation.count({ where: { id: input.shipment.locationId, kind: 'WAREHOUSE', active: true } })) throw new StoreError('انبار ارسال فعال را انتخاب کنید', 409)
    const address = input.shipment.address
    const settings = await getDeliverySettings(), memberFree = customerId ? (await tierStanding(customerId))?.freeShipping : false
    const carrier = await checkoutCarrier({ carrierId: input.shipment.carrierId, lines, dest: { province: address.province, city: address.city }, itemMinor: afterDiscount, currency, memberFree })
    shippingMinor = carrier?.feeMinor ?? (memberFree ? 0n : shippingFeeMinor(settings, currency, afterDiscount))
    if (settings.enabled && (!carrier || carrier.scheduled)) delivery = await validateDelivery(input.shipment.date, input.shipment.slotId)
    shipping = { shippingMode: 'SHIP', sourceLocationId: input.shipment.locationId,
      shippingAddress: { recipient: address.recipient, phone: address.mobile, country: 'ایران', province: address.province, city: address.city, address: address.address, plaque: address.plaque, unit: address.unit, postalCode: address.postalCode, lat: address.lat, lng: address.lng },
      ...(carrier ? { shipping: { carrierId: carrier.carrierId, carrierName: carrier.name, zone: carrier.zone, weightGrams: carrier.weightGrams, eta: carrier.eta, ...(carrier.collect ? { collect: true } : {}) } } : {}), delivery }
  }
  const totalMinor = afterDiscount + shippingMinor
  if (totalMinor <= 0n) throw new StoreError('مبلغ پرداختنی باید بیشتر از صفر باشد')
  return { promotion, subtotalMinor, discountMinor, shippingMinor, totalMinor, currency, shipping, delivery }
}
