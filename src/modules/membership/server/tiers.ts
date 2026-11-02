import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { chainStart } from '@/modules/membership/domain/plans'

const running = (now: Date) => ({ revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } })

export type Standing = { rank: number; tierId: number | null; tierName: string; color: string; storeDiscountPercent: number; freeShipping: boolean; hideAds: boolean; since: Date | null }

/** A member's place among the tiers now: the highest they hold, with the best of each perk among their running periods. Null for a non-member. */
export async function tierStanding(userId: number | null | undefined, now = new Date()): Promise<Standing | null> {
  if (!userId || !await isModuleEnabled('membership')) return null
  const periods = await db.userMembership.findMany({ where: { userId, revokedAt: null }, select: { planId: true, startsAt: true, endsAt: true, revokedAt: true } })
  const live = periods.filter((period) => period.startsAt <= now && period.endsAt > now)
  if (!live.length) return null
  const planIds = [...new Set(live.flatMap((period) => (period.planId ? [period.planId] : [])))]
  const plans = planIds.length ? await db.membershipPlan.findMany({ where: { id: { in: planIds }, tierId: { not: null } }, select: { tier: true } }) : []
  const tiers = plans.flatMap((plan) => (plan.tier ? [plan.tier] : [])).sort((a, b) => b.rank - a.rank)
  const top = tiers[0]
  return {
    rank: top?.rank ?? 1, tierId: top?.id ?? null, tierName: top?.name ?? '', color: top?.color ?? '',
    storeDiscountPercent: Math.max(0, ...tiers.map((tier) => tier.storeDiscountPercent)),
    freeShipping: tiers.some((tier) => tier.freeShipping), hideAds: tiers.some((tier) => tier.hideAds),
    since: chainStart(periods, now),
  }
}

/** The people holding a tier or a higher one now, among these ids; all of them when no ids are given. */
export async function holdersOfTier(rank: number, now = new Date(), userId?: number) {
  const plans = await db.membershipPlan.findMany({ where: { tier: { rank: { gte: rank } } }, select: { id: true } })
  if (!plans.length) return []
  const rows = await db.userMembership.findMany({ where: { ...running(now), ...(userId ? { userId } : {}), planId: { in: plans.map((plan) => plan.id) } }, distinct: ['userId'], select: { userId: true } })
  return rows.map((row) => row.userId)
}
