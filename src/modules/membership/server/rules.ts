import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { groupGivesVip } from '@/modules/account/server/user-groups'
import { tierStanding } from '@/modules/membership/server/tiers'
import { TAXONOMY_INFO } from '@/modules/taxonomy/domain/taxonomy'

export type RuleTarget = { ownerType: string; ownerId: number }
export type RuleRefusal = { reason: 'tier'; minRank: number } | { reason: 'drip'; opensAt: Date | null }

/** The sections whose whole categories can carry a rule, and which item type files under each. */
export const CATEGORY_SOURCES = [
  { id: 'cat:post', label: 'مجله', item: 'post' },
  { id: 'cat:product', label: 'فروشگاه', item: 'product' },
  { id: 'cat:cinema', label: 'فیلم و سریال', item: 'title', taxonomy: 'cinema' },
  { id: 'cat:games', label: 'بازی', item: 'game', taxonomy: 'games' },
  { id: 'cat:software', label: 'نرم‌افزار', item: 'software', taxonomy: 'software' },
  { id: 'cat:music', label: 'موزیک', item: 'album', taxonomy: 'music' },
] as const

const withAncestors = (ids: number[], parents: { id: number; parentId: number | null }[]) => {
  const parentOf = new Map(parents.map((row) => [row.id, row.parentId])), seen = new Set<number>()
  for (const start of ids) for (let at: number | null | undefined = start, hops = 0; at && !seen.has(at) && hops < 12; at = parentOf.get(at), hops++) seen.add(at)
  return [...seen]
}

/** The categories an item is filed under, with the ones above them: a rule on a parent holds for what is under it. */
async function filedUnder(target: RuleTarget, source: (typeof CATEGORY_SOURCES)[number]) {
  if (source.id === 'cat:post') {
    const post = await db.post.findUnique({ where: { id: target.ownerId }, select: { categoryId: true, categories: { select: { categoryId: true } } } })
    if (!post) return []
    return withAncestors([...(post.categoryId ? [post.categoryId] : []), ...post.categories.map((row) => row.categoryId)], await db.postCategory.findMany({ select: { id: true, parentId: true } }))
  }
  if (source.id === 'cat:product') {
    const product = await db.product.findUnique({ where: { id: target.ownerId }, select: { categoryId: true, extraCategories: { select: { categoryId: true } } } })
    if (!product) return []
    return withAncestors([...(product.categoryId ? [product.categoryId] : []), ...product.extraCategories.map((row) => row.categoryId)], await db.productCategory.findMany({ select: { id: true, parentId: true } }))
  }
  const rows = await db.taxonomyAssignment.findMany({ where: { taxonomy: source.taxonomy, ownerId: target.ownerId }, select: { termId: true } })
  return rows.length ? withAncestors(rows.map((row) => row.termId), await db.taxonomyTerm.findMany({ where: { taxonomy: source.taxonomy }, select: { id: true, parentId: true } })) : []
}

/** Every rule that holds for these items: their own, and those of the categories they are filed under. */
async function rulesOf(chain: readonly RuleTarget[]) {
  const own = await db.membershipRule.findMany({ where: { OR: chain.map((target) => ({ ownerType: target.ownerType, ownerId: target.ownerId })) }, select: { minRank: true, dripDays: true } })
  const kinds = new Set((await db.membershipRule.findMany({ where: { ownerType: { startsWith: 'cat:' } }, distinct: ['ownerType'], select: { ownerType: true } })).map((row) => row.ownerType))
  if (!kinds.size) return own
  const wanted: { ownerType: string; ownerId: number }[] = []
  for (const target of chain) for (const source of CATEGORY_SOURCES) if (source.item === target.ownerType && kinds.has(source.id)) for (const id of await filedUnder(target, source)) wanted.push({ ownerType: source.id, ownerId: id })
  return wanted.length ? [...own, ...await db.membershipRule.findMany({ where: { OR: wanted }, select: { minRank: true, dripDays: true } })] : own
}

/** Whether any rule holds for these items, for a page that reads the viewer only when it must. */
export const hasRule = async (chain: readonly RuleTarget[]) => chain.length > 0 && await isModuleEnabled('membership') && (await rulesOf(chain)).length > 0

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

/** Who a restricted block in a document opens for. While VIP is off nothing is members-only, as everywhere else. */
export async function opensRestricted(viewer: { userId: number | null; opens: boolean }, audience: unknown, minRank: unknown) {
  if (audience === 'signed-in') return !!viewer.userId
  if (!await isModuleEnabled('membership')) return true
  if (!viewer.opens) return false
  const rank = Number(minRank) || 0
  if (rank <= 1) return true
  return ((await tierStanding(viewer.userId))?.rank ?? 1) >= rank
}

export async function readRule(ownerType: string, ownerId: number) {
  const [rule, tiers] = await Promise.all([
    db.membershipRule.findUnique({ where: { ownerType_ownerId: { ownerType, ownerId } } }),
    db.membershipTier.findMany({ orderBy: { rank: 'asc' }, select: { id: true, name: true, rank: true } }),
  ])
  return { minRank: rule?.minRank ?? 0, dripDays: rule?.dripDays ?? 0, tiers }
}

/** An empty rule is no rule: its row goes, so the gates do not read it. */
export async function saveRule(ownerType: string, ownerId: number, input: { minRank?: unknown; dripDays?: unknown }) {
  const minRank = Math.max(0, Math.min(99, Math.trunc(Number(input.minRank)) || 0)), dripDays = Math.max(0, Math.min(3650, Math.trunc(Number(input.dripDays)) || 0))
  if (!minRank && !dripDays) { await db.membershipRule.deleteMany({ where: { ownerType, ownerId } }); return { minRank, dripDays } }
  await db.membershipRule.upsert({ where: { ownerType_ownerId: { ownerType, ownerId } }, create: { ownerType, ownerId, minRank, dripDays }, update: { minRank, dripDays } })
  return { minRank, dripDays }
}

/** The rules on whole categories, and everything the admin chooses from. */
export async function categoryRules() {
  const [rules, tiers, posts, products, terms] = await Promise.all([
    db.membershipRule.findMany({ where: { ownerType: { startsWith: 'cat:' } }, orderBy: { id: 'desc' } }),
    db.membershipTier.findMany({ orderBy: { rank: 'asc' }, select: { id: true, name: true, rank: true } }),
    db.postCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.productCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.taxonomyTerm.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, taxonomy: true } }),
  ])
  const sources = CATEGORY_SOURCES.map((source) => ({ id: source.id, label: source.label, categories: source.id === 'cat:post' ? posts : source.id === 'cat:product' ? products : terms.filter((term) => term.taxonomy === ('taxonomy' in source ? source.taxonomy : '')).map(({ id, name }) => ({ id, name })) }))
  return {
    tiers, sources, taxonomyLabels: Object.fromEntries(Object.entries(TAXONOMY_INFO).map(([id, info]) => [id, info.label])),
    rules: rules.map((rule) => { const source = sources.find((row) => row.id === rule.ownerType); return { id: rule.id, ownerType: rule.ownerType, ownerId: rule.ownerId, source: source?.label || rule.ownerType, category: source?.categories.find((row) => row.id === rule.ownerId)?.name || 'دستهٔ حذف‌شده', minRank: rule.minRank, dripDays: rule.dripDays } }),
  }
}
