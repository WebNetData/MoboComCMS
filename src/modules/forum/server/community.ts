import { cache } from 'react'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { parsePermissions } from '@/modules/identity/rbac'
import { getViewer as getSessionViewer, isMember } from '@/modules/membership/server/membership'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { isModuleEnabled } from '@/extensions/server/modules'
import { ensureUserProfiles } from '@/modules/identity/server/profile'
import {
  DEFAULT_FORUM_SETTINGS, GUEST, automaticGroups, computeTrustLevel, earnedBadgeRules, normalizeForumSettings, parseThresholdRule, thresholdMet, reactionWeight, sameReactionWeights,
  type ForumSettings, type Viewer,
} from '@/modules/forum/domain/community'
import { categoryFamily } from '@/modules/forum/domain/tree'
import { forumRestrictionState } from '@/modules/forum/server/restrictions'

// Shared forum services: settings, the current viewer (groups, trust level,
// staff), profiles, counters, trust promotion, badges and notifications.

const SETTINGS_KEY = 'forum.settings.v1'

/** The settings as stored now (not the copy a request already holds): for work that compares or outlives a request. */
async function readForumSettings(): Promise<ForumSettings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null)
  if (!row) return DEFAULT_FORUM_SETTINGS
  try { return normalizeForumSettings(JSON.parse(row.value)) } catch { return DEFAULT_FORUM_SETTINGS }
}

export const getForumSettings = cache(readForumSettings)

export async function saveForumSettings(input: Record<string, unknown>) {
  const before = await readForumSettings()
  const settings = normalizeForumSettings(input)
  const value = JSON.stringify(settings)
  await db.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value }, update: { value } })
  // A changed weight applies to every reaction ever given, not only to the ones to come: everybody is recounted.
  if (!sameReactionWeights(before, settings)) {
    await db.backgroundJob.create({ data: { kind: 'forum.reputation-recount', payload: JSON.stringify({ cursor: 0 }), dedupeKey: `forum-reputation:${Date.now()}` } })
  }
  return settings
}

/**
 * Reputation of these members from the reactions themselves: every reaction others gave to their posts, by
 * the weight its kind has now. One grouped query for the whole batch.
 */
export async function reputationOf(userIds: number[], settings: Pick<ForumSettings, 'reactionWeights'>): Promise<Map<number, number>> {
  const totals = new Map<number, number>(userIds.map((id) => [id, 0]))
  if (!userIds.length) return totals
  const rows = await db.$queryRaw<{ uid: number; emoji: string; n: bigint | number }[]>`SELECT p."userId" AS uid, r."emoji" AS emoji, COUNT(*) AS n FROM "ForumReaction" r JOIN "ForumPost" p ON p."id" = r."postId" WHERE p."userId" IN (${Prisma.join(userIds)}) AND r."userId" <> p."userId" GROUP BY p."userId", r."emoji"`
  for (const row of rows) totals.set(Number(row.uid), (totals.get(Number(row.uid)) || 0) + Number(row.n) * reactionWeight(settings, row.emoji))
  return totals
}

/**
 * Queue step: recounts reputation for the next members after `cursor`, in id order. Returns the cursor to
 * continue from, or null when everybody is done. Safe to repeat and to interrupt: each value is set, never added to.
 */
export async function recountReputation(cursor: number, limit = 500): Promise<{ changed: number; next: number | null }> {
  const settings = await readForumSettings()
  const profiles = await db.forumProfile.findMany({ where: { userId: { gt: Math.max(0, Math.trunc(cursor) || 0) } }, orderBy: { userId: 'asc' }, take: limit, select: { userId: true, reputation: true } })
  if (!profiles.length) return { changed: 0, next: null }
  const totals = await reputationOf(profiles.map((row) => row.userId), settings)
  let changed = 0
  for (const row of profiles) {
    const reputation = totals.get(row.userId) || 0
    if (reputation === row.reputation) continue
    await db.forumProfile.update({ where: { userId: row.userId }, data: { reputation } })
    changed++
  }
  return { changed, next: profiles.length < limit ? null : profiles[profiles.length - 1].userId }
}

