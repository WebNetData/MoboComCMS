import { NextRequest } from 'next/server'
import { MAX_CATEGORY_DEPTH } from '@/modules/forum/domain/tree'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import type { AuthedUser } from '@/modules/identity/server/access'
import { accountChangeRefusal } from '@/modules/identity/server/staff-guard'
import { RestrictionError } from '@/modules/identity/domain/restrictions'
import { changeForumRestrictions, forumRestrictionHistory, replaceForumRestrictions } from '@/modules/forum/server/restrictions'
import { moduleGuard } from '@/extensions/server/modules'
import { ForumError, boardSlug } from '@/modules/forum/domain/forum'
import { BADGE_METRICS, BADGE_RULES, BADGE_RULE_LABEL, validBadgeRule, CommunityError, DEFAULT_FORUM_SETTINGS, FLAG_REASONS, TRUST_NAMES, groupSlug, normalizeLevel } from '@/modules/forum/domain/community'
import { markdownExcerpt } from '@/modules/forum/domain/markdown'
import { getForumSettings, grantThresholdBadgeToAll, refreshStats, saveForumSettings, setBadge, viewerFor } from '@/modules/forum/server/community'
import { resolveFlags } from '@/modules/forum/server/actions'
import { groupAction } from '@/modules/forum/server/people'
import { forumTeamIds, setDeputy, setForumModerator } from '@/modules/forum/server/team'
import { authorsFor, fallbackAuthor, type AuthorView } from '@/modules/forum/server/forum'

// Forum administration: categories (subcategories, colors, group permissions),
// groups, badges, the flag queue, member moderation and community settings.

async function guard(req: NextRequest) {
  const off = await moduleGuard('forum')
  if (off) return { response: off }
  const admin = await requirePerm(req, 'forum.moderate')
  return admin ? { admin } : { response: err('forbidden', 403) }
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max)
const color = (value: unknown, fallback = '#6366f1') => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback)
const int = (value: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)))

function failure(error: unknown, fallbackStatus = 400) {
  if (error instanceof ForumError || error instanceof CommunityError || error instanceof RestrictionError) return err(error.message, error.status)
  const message = error instanceof Error ? error.message : ''
  if (/Unique constraint/i.test(message)) return err('این نشانی یا نام قبلاً استفاده شده است', 409)
  if (/Record to (update|delete) not found|No record/i.test(message)) return err('پیدا نشد', 404)
  console.error('[forum-admin]', error)
  return err(fallbackStatus === 503 ? 'ثبت محدودیت موقتاً در دسترس نیست' : 'ورودی نامعتبر است', fallbackStatus)
}

// ------------------------------------------------------------------ reads

export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  if (req.nextUrl.searchParams.get('section') === 'restrictions') {
    const userId = Number(req.nextUrl.searchParams.get('userId')), before = req.nextUrl.searchParams.has('before') ? Number(req.nextUrl.searchParams.get('before')) : undefined
    if (!Number.isSafeInteger(userId) || userId < 1 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) return err('ورودی نامعتبر است', 400)
    try { return ok(await forumRestrictionHistory({ req, actor: g.admin }, userId, before)) } catch (error) { return failure(error) }
  }
  if (req.nextUrl.searchParams.get('section') === 'users') return ok(await users(req.nextUrl.searchParams.get('q') || ''))
  if (req.nextUrl.searchParams.get('section') === 'reports') {
    const { forumReports } = await import('@/modules/forum/server/reports')
    return ok(await forumReports(Math.max(7, Math.min(90, Number(req.nextUrl.searchParams.get('days')) || 30))))
  }
  if (req.nextUrl.searchParams.get('section') === 'review') {
    const { reviewQueue } = await import('@/modules/forum/server/moderation')
    return ok({ items: await reviewQueue(await viewerFor(g.admin.id)) })
  }
  const [team, categories, groups, badges, flags, settings, stats] = await Promise.all([
    teamForAdmin(),
    categoriesWithModerators(),
    db.forumGroup.findMany({ orderBy: [{ automatic: 'asc' }, { name: 'asc' }] }),
    db.forumBadge.findMany({ orderBy: [{ tier: 'asc' }, { id: 'asc' }] }),
    flagQueue(),
    getForumSettings(),
    Promise.all([db.forumThread.count(), db.forumPost.count(), db.forumProfile.count({ where: { postCount: { gt: 0 } } }), db.forumFlag.count({ where: { status: 'PENDING' } }), db.forumPost.count({ where: { status: 'PENDING' } })]),
  ])
  return ok({
    team, categories, groups, badges, flags, settings, defaults: DEFAULT_FORUM_SETTINGS, badgeRules: BADGE_RULES, badgeRuleLabels: BADGE_RULE_LABEL, badgeMetrics: BADGE_METRICS, trustNames: TRUST_NAMES, flagReasons: FLAG_REASONS,
    stats: { topics: stats[0], posts: stats[1], members: stats[2], pendingFlags: stats[3], pendingReview: stats[4] },
  })
}

