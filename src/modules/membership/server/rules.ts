import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { groupGivesVip } from '@/modules/account/server/user-groups'
import { tierStanding } from '@/modules/membership/server/tiers'

export type RuleTarget = { ownerType: string; ownerId: number }
export type RuleRefusal = { reason: 'tier'; minRank: number } | { reason: 'drip'; opensAt: Date | null }

const rulesOf = (chain: readonly RuleTarget[]) => db.membershipRule.findMany({ where: { OR: chain.map((target) => ({ ownerType: target.ownerType, ownerId: target.ownerId })) }, select: { minRank: true, dripDays: true } })

/** What a tier or drip rule on these items says to this member: null when it lets them through, or there is no rule. */
export async function ruleRefusal(userId: number | null | undefined, chain: readonly RuleTarget[], now = new Date()): Promise<RuleRefusal | null> {
  if (!chain.length || !await isModuleEnabled('membership')) return null
  const rules = await rulesOf(chain)
  const minRank = Math.max(0, ...rules.map((rule) => rule.minRank)), dripDays = Math.max(0, ...rules.map((rule) => rule.dripDays))
  if (!minRank && !dripDays) return null
  const standing = await tierStanding(userId, now)
  if (!standing) return await groupGivesVip(userId) && minRank <= 1 ? null : { reason: 'tier', minRank: Math.max(1, minRank) }
  if (standing.rank < minRank) return { reason: 'tier', minRank }
  const opensAt = standing.since ? new Date(standing.since.getTime() + dripDays * 86_400_000) : null
  return dripDays && (!opensAt || opensAt > now) ? { reason: 'drip', opensAt } : null
}

export async function readRule(ownerType: string, ownerId: number) {
  const [rule, tiers] = await Promise.all([
    db.membershipRule.findUnique({ where: { ownerType_ownerId: { ownerType, ownerId } } }),
    db.membershipTier.findMany({ orderBy: { rank: 'asc' }, select: { id: true, name: true, rank: true } }),
  ])
  return { minRank: rule?.minRank ?? 0, dripDays: rule?.dripDays ?? 0, tiers }
}

/** An empty rule is no rule: its row goes, so the gates do not read it. */
export async function saveRule(ownerType: string, ownerId: number, input: { minRank: unknown; dripDays: unknown }) {
  const minRank = Math.max(0, Math.min(99, Math.trunc(Number(input.minRank)) || 0)), dripDays = Math.max(0, Math.min(3650, Math.trunc(Number(input.dripDays)) || 0))
  if (!minRank && !dripDays) { await db.membershipRule.deleteMany({ where: { ownerType, ownerId } }); return { minRank, dripDays } }
  await db.membershipRule.upsert({ where: { ownerType_ownerId: { ownerType, ownerId } }, create: { ownerType, ownerId, minRank, dripDays }, update: { minRank, dripDays } })
  return { minRank, dripDays }
}
