import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { idsOf, type SiteGroup } from '@/modules/account/domain/site-groups'
import { memberActive } from '@/modules/account/domain/user-groups'

const activeVip = (now: Date) => ({ revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } })
const activeSubscription = (now: Date) => ({ status: 'ACTIVE', expiresAt: { gt: now } })

/** Every group of the site, for a picker: only what exists, and only from sections that are switched on. */
export async function siteGroupCatalog(now = new Date()): Promise<SiteGroup[]> {
  const [vipOn, storeOn, vpnOn, sellersOn, resellersOn, forumOn] = await Promise.all(['membership', 'store', 'vpn', 'marketplace', 'reseller', 'forum'].map((id) => isModuleEnabled(id)))
  const groups: SiteGroup[] = []
  const own = await db.userGroup.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true, _count: { select: { members: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } } } })
  for (const group of own) groups.push({ key: `group:${group.id}`, label: group.name, family: 'group', count: group._count.members })
  const roles = await db.role.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, nameFa: true, _count: { select: { users: true } } } })
  for (const role of roles) groups.push({ key: `role:${role.id}`, label: role.nameFa || role.name, family: 'role', count: role._count.users })
  if (vipOn) {
    const [people, plans, perPlan] = await Promise.all([
      db.userMembership.findMany({ where: activeVip(now), distinct: ['userId'], select: { userId: true } }),
      db.membershipPlan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
      db.userMembership.findMany({ where: { ...activeVip(now), planId: { not: null } }, distinct: ['userId', 'planId'], select: { planId: true } }),
    ])
    groups.push({ key: 'vip', label: 'همهٔ اعضای ویژه', family: 'vip', count: people.length })
    for (const plan of plans) groups.push({ key: `vip-plan:${plan.id}`, label: `پلن ${plan.name}`, family: 'vip', count: perPlan.filter((row) => row.planId === plan.id).length })
  }
  if (storeOn) groups.push({ key: 'buyers', label: 'کسانی که خرید کرده‌اند', family: 'customers', count: (await db.order.groupBy({ by: ['userId'], where: { status: 'PAID' } })).length })
  if (vpnOn) groups.push({ key: 'subscribers', label: 'دارندگان اشتراک فعال', family: 'customers', count: (await db.subscription.groupBy({ by: ['userId'], where: activeSubscription(now) })).length })
  if (sellersOn) groups.push({ key: 'sellers', label: 'فروشندگان فعال', family: 'partners', count: await db.seller.count({ where: { status: 'ACTIVE' } }) })
  if (resellersOn) {
    const [owners, members] = await Promise.all([db.reseller.count({ where: { active: true } }), db.resellerMember.count({ where: { active: true } })])
    groups.push({ key: 'resellers', label: 'نمایندگان فروش', family: 'partners', count: owners + members })
  }
  for (const row of await db.crmTag.groupBy({ by: ['tag'], _count: { _all: true }, orderBy: { tag: 'asc' }, take: 100 })) groups.push({ key: `crm:${row.tag}`, label: row.tag, family: 'crm', count: row._count._all })
  // Automatic forum groups repeat the kinds above (everyone, VIP, staff); a club is its members' own.
  if (forumOn) for (const group of await db.forumGroup.findMany({ where: { clubCategoryId: null, automatic: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, memberCount: true } })) groups.push({ key: `forum:${group.id}`, label: group.name, family: 'forum', count: group.memberCount })
  return groups
}

/** Which of these groups a member is in now, asking only the owners that were named. */
export async function siteGroupsOf(userId: number, keys: readonly string[], now = new Date()): Promise<string[]> {
  const wanted = new Set(keys), mine: string[] = []
  const groupIds = idsOf(keys, 'group'), roleIds = idsOf(keys, 'role'), planIds = idsOf(keys, 'vip-plan'), forumIds = idsOf(keys, 'forum')
  const tags = keys.filter((key) => key.startsWith('crm:')).map((key) => key.slice(4))
  const work: Promise<unknown>[] = []
  if (groupIds.length) work.push(db.userGroupMember.findMany({ where: { userId, groupId: { in: groupIds }, ...memberActive(now) }, select: { groupId: true } }).then((rows) => { for (const row of rows) mine.push(`group:${row.groupId}`) }))
  if (roleIds.length) work.push(db.user.findUnique({ where: { id: userId }, select: { roleId: true } }).then((user) => { if (user?.roleId && roleIds.includes(user.roleId)) mine.push(`role:${user.roleId}`) }))
  if (wanted.has('vip') || planIds.length) work.push(db.userMembership.findMany({ where: { userId, ...activeVip(now) }, select: { planId: true } }).then((rows) => {
    if (rows.length && wanted.has('vip')) mine.push('vip')
    for (const row of rows) if (row.planId && planIds.includes(row.planId)) mine.push(`vip-plan:${row.planId}`)
  }))
  if (wanted.has('buyers')) work.push(db.order.findFirst({ where: { userId, status: 'PAID' }, select: { id: true } }).then((row) => { if (row) mine.push('buyers') }))
  if (wanted.has('subscribers')) work.push(db.subscription.findFirst({ where: { userId, ...activeSubscription(now) }, select: { id: true } }).then((row) => { if (row) mine.push('subscribers') }))
  if (wanted.has('sellers')) work.push(db.seller.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } }).then((row) => { if (row) mine.push('sellers') }))
  if (wanted.has('resellers')) work.push(Promise.all([db.reseller.findFirst({ where: { userId, active: true }, select: { id: true } }), db.resellerMember.findFirst({ where: { userId, active: true }, select: { id: true } })]).then(([owner, member]) => { if (owner || member) mine.push('resellers') }))
  if (tags.length) work.push(db.crmTag.findMany({ where: { userId, tag: { in: tags } }, select: { tag: true } }).then((rows) => { for (const row of rows) mine.push(`crm:${row.tag}`) }))
  if (forumIds.length) work.push(db.forumGroupMember.findMany({ where: { userId, status: 'ACTIVE', groupId: { in: forumIds } }, select: { groupId: true } }).then((rows) => { for (const row of rows) mine.push(`forum:${row.groupId}`) }))
  await Promise.all(work)
  return mine
}

/** The group each member shows under their name: the first of their shown groups in the admin's order, else VIP. */
export async function groupBadges(userIds: readonly number[], now = new Date()) {
  const badges = new Map<number, { name: string; color: string }>()
  if (!userIds.length) return badges
  const rows = await db.userGroupMember.findMany({ where: { userId: { in: [...userIds] }, ...memberActive(now), group: { active: true, showBadge: true } }, orderBy: [{ group: { sortOrder: 'asc' } }, { groupId: 'asc' }], select: { userId: true, group: { select: { name: true, color: true } } } })
  for (const row of rows) if (!badges.has(row.userId)) badges.set(row.userId, row.group)
  const rest = userIds.filter((id) => !badges.has(id))
  if (rest.length && await isModuleEnabled('membership')) for (const row of await db.userMembership.findMany({ where: { userId: { in: rest }, ...activeVip(now) }, distinct: ['userId'], select: { userId: true } })) badges.set(row.userId, { name: 'عضو ویژه', color: '#d97706' })
  return badges
}
