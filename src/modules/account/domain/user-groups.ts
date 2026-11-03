// A user group of the site: who is in it is stored, what it gives is on the group. Pure.
import { adjustedPrice, type PriceAdjustment } from '@/modules/account/domain/price-adjustments'

export type GroupInput = { name: string; description: string; color: string; active: boolean; vipBenefits: boolean; hideAds: boolean; discountPercent: number; showBadge: boolean; sortOrder: number }

export class GroupError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const line = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)

export function normalizeGroup(raw: Record<string, unknown>): GroupInput {
  const name = line(raw.name, 60)
  if (name.length < 2) throw new GroupError('نام گروه را بنویسید')
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? String(raw.color).toLowerCase() : '#4b45ee'
  const percent = Number(raw.discountPercent ?? 0)
  if (!Number.isInteger(percent) || percent < 0 || percent > 90) throw new GroupError('تخفیف باید عدد صحیح بین ۰ تا ۹۰ درصد باشد')
  return { name, description: line(raw.description, 300), color, active: raw.active !== false, vipBenefits: raw.vipBenefits === true, hideAds: raw.hideAds === true, discountPercent: percent, showBadge: raw.showBadge !== false, sortOrder: Math.max(0, Math.min(1000, Math.trunc(Number(raw.sortOrder)) || 0)) }
}

export const groupSlug = (id: number) => `group-${id}`

export const memberActive = (now: Date) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], group: { active: true } })

export type GroupDeal = { percent: number; prices: ReadonlyMap<string, bigint>; adjustments?: ReadonlyMap<string, readonly PriceAdjustment[]> }
export const NO_DEAL: GroupDeal = { percent: 0, prices: new Map() }
export const dealKey = (productId: number, variantId: number | null | undefined) => `${productId}:${variantId || 0}`

/** What a group's member pays for a regular price: a price set for this item or for the whole product, or the group's discount, whichever is lowest. */
export function dealPrice(regularMinor: bigint, deal: GroupDeal | null | undefined, productId: number, variantId: number | null | undefined) {
  if (!deal) return regularMinor
  const candidates = [regularMinor]
  for (const key of new Set([dealKey(productId, variantId), dealKey(productId, 0)])) {
    const own = deal.prices.get(key)
    if (own !== undefined && own > 0n) candidates.push(own)
    for (const rule of deal.adjustments?.get(key) || []) candidates.push(adjustedPrice(regularMinor, rule))
  }
  if (deal.percent > 0) {
    const discounted = (regularMinor * BigInt(100 - deal.percent)) / 100n
    candidates.push(discounted > 0n ? discounted : 1n)
  }
  return candidates.reduce((low, value) => (value < low ? value : low))
}