// ------------------------------------------------------------------ profiles

async function uniqueUsername(seed: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = attempt ? `${seed.slice(0, 16)}${attempt + 1}` : seed
    if (!await db.forumProfile.findUnique({ where: { username: name }, select: { userId: true } })) return name
  }
  return `${seed.slice(0, 12)}${Date.now().toString(36).slice(-6)}`
}

/**
 * Forum profiles for these users. The public identity (username, avatar …)
 * comes from the unified member profile, so a member has one name site-wide.
 */
export async function ensureProfiles(userIds: number[]) {
  const ids = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (!ids.length) return
  const existing = new Set((await db.forumProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true } })).map((row) => row.userId))
  const missing = ids.filter((id) => !existing.has(id))
  if (!missing.length) return
  await ensureUserProfiles(missing)
  const identities = await db.userProfile.findMany({ where: { userId: { in: missing } }, select: { userId: true, username: true, bio: true, location: true, website: true, avatar: true, cover: true } })
  for (const identity of identities) {
    await db.forumProfile.create({ data: identity }).catch(async (error: { code?: string }) => {
      if (error?.code !== 'P2002') throw error
      // Created concurrently, or an old forum-only name collides: fall back to a unique name.
      if (!await db.forumProfile.findUnique({ where: { userId: identity.userId }, select: { userId: true } })) {
        await db.forumProfile.create({ data: { ...identity, username: await uniqueUsername(identity.username) } }).catch(() => undefined)
      }
    })
  }
}

// ------------------------------------------------------------------ viewer

async function isStaff(userId: number): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true, roleId: true, roleRef: { select: { permissions: true } } } }).catch(() => null)
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') return false
  if (user.roleId == null) return true
  const permissions = parsePermissions(user.roleRef?.permissions || '')
  return permissions.includes('forum.moderate')
}

/** Resolve a user into a forum viewer (API routes pass the authenticated user id). */
export async function viewerFor(userId: number | null | undefined, knownMember?: boolean): Promise<Viewer> {
  const automatic = await db.forumGroup.findMany({ where: { automatic: { not: null } }, select: { id: true, automatic: true, moderator: true } })
  const byKey = new Map(automatic.map((group) => [group.automatic!, group]))
  // While the VIP module is off no forum is members-only: everybody reads them (the VIP group still needs a real membership).
  const open = !await isModuleEnabled('membership')
  if (!userId) return { ...GUEST, member: open, groupIds: byKey.get('everyone') ? [byKey.get('everyone')!.id] : [] }
  await ensureProfiles([userId])
  const [assigned, profile, staff, member, memberships] = await Promise.all([
    db.forumCategoryModerator.findMany({ where: { userId }, select: { categoryId: true } }).catch(() => []),
    db.forumProfile.findUnique({ where: { userId } }),
    isStaff(userId),
    knownMember ?? isMember(userId).catch(() => false),
    db.forumGroupMember.findMany({ where: { userId, status: 'ACTIVE' }, select: { groupId: true, group: { select: { moderator: true } } } }),
  ])
  const trustLevel = profile?.trustLevel ?? 0
  const keys = automaticGroups({ loggedIn: true, trustLevel, member, staff })
  const groupIds = [...new Set([...keys.map((key) => byKey.get(key)?.id).filter((id): id is number => !!id), ...memberships.map((row) => row.groupId)])]
  const restrictions = await forumRestrictionState(userId)
  const moderator = staff || memberships.some((row) => row.group.moderator)
  // A moderator of a section or a forum moderates what is under it too.
  const tree = assigned.length && !moderator ? await db.forumCategory.findMany({ select: { id: true, parentId: true } }).catch(() => []) : []
  const moderates = [...new Set(assigned.flatMap((row) => categoryFamily(tree, row.categoryId)))].filter((id) => tree.some((row) => row.id === id))
  return {
    userId, groupIds, trustLevel, moderator, member: member || open, moderates,
    ...restrictions,
  }
}

