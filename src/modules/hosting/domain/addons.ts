// Add-ons a customer buys on a running service: extra traffic packs and an upgrade to a bigger plan. Pure rules.
import { HostingError, cycleMeta } from '@/modules/hosting/domain/catalog'
import { addMonths } from '@/modules/hosting/domain/services'

export const MAX_TRAFFIC_PACKS = 20

/** Whole packs from 1 to 20. */
export function trafficPacks(value: unknown): number {
  const packs = Math.trunc(Number(value))
  if (!Number.isFinite(packs) || packs < 1 || packs > MAX_TRAFFIC_PACKS) throw new HostingError(`تعداد بسته باید بین ۱ تا ${MAX_TRAFFIC_PACKS.toLocaleString('fa-IR')} باشد`)
  return packs
}

/** A per-service switch wins; without one the product decides. */
export const addonAllowed = (service: boolean | null | undefined, product: boolean) => service ?? product

/**
 * What moving to a dearer plan costs now: the price difference for the part of the current term that is left,
 * rounded up to a whole unit. Nothing is charged for a term that has already ended or for an hourly service
 * (its new rate simply applies from the next hour).
 */
export function upgradeCharge(input: { cycle: string; currentPriceMinor: bigint; newPriceMinor: bigint; nextDueAt: Date | null; now: Date }): bigint {
  const months = cycleMeta(input.cycle)?.months || 0
  if (!months || !input.nextDueAt || input.newPriceMinor <= input.currentPriceMinor) return 0n
  const end = input.nextDueAt.getTime(), start = addMonths(input.nextDueAt, -months).getTime(), now = input.now.getTime()
  if (now >= end) return 0n
  const term = BigInt(end - start), left = BigInt(Math.min(end - now, end - start))
  const diff = input.newPriceMinor - input.currentPriceMinor
  return (diff * left + term - 1n) / term
}

export type UpgradeCandidate = { id: number; kind: string; active: boolean; prices: { cycle: string; currency: string; amountMinor: bigint }[] }

/** Plans a service may move to: the same kind, on sale, priced for the service's cycle and dearer than it pays now. */
export function upgradeTargets<T extends UpgradeCandidate>(service: { productId: number; kind: string; cycle: string; currency: string; priceMinor: bigint }, products: T[]): (T & { newPriceMinor: bigint })[] {
  return products.flatMap((product) => {
    if (product.id === service.productId || !product.active || product.kind !== service.kind) return []
    const price = product.prices.find((row) => row.cycle === service.cycle && row.currency === service.currency)
    return price && price.amountMinor > service.priceMinor ? [{ ...product, newPriceMinor: price.amountMinor }] : []
  }).sort((a, b) => (a.newPriceMinor < b.newPriceMinor ? -1 : a.newPriceMinor > b.newPriceMinor ? 1 : 0))
}
