import { isPublicProduct } from '@/modules/catalog/domain/product-publication'
import { normalizeCurrency, toMinor } from '@/shared/money'

export type PriceObservation = { variantId: number; amountMinor: bigint; currency: string }
type PriceSource = { active: boolean; approval: string; currency: string; price: number; priceMinor: bigint }

/** Only the regular publicly offered price; member/list prices never enter history. */
export function publicPriceObservations(product: PriceSource, variants: { id: number; active: boolean; price: number; priceMinor: bigint }[]): PriceObservation[] {
  if (!isPublicProduct(product)) return []
  const currency = normalizeCurrency(product.currency)
  const points = [{ variantId: 0, amountMinor: product.priceMinor || toMinor(product.price, currency), currency }]
  for (const variant of variants) if (variant.active) points.push({ variantId: variant.id, amountMinor: variant.priceMinor || toMinor(variant.price, currency), currency })
  return points.filter(point => point.amountMinor > 0n)
}

export function priceObservationChanged(previous: { amountMinor: bigint; currency: string } | null, next: PriceObservation): boolean {
  return !previous || previous.amountMinor !== next.amountMinor || previous.currency !== next.currency
}