type QueueEntry = {
  post: { id: number; number: number; excerpt: string; status: string; createdAt: Date; thread: { id: number; title: string } }
  author: AuthorView; weight: number; flags: { reason: string; note: string; weight: number; createdAt: Date; by: AuthorView }[]
}

async function flagQueue(): Promise<QueueEntry[]> {
  const flags = await db.forumFlag.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 200, include: { post: { select: { id: true, postNumber: true, content: true, status: true, userId: true, createdAt: true, thread: { select: { id: true, title: true } } } } } })
  const authors = await authorsFor([...flags.map((row) => row.userId), ...flags.map((row) => row.post.userId)])
  const byPost = new Map<number, QueueEntry>()
  for (const row of flags) {
    const entry = byPost.get(row.postId) || {
      post: { id: row.post.id, number: row.post.postNumber, excerpt: markdownExcerpt(row.post.content, 400), status: row.post.status, createdAt: row.post.createdAt, thread: row.post.thread },
      author: authors.get(row.post.userId) || fallbackAuthor(row.post.userId), flags: [], weight: 0,
    }
    entry.flags.push({ reason: row.reason, note: row.note, weight: row.weight, createdAt: row.createdAt, by: authors.get(row.userId) || fallbackAuthor(row.userId) })
    entry.weight += row.weight
    byPost.set(row.postId, entry)
  }
  return [...byPost.values()]
}

async function users(q: string) {
  const term = text(q, 60).toLowerCase().replace(/^@/, '')
  const where = term ? { OR: [{ username: { contains: term } }, { user: { email: { contains: term } } }, { user: { name: { contains: term } } }] } : {}
  const rows = await db.forumProfile.findMany({ where, orderBy: term ? { postCount: 'desc' } : { lastSeenAt: 'desc' }, take: 40, include: { user: { select: { email: true, name: true } } } })
  const authors = await authorsFor(rows.map((row) => row.userId))
  const groups = await db.forumGroupMember.findMany({ where: { userId: { in: rows.map((row) => row.userId) }, status: 'ACTIVE' }, select: { userId: true, group: { select: { name: true, icon: true } } } })
  return {
    users: rows.map((row) => ({
      userId: row.userId, username: row.username, email: row.user.email, name: row.user.name, author: authors.get(row.userId) || fallbackAuthor(row.userId),
      trustLevel: row.trustLevel, trustLocked: row.trustLocked, title: row.title, postCount: row.postCount, likesReceived: row.likesReceived, lastSeenAt: row.lastSeenAt,
      silencedUntil: row.silencedUntil, suspendedUntil: row.suspendedUntil, moderationNote: row.moderationNote,
      groups: groups.filter((item) => item.userId === row.userId).map((item) => `${item.group.icon} ${item.group.name}`.trim()),
    })),
  }
}

// ------------------------------------------------------------------ writes

/** The team as the admin tab lists it: names and usernames per rank, and each moderator's forums. */
async function teamForAdmin() {
  const ids = await forumTeamIds()
  const authors = await authorsFor([...ids.admins, ...ids.deputies, ...ids.moderators.map((row) => row.userId)])
  const person = (id: number) => { const author = authors.get(id); return author ? { id, name: author.name, username: author.username } : null }
  const present = <T,>(row: T | null): row is T => !!row
  return {
    admins: ids.admins.map(person).filter(present), deputies: ids.deputies.map(person).filter(present),
    moderators: ids.moderators.map((row) => { const who = person(row.userId); return who ? { ...who, categoryIds: row.categoryIds } : null }).filter(present),
  }
}

/** Categories as the admin table shows them: with the usernames of the moderators assigned to each. */
async function categoriesWithModerators() {
  const rows = await db.forumCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { permissions: { select: { groupId: true, level: true } }, moderators: { select: { userId: true }, orderBy: { createdAt: 'asc' } } } })
  const profiles = await db.forumProfile.findMany({ where: { userId: { in: rows.flatMap((row) => row.moderators.map((item) => item.userId)) } }, select: { userId: true, username: true } })
  const names = new Map(profiles.map((row) => [row.userId, row.username]))
  return rows.map((row) => ({ ...row, moderators: row.moderators.map((item) => names.get(item.userId)).filter((name): name is string => !!name) }))
}

