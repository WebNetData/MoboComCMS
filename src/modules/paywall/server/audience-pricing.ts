import { adjustedPrice, readAudiencePrices } from '@/modules/account/domain/price-adjustments'
import { siteGroupsOf } from '@/modules/account/server/site-groups'
import { decideAccess, type PaidRule, type AccessDecision } from '@/modules/paywall/domain/paywall'

/** Same eligibility and adjustment math as Store; never compound two discounts. */
export async function pricedAccess(rule: PaidRule & { pricingRules?: string }, viewer: { userId: number | null; member: boolean; purchased: boolean }): Promise<AccessDecision> {
  const rules = readAudiencePrices(rule.pricingRules)
  const vip = rules.find(row => row.audience === 'vip')
  const vipAmount = vip ? adjustedPrice(rule.priceMinor, vip) : null
  const legacy = decideAccess(rule, viewer)
  if (legacy.open) return legacy
  let amount = legacy.priceMinor, memberPrice = legacy.memberPrice, groupPrice = false
  if (viewer.member && vipAmount !== null && vipAmount < amount) { amount = vipAmount; memberPrice = true }
  const groupKeys = rules.filter(row => row.audience.startsWith('group:')).map(row => row.audience)
  const keys = viewer.userId && groupKeys.length ? await siteGroupsOf(viewer.userId, groupKeys) : []
  for (const row of rules) if (keys.includes(row.audience)) {
    const candidate = adjustedPrice(rule.priceMinor, row)
    if (candidate < amount) { amount = candidate; memberPrice = false; groupPrice = true }
  }
  if (amount === 0n) return { open: true, reason: groupPrice ? 'group' : 'vip' }
  return { ...legacy, priceMinor: amount, memberPrice, groupPrice, vipFree: vipAmount === 0n || legacy.vipFree, vipPriceMinor: vipAmount !== null && vipAmount > 0n ? vipAmount : legacy.vipPriceMinor }
}