/** The signed-in visitor as a forum viewer (server components, cached per request). */
export const getForumViewer = cache(async (): Promise<Viewer> => {
  const session = await getSessionViewer()
  const viewer = await viewerFor(session.userId, session.member)
  if (viewer.userId) void touchVisit(viewer.userId).catch((error) => logEvent('warn', 'forum.visit_failed', { error }))
  return viewer
})

const today = () => new Date().toISOString().slice(0, 10)

/** Last seen time; the first visit of each day counts toward trust levels. */
export async function touchVisit(userId: number) {
  const day = today()
  const updated = await db.forumProfile.updateMany({ where: { userId, NOT: { lastVisitDay: day } }, data: { lastVisitDay: day, daysVisited: { increment: 1 }, lastSeenAt: new Date() } })
  if (updated.count) await refreshStats(userId)
  else await db.forumProfile.updateMany({ where: { userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { lastSeenAt: new Date() } })
}

// ------------------------------------------------------------------ counters, trust, badges

/**
 * Recount a user's community numbers from the source tables, then apply
 * automatic trust promotion and badges. Counting (instead of incrementing)
 * keeps the numbers right after moderation, deletions and undone likes.
 */
export async function refreshStats(userId: number) {
  const profile = await db.forumProfile.findUnique({ where: { userId } })
  if (!profile) return
  const [topicCount, postCount, likesGiven, likesReceived, solvedCount, topicsEntered, bestPost, user] = await Promise.all([
    db.forumThread.count({ where: { userId, status: 'VISIBLE' } }),
    db.forumPost.count({ where: { userId, status: 'VISIBLE' } }),
    db.forumReaction.count({ where: { userId } }),
    db.forumReaction.count({ where: { post: { userId } } }),
    db.forumPost.count({ where: { userId, status: 'VISIBLE', solutionOf: { status: 'VISIBLE' } } }),
    db.forumTopicUser.count({ where: { userId } }),
    db.forumPost.findFirst({ where: { userId, status: 'VISIBLE' }, orderBy: { likeCount: 'desc' }, select: { likeCount: true } }),
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
  ])
  const settings = await getForumSettings()
  const reputation = (await reputationOf([userId], settings)).get(userId) || 0
  const stats = { daysVisited: profile.daysVisited, topicsEntered, postCount, topicCount, likesGiven, likesReceived, solvedCount }
  const trustLevel = computeTrustLevel(profile.trustLevel, stats, settings, profile.trustLocked)
  await db.forumProfile.update({ where: { userId }, data: { topicCount, postCount, likesGiven, likesReceived, reputation, solvedCount, topicsEntered, trustLevel } })
  if (trustLevel > profile.trustLevel) {
    await notify(userId, 'FORUM_TRUST', `trust:${userId}:${trustLevel}`, 'سطح اعتماد شما بالا رفت', `به سطح اعتماد ${trustLevel.toLocaleString('fa-IR')} رسیدید و امکانات بیشتری در تالار دارید.`, `/forum/u/${profile.username}`)
  }
  await grantBadges(userId, {
    ...stats, reputation: profile.reputation, trustLevel, bestPostLikes: bestPost?.likeCount ?? 0, hasAvatar: !!profile.avatar, hasBio: profile.bio.trim().length >= 10,
    memberDays: user ? Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000) : 0,
  })
}

const METRIC_COLUMN = { posts: 'postCount', topics: 'topicCount', likes: 'likesReceived', reputation: 'reputation', solved: 'solvedCount' } as const

/**
 * A threshold badge is given to everybody who already meets it, the moment it is made or changed — the number
 * is measured over everything stored, not only from now on. Returns how many got it.
 */
