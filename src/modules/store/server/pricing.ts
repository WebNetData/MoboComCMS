import { channelRegularMinor } from '@/modules/store/domain/pricing'
import { type SaleChannel } from '@/modules/promotions/domain/channels'
import { memberPrice } from '@/modules/membership/domain/membership'
import { listPriceActive } from '@/modules/store/domain/store'
import { normalizeCurrency, toMinor } from '@/shared/money'
import { dealPrice, type GroupDeal } from '@/modules/account/domain/user-groups'
import { adjustedPrice, readAdjustment } from '@/modules/account/domain/price-adjustments'

type PricedProduct = { id?: number; price: number; priceMinor: bigint; memberPriceMinor: bigint; vipPricing?: string; digitalMode?: string; compareAtMinor: bigint; saleEndsAt: Date | null; saleChannel?: string; currency: string }
type PricedVariant = { id?: string | number; price: number; priceMinor: bigint; memberPriceMinor: bigint; compareAtMinor: bigint } | null

/**
 * The price a customer pays for one unit (the lowest of the regular, VIP and group prices) and
 * the struck-through list price when a discount is running.
 */
export function unitPrice(product: PricedProduct, variant: PricedVariant, member: boolean, now = new Date(), deal?: GroupDeal | null, channel: SaleChannel = 'ONLINE') {
  const currency = normalizeCurrency(product.currency)
  const advertisedMinor = variant ? variant.priceMinor || toMinor(variant.price, currency) : product.priceMinor || toMinor(product.price, currency)
  const compareAtMinor = variant ? variant.compareAtMinor || product.compareAtMinor : product.compareAtMinor
  const regularMinor = channelRegularMinor(advertisedMinor, compareAtMinor, product.saleChannel, channel)
  const priced = memberPrice(regularMinor, product.vipPricing ? 0n : variant ? variant.memberPriceMinor : product.memberPriceMinor, member)
  const vipRule = member ? readAdjustment(product.vipPricing) : null
  if (vipRule) { const amount = adjustedPrice(regularMinor, vipRule); if (amount < regularMinor && (amount > 0n || product.digitalMode === 'FILES')) { priced.amountMinor = amount; priced.memberDiscount = true } }
  const listed = listPriceActive(regularMinor, compareAtMinor, product.saleEndsAt, now)
  const grouped = dealPrice(regularMinor, deal, product.id || 0, Number(variant?.id) || 0)
  const groupDiscount = grouped < priced.amountMinor && (grouped > 0n || product.digitalMode === 'FILES')
  const unitMinor = groupDiscount ? grouped : priced.amountMinor
  // A VIP price is itself a discount off the regular price; show whichever list price is higher.
  const listMinor = listed ? compareAtMinor : priced.memberDiscount || groupDiscount ? regularMinor : 0n
  return { currency, unitMinor, regularMinor, listMinor, memberDiscount: priced.memberDiscount, groupDiscount }
}
