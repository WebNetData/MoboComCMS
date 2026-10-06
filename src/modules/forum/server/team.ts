import { db } from '@/platform/database/prisma'
import { parsePermissions } from '@/modules/identity/rbac'
import { ForumError } from '@/modules/forum/domain/forum'
import type { ForumRank } from '@/modules/forum/domain/community'

// The forum's team, in three ranks. None of them is a new kind of access; each names one that already exists:
//   admin     — staff whose role holds forum.moderate (or full access): the whole forum and its admin pages
//   deputy    — a member of a moderator group: moderates every forum, without the admin pages
//   moderator — assigned to a section or forum: moderates it and what is under it
// A person's rank is the highest they hold.

/** The group deputies are put in. It is an ordinary moderator group, made the first time it is needed. */
export const DEPUTY_GROUP = { slug: 'deputies', name: 'معاونان تالار', title: 'معاون تالار', icon: '⭐', color: '#f59e0b' } as const

export async function ensureDeputyGroup() {
  const found = await db.forumGroup.findUnique({ where: { slug: DEPUTY_GROUP.slug } })
  if (found) return found.moderator ? found : db.forumGroup.update({ where: { id: found.id }, data: { moderator: true } })
  return db.forumGroup.create({ data: { ...DEPUTY_GROUP, description: 'ناظران همهٔ انجمن‌ها', moderator: true, joinMode: 'CLOSED', visibility: 'PUBLIC', mentionable: true } })
}

const isForumAdmin = (user: { role: string; status: string; roleId: number | null; roleRef: { permissions: string } | null }) =>
  user.role === 'ADMIN' && user.status === 'ACTIVE' && (user.roleId == null || parsePermissions(user.roleRef?.permissions || '').includes('forum.moderate'))

/** Rank of each of these users in the forum's team; users with none are absent. */
export async function forumRanks(userIds: number[]): Promise<Map<number, ForumRank>> {
  const ids = [...new Set(userIds)].filter((id) => Number.isSafeInteger(id) && id > 0)
  const ranks = new Map<number, ForumRank>()
  if (!ids.length) return ranks
  const [staff, deputies, moderators] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids }, role: 'ADMIN' }, select: { id: true, role: true, status: true, roleId: true, roleRef: { select: { permissions: true } } } }),
    db.forumGroupMember.findMany({ where: { userId: { in: ids }, status: 'ACTIVE', group: { moderator: true } }, select: { userId: true } }),
    db.forumCategoryModerator.findMany({ where: { userId: { in: ids } }, select: { userId: true } }),
  ]).catch(() => [[], [], []] as const)
  // Lowest first, so a higher rank written later replaces it.
  for (const row of moderators) ranks.set(row.userId, 'moderator')
  for (const row of deputies) ranks.set(row.userId, 'deputy')
  for (const user of staff) if (isForumAdmin(user)) ranks.set(user.id, 'admin')
  return ranks
}

/** The whole team as ids: who holds each rank, and which forums each assigned moderator has. */
export async function forumTeamIds() {
  const [staff, deputies, moderators] = await Promise.all([
    db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true, role: true, status: true, roleId: true, roleRef: { select: { permissions: true } } } }),
    db.forumGroupMember.findMany({ where: { status: 'ACTIVE', group: { moderator: true }, user: { status: 'ACTIVE' } }, orderBy: { createdAt: 'asc' }, select: { userId: true } }),
    db.forumCategoryModerator.findMany({ where: { user: { status: 'ACTIVE' } }, orderBy: { createdAt: 'asc' }, select: { userId: true, categoryId: true } }),
  ])
  const admins = staff.filter(isForumAdmin).map((user) => user.id)
  const deputyIds = [...new Set(deputies.map((row) => row.userId))].filter((id) => !admins.includes(id))
  const forums = new Map<number, number[]>()
  for (const row of moderators) forums.set(row.userId, [...(forums.get(row.userId) || []), row.categoryId])
  return { admins, deputies: deputyIds, moderators: [...forums].map(([userId, categoryIds]) => ({ userId, categoryIds })) }
}

const member = async (username: unknown) => {
  const name = String(username ?? '').trim().replace(/^@/, '').toLowerCase()
  const profile = name ? await db.forumProfile.findUnique({ where: { username: name }, select: { userId: true, user: { select: { status: true } } } }) : null
  if (!profile || profile.user.status !== 'ACTIVE') throw new ForumError(`کاربری با نام «${name || '—'}» پیدا نشد`, 404)
  return profile.userId
}

/** Makes a member a deputy (moderator of every forum) or takes that back. */
export async function setDeputy(username: unknown, on: boolean) {
  const userId = await member(username)
  const group = await ensureDeputyGroup()
  if (on) await db.forumGroupMember.upsert({ where: { groupId_userId: { groupId: group.id, userId } }, update: { status: 'ACTIVE' }, create: { groupId: group.id, userId, status: 'ACTIVE' } })
  else await db.forumGroupMember.deleteMany({ where: { groupId: group.id, userId } })
  await db.forumGroup.update({ where: { id: group.id }, data: { memberCount: await db.forumGroupMember.count({ where: { groupId: group.id, status: 'ACTIVE' } }) } })
  return { userId, deputy: on }
}

/** Assigns a member to a section or forum as its moderator, or removes them from it. */
export async function setForumModerator(username: unknown, categoryId: unknown, on: boolean) {
  const userId = await member(username)
  const id = Number(categoryId)
  const category = Number.isSafeInteger(id) && id > 0 ? await db.forumCategory.findUnique({ where: { id }, select: { id: true } }) : null
  if (!category) throw new ForumError('انجمن انتخاب‌شده پیدا نشد', 404)
  if (on) await db.forumCategoryModerator.upsert({ where: { categoryId_userId: { categoryId: category.id, userId } }, update: {}, create: { categoryId: category.id, userId } })
  else await db.forumCategoryModerator.deleteMany({ where: { categoryId: category.id, userId } })
  return { userId, categoryId: category.id, moderator: on }
}
