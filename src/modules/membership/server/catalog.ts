import { db } from '@/platform/database/prisma'
import { legacyNumber } from '@/shared/money'
import { MembershipError, isLifetime } from '@/modules/membership/domain/plans'
import { getVipPlans, type PublicVipPlan } from '@/modules/membership/server/membership'
import { membershipQuote, planWithTier } from '@/modules/membership/server/quote'
import { tierStanding } from '@/modules/membership/server/tiers'

/** What this plan costs this visitor now, as checkout will charge it, or why it cannot be bought. */
export type PlanOffer = { amount: number; credit: number; fee: number; upgrade: boolean; trialOpen: boolean; refused: string }
export type VipTierView = { id: number; name: string; tagline: string; color: string; rank: number; storeDiscountPercent: number; freeShipping: boolean; hideAds: boolean }
export type VipGroup = { tier: VipTierView | null; plans: (PublicVipPlan & { offer: PlanOffer | null })[] }

async function offerOf(planId: number, userId: number): Promise<PlanOffer | null> {
  const plan = await planWithTier(planId)
  if (!plan) return null
  const quoted = async (trial: boolean) => { try { return await membershipQuote(plan, userId, { trial }) } catch (error) { if (error instanceof MembershipError) return error.message; throw error } }
  const regular = await quoted(false)
  const trial = plan.trialDays > 0 ? await quoted(true) : ''
  if (typeof regular === 'string') return { amount: 0, credit: 0, fee: 0, upgrade: false, trialOpen: false, refused: regular }
  const money = (minor: bigint) => legacyNumber(minor, regular.currency)
  return { amount: money(regular.amountMinor), credit: money(regular.creditMinor), fee: money(regular.feeMinor), upgrade: regular.upgrade, trialOpen: typeof trial !== 'string', refused: '' }
}

/** The pricing page: every tier with its prices, the plans of no tier, and what each costs this visitor. */
export async function vipCatalog(userId: number | null) {
  const [plans, tiers, standing, ending] = await Promise.all([
    getVipPlans(),
    db.membershipTier.findMany({ where: { active: true }, orderBy: { rank: 'asc' } }),
    tierStanding(userId),
    userId ? db.userMembership.findFirst({ where: { userId, revokedAt: null, endsAt: { gt: new Date() } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } }) : null,
  ])
  const offers = new Map(await Promise.all(plans.map(async (plan) => [plan.id, userId ? await offerOf(plan.id, userId) : null] as const)))
  const withOffer = (plan: PublicVipPlan) => ({ ...plan, offer: offers.get(plan.id) ?? null })
  const known = new Set(tiers.map((tier) => tier.id))
  const groups: VipGroup[] = tiers.flatMap((tier) => {
    const own = plans.filter((plan) => plan.tierId === tier.id)
    return own.length ? [{ tier: { id: tier.id, name: tier.name, tagline: tier.tagline, color: tier.color, rank: tier.rank, storeDiscountPercent: tier.storeDiscountPercent, freeShipping: tier.freeShipping, hideAds: tier.hideAds }, plans: own.map(withOffer) }] : []
  })
  const loose = plans.filter((plan) => !plan.tierId || !known.has(plan.tierId))
  if (loose.length) groups.unshift({ tier: null, plans: loose.map(withOffer) })
  return { groups, rank: standing?.rank ?? 0, tierName: standing?.tierName ?? '', lifetime: isLifetime(ending?.endsAt) }
}