export async function grantThresholdBadgeToAll(badgeId: number): Promise<number> {
  const badge = await db.forumBadge.findUnique({ where: { id: badgeId } })
  const rule = badge?.enabled ? parseThresholdRule(badge.rule) : null
  if (!badge || !rule) return 0
  const where = rule.metric === 'days'
    ? { user: { createdAt: { lte: new Date(Date.now() - rule.value * 86_400_000) } } }
    : { [METRIC_COLUMN[rule.metric]]: { gte: rule.value } }
  const holders = new Set((await db.forumUserBadge.findMany({ where: { badgeId }, select: { userId: true } })).map((row) => row.userId))
  const due = (await db.forumProfile.findMany({ where, select: { userId: true }, take: 20_000 })).filter((row) => !holders.has(row.userId))
  if (!due.length) return 0
  const made = await db.forumUserBadge.createMany({ data: due.map((row) => ({ userId: row.userId, badgeId, reason: 'automatic' })), skipDuplicates: true })
  await db.forumBadge.update({ where: { id: badgeId }, data: { grantCount: { increment: made.count } } })
  return made.count
}

async function grantBadges(userId: number, facts: Parameters<typeof earnedBadgeRules>[0] & { reputation: number }) {
  const rules = earnedBadgeRules(facts)
  // Fixed rules by name, and badges whose rule is a number the admin chose ("posts:100").
  const open = await db.forumBadge.findMany({ where: { enabled: true, rule: { not: '' }, grants: { none: { userId } } } })
  const badges = open.filter((badge) => rules.includes(badge.rule) || thresholdMet(badge.rule, facts))
  if (!badges.length) return
  const profile = await db.forumProfile.findUnique({ where: { userId }, select: { username: true } })
  for (const badge of badges) {
    try {
      await db.$transaction([
        db.forumUserBadge.create({ data: { userId, badgeId: badge.id, reason: 'automatic' } }),
        db.forumBadge.update({ where: { id: badge.id }, data: { grantCount: { increment: 1 } } }),
      ])
      await notify(userId, 'FORUM_BADGE', `badge:${userId}:${badge.id}`, `نشان «${badge.name}» را گرفتید ${badge.icon}`, badge.description, `/forum/u/${profile?.username || ''}?tab=badges`)
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
    }
  }
}

/** Staff grant or revoke of a manual badge. */
export async function setBadge(userId: number, badgeId: number, grant: boolean, grantedBy: number, reason = '') {
  if (grant) {
    const created = await db.forumUserBadge.create({ data: { userId, badgeId, reason: reason.slice(0, 200), grantedBy } }).catch((error: { code?: string }) => { if (error?.code === 'P2002') return null; throw error })
    if (!created) return false
    const badge = await db.forumBadge.update({ where: { id: badgeId }, data: { grantCount: { increment: 1 } } })
    const profile = await db.forumProfile.findUnique({ where: { userId }, select: { username: true } })
    await notify(userId, 'FORUM_BADGE', `badge:${userId}:${badgeId}`, `نشان «${badge.name}» را گرفتید ${badge.icon}`, reason || badge.description, `/forum/u/${profile?.username || ''}?tab=badges`)
    return true
  }
  const removed = await db.forumUserBadge.deleteMany({ where: { userId, badgeId } })
  if (removed.count) await db.forumBadge.update({ where: { id: badgeId }, data: { grantCount: { decrement: removed.count } } })
  return removed.count > 0
}

// ------------------------------------------------------------------ notifications

/** Forum notification in the user's inbox (deduplicated by key). */
export async function notify(userId: number, kind: string, dedupeKey: string, titleFa: string, bodyFa: string, href: string) {
  if (!href.startsWith('/')) return
  await createInboxEvent({ userId, kind, dedupeKey, titleFa, titleEn: titleFa, bodyFa: bodyFa.slice(0, 300), bodyEn: bodyFa.slice(0, 300), href: href.replace(/[^A-Za-z0-9/_?=&.%#-]/g, (char) => encodeURIComponent(char)).replace(/#.*$/, '') })
    .catch((error) => logEvent('warn', 'forum.notify_failed', { kind, error }))
}
