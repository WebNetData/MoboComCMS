import { memberPrice } from '@/modules/membership/domain/membership'
import { listPriceActive } from '@/modules/store/domain/store'
import { normalizeCurrency, toMinor } from '@/shared/money'

type PricedProduct = { price: number; priceMinor: bigint; memberPriceMinor: bigint; compareAtMinor: bigint; saleEndsAt: Date | null; currency: string }
type PricedVariant = { price: number; priceMinor: bigint; memberPriceMinor: bigint; compareAtMinor: bigint } | null

/**
 * The price a customer pays for one unit (VIP price applied for members) and
 * the struck-through list price when a discount is running.
 */
export function unitPrice(product: PricedProduct, variant: PricedVariant, member: boolean, now = new Date()) {
  const currency = normalizeCurrency(product.currency)
  const regularMinor = variant ? variant.priceMinor || toMinor(variant.price, currency) : product.priceMinor || toMinor(product.price, currency)
  const compareAtMinor = variant ? variant.compareAtMinor || product.compareAtMinor : product.compareAtMinor
  const priced = memberPrice(regularMinor, variant ? variant.memberPriceMinor : product.memberPriceMinor, member)
  const listed = listPriceActive(regularMinor, compareAtMinor, product.saleEndsAt, now)
  // A VIP price is itself a discount off the regular price; show whichever list price is higher.
  const listMinor = listed ? compareAtMinor : priced.memberDiscount ? regularMinor : 0n
  return { currency, unitMinor: priced.amountMinor, regularMinor, listMinor, memberDiscount: priced.memberDiscount }
}