/** Usernames typed by the admin, resolved to members; a name that matches nobody stops the save and is named. */
async function moderatorIds(input: unknown): Promise<number[]> {
  const names = [...new Set((Array.isArray(input) ? input : String(input ?? '').split(/[\s,،]+/)).map((name) => String(name).trim().replace(/^@/, '').toLowerCase()).filter(Boolean))].slice(0, 30)
  if (!names.length) return []
  const found = await db.forumProfile.findMany({ where: { username: { in: names }, user: { status: 'ACTIVE' } }, select: { userId: true, username: true } })
  const missing = names.find((name) => !found.some((row) => row.username === name))
  if (missing) throw new ForumError(`کاربری با نام «${missing}» پیدا نشد`, 404)
  return found.map((row) => row.userId)
}

/** 1 for a section (no parent), 2 for a forum inside it. */
const categoryDepth = (category: { parentId: number | null }) => category.parentId ? 2 : 1

async function saveCategory(body: Record<string, any>, creating: boolean) {
  const title = text(body.title, 120)
  if (creating && !title) throw new ForumError('عنوان دسته لازم است')
  const id = Number(body.id) || 0
  const parentId = body.parentId === undefined ? undefined : Number(body.parentId) || null
  if (parentId) {
    if (parentId === id) throw new ForumError('دسته نمی‌تواند زیردستهٔ خودش باشد')
    const parent = await db.forumCategory.findUnique({ where: { id: parentId }, select: { parentId: true, parent: { select: { parentId: true } } } })
    if (!parent) throw new ForumError('دستهٔ والد پیدا نشد', 404)
    // Three levels at most: section, forum, subforum. What is being moved brings its own children along.
    const children = id ? await db.forumCategory.findMany({ where: { parentId: id }, select: { _count: { select: { children: true } } } }) : []
    const height = !children.length ? 1 : children.some((child) => child._count.children > 0) ? 3 : 2
    if (parent.parent?.parentId || categoryDepth(parent) + height > MAX_CATEGORY_DEPTH) throw new ForumError('ساختار انجمن حداکثر سه سطح دارد: بخش، انجمن و زیرانجمن')
  }
  const data = {
    ...(title ? { title } : {}),
    ...(body.slug !== undefined || creating ? { slug: boardSlug(body.slug || body.title) } : {}),
    ...(body.description !== undefined ? { description: text(body.description, 400) } : {}),
    ...(body.icon !== undefined ? { icon: text(body.icon, 8) } : {}),
    ...(body.color !== undefined ? { color: color(body.color) } : {}),
    ...(body.access !== undefined ? { access: body.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC' } : {}),
    ...(body.locked !== undefined ? { locked: body.locked === true } : {}),
    ...(body.sortOrder !== undefined ? { sortOrder: int(body.sortOrder, -999, 999) } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  }
  const moderators = body.moderators === undefined ? null : await moderatorIds(body.moderators)
  return db.$transaction(async (tx) => {
    const category = creating ? await tx.forumCategory.create({ data: data as { title: string; slug: string } }) : await tx.forumCategory.update({ where: { id }, data })
    if (Array.isArray(body.permissions)) {
      const groupIds = new Set((await tx.forumGroup.findMany({ select: { id: true } })).map((group) => group.id))
      const rows = new Map<number, string>()
      for (const row of body.permissions) if (groupIds.has(Number(row?.groupId))) rows.set(Number(row.groupId), normalizeLevel(row.level))
      await tx.forumCategoryPermission.deleteMany({ where: { categoryId: category.id } })
      if (rows.size) await tx.forumCategoryPermission.createMany({ data: [...rows].map(([groupId, level]) => ({ categoryId: category.id, groupId, level })) })
    }
    if (moderators) {
      // Keep the rows of those who stay, so the day they were assigned is not lost.
      await tx.forumCategoryModerator.deleteMany({ where: { categoryId: category.id, userId: { notIn: moderators } } })
      const kept = new Set((await tx.forumCategoryModerator.findMany({ where: { categoryId: category.id }, select: { userId: true } })).map((row) => row.userId))
      const added = moderators.filter((userId) => !kept.has(userId))
      if (added.length) await tx.forumCategoryModerator.createMany({ data: added.map((userId) => ({ categoryId: category.id, userId })) })
    }
    return category
  })
}

async function saveGroup(body: Record<string, any>, creating: boolean) {
  const id = Number(body.id) || 0
  const existing = creating ? null : await db.forumGroup.findUnique({ where: { id } })
  if (!creating && !existing) throw new ForumError('گروه پیدا نشد', 404)
  const name = text(body.name, 60)
  if (creating && name.length < 2) throw new ForumError('نام گروه لازم است')
  const data: Record<string, unknown> = {
    ...(name ? { name } : {}),
    ...(body.description !== undefined ? { description: text(body.description, 1000) } : {}),
    ...(body.icon !== undefined ? { icon: text(body.icon, 8) } : {}),
    ...(body.color !== undefined ? { color: color(body.color) } : {}),
    ...(body.title !== undefined ? { title: text(body.title, 40) } : {}),
  }
  // Automatic groups keep their membership rules; only presentation is editable.
  if (!existing?.automatic) {
    if (body.slug !== undefined || creating) data.slug = groupSlug(body.slug || body.name)
    if (body.visibility !== undefined) data.visibility = ['PUBLIC', 'MEMBERS', 'STAFF'].includes(body.visibility) ? body.visibility : 'PUBLIC'
    if (body.joinMode !== undefined) data.joinMode = ['OPEN', 'REQUEST', 'CLOSED'].includes(body.joinMode) ? body.joinMode : 'CLOSED'
    if (body.moderator !== undefined) data.moderator = body.moderator === true
    if (body.mentionable !== undefined) data.mentionable = body.mentionable === true
  }
  return creating ? db.forumGroup.create({ data: data as { name: string; slug: string } }) : db.forumGroup.update({ where: { id }, data })
}

async function saveBadge(body: Record<string, any>, creating: boolean) {
  const name = text(body.name, 60)
  if (creating && name.length < 2) throw new ForumError('نام نشان لازم است')
  const rule = String(body.rule || '')
  const data = {
    ...(name ? { name } : {}),
    ...(body.slug !== undefined || creating ? { slug: groupSlug(body.slug || `badge-${Date.now().toString(36)}`) } : {}),
    ...(body.description !== undefined ? { description: text(body.description, 300) } : {}),
    ...(body.icon !== undefined ? { icon: text(body.icon, 8) || '🏅' } : {}),
    ...(body.tier !== undefined ? { tier: ['BRONZE', 'SILVER', 'GOLD'].includes(body.tier) ? body.tier : 'BRONZE' } : {}),
    ...(body.rule !== undefined ? { rule: validBadgeRule(rule) ? rule : '' } : {}),
    ...(body.enabled !== undefined ? { enabled: body.enabled === true } : {}),
  }
  const saved = await (creating ? db.forumBadge.create({ data: data as { name: string; slug: string } }) : db.forumBadge.update({ where: { id: Number(body.id) }, data }))
  // A badge with a number of its own goes at once to everybody who already has that number.
  const given = await grantThresholdBadgeToAll(saved.id).catch(() => 0)
  return { ...saved, grantCount: saved.grantCount + given, given }
}

async function moderateUser(actor: AuthedUser, body: Record<string, any>, req: NextRequest) {
  const userId = Number(body.userId)
  const profile = await db.forumProfile.findUnique({ where: { userId } })
  if (!profile) throw new ForumError('کاربر پیدا نشد', 404)
  if (body.silenceDays !== undefined || body.suspendDays !== undefined) {
    const refusal = await accountChangeRefusal(actor, userId, { sensitive: true })
    if (refusal) throw new ForumError(refusal, 403)
  }
  const data: Record<string, unknown> = {}
  if (body.trustLevel !== undefined) { data.trustLevel = int(body.trustLevel, 0, 4); data.trustLocked = body.trustLocked !== false }
  else if (body.trustLocked !== undefined) data.trustLocked = body.trustLocked === true
  if (body.moderationNote !== undefined) data.moderationNote = text(body.moderationNote, 500)
  if (body.title !== undefined) data.title = text(body.title, 40)
  if (body.silenceDays !== undefined || body.suspendDays !== undefined) {
    await replaceForumRestrictions({ req, actor }, userId, {
      ...(body.silenceDays !== undefined ? { silenceDays: int(body.silenceDays, 0, 3650) } : {}),
      ...(body.suspendDays !== undefined ? { suspendDays: int(body.suspendDays, 0, 3650) } : {}),
    }, data)
  } else await db.forumProfile.update({ where: { userId }, data })
  if (data.trustLevel !== undefined) await refreshStats(userId)
  return { userId }
}

/** POST { section, ...fields } creates or runs an action. */
export async function POST(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    const viewer = await viewerFor(g.admin.id)
    let result: unknown
    switch (body.section) {
      case 'categories': result = await saveCategory(body, true); break
      // The forum's team: deputies (moderators of every forum) and the moderators of single forums.
      case 'team':
        if (body.action === 'deputy-add' || body.action === 'deputy-remove') result = await setDeputy(body.username, body.action === 'deputy-add')
        else if (body.action === 'moderator-add' || body.action === 'moderator-remove') result = await setForumModerator(body.username, body.categoryId, body.action === 'moderator-add')
        else throw new ForumError('عملیات نامعتبر است')
        break
      case 'groups': result = await saveGroup(body, true); break
      case 'badges': result = await saveBadge(body, true); break
      case 'members': result = await groupAction(viewer, String(body.slug || ''), { action: body.action, username: body.username }); break
      case 'grant': {
        const profile = await db.forumProfile.findUnique({ where: { username: String(body.username || '').toLowerCase().replace(/^@/, '') } })
        if (!profile) throw new ForumError('کاربر پیدا نشد', 404)
        result = { changed: await setBadge(profile.userId, Number(body.badgeId), body.grant !== false, g.admin.id, text(body.reason, 200)) }
        break
      }
      case 'flags': result = await resolveFlags(viewer, Number(body.postId), body.action === 'disagree' ? 'disagree' : body.action === 'delete' ? 'delete' : 'agree'); break
      case 'review': {
        const { reviewPost } = await import('@/modules/forum/server/moderation')
        result = await reviewPost(viewer, Number(body.postId), body.action === 'reject' ? 'reject' : 'approve', text(body.note, 300))
        break
      }
      default: return err('unknown section', 400)
    }
    await auditAdmin({ req, actor: g.admin, action: `forum.${body.section}.${body.action || 'create'}`, targetType: 'forum', targetId: String(body.slug || body.postId || body.username || ''), metadata: { section: body.section } })
    return ok(result, 201)
  } catch (error) { return failure(error) }
}

/** PATCH { section: categories | groups | badges | users | settings, ... } */
export async function PATCH(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    let result: unknown
    switch (body.section) {
      case 'categories': result = await saveCategory(body, false); break
      case 'groups': result = await saveGroup(body, false); break
      case 'badges': result = await saveBadge(body, false); break
      case 'users': result = await moderateUser(g.admin, body, req); break
      case 'restrictions': {
        if (!['issue', 'revoke'].includes(body.action) || (body.scope !== undefined && body.scope !== 'MODULE') || (body.moduleKey !== undefined && body.moduleKey !== 'forum') || body.resourceType !== undefined || body.resourceId !== undefined || body.capabilities !== undefined) return err('هدف محدودیت انجمن معتبر نیست', 400)
        result = await changeForumRestrictions({ req, actor: g.admin }, { userId: Number(body.userId), operation: body.action, effectKey: body.effectKey, id: Number(body.id) || undefined, days: Number(body.days), startsAt: body.startsAt, reason: typeof body.reason === 'string' ? body.reason : '' })
        return ok(result)
      }
      case 'settings': result = await saveForumSettings(body.settings || {}); break
      default: return err('unknown section', 400)
    }
    await auditAdmin({ req, actor: g.admin, action: `forum.${body.section}.update`, targetType: 'forum', targetId: String(body.id || body.userId || ''), metadata: { section: body.section } })
    return ok(result)
  } catch (error) { return failure(error, body.section === 'restrictions' ? 503 : 400) }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const section = req.nextUrl.searchParams.get('section') || 'categories'
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid id')
  try {
    if (section === 'categories') {
      if (await db.forumThread.count({ where: { categoryId: id } })) return err('این دسته موضوع دارد؛ ابتدا موضوع‌ها را جابه‌جا یا حذف کنید', 409)
      await db.forumCategory.updateMany({ where: { parentId: id }, data: { parentId: null } })
      await db.forumCategory.delete({ where: { id } })
    } else if (section === 'groups') {
      const group = await db.forumGroup.findUnique({ where: { id } })
      if (!group) return err('پیدا نشد', 404)
      if (group.automatic) return err('گروه‌های خودکار حذف نمی‌شوند', 409)
      await db.forumProfile.updateMany({ where: { primaryGroupId: id }, data: { primaryGroupId: null } })
      await db.forumGroup.delete({ where: { id } })
    } else if (section === 'badges') {
      await db.forumBadge.delete({ where: { id } })
    } else return err('unknown section', 400)
    await auditAdmin({ req, actor: g.admin, action: `forum.${section}.delete`, targetType: 'forum', targetId: id })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}
