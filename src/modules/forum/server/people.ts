import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { sniffImage } from '@/shared/files/image-type'
import { ForumError } from '@/modules/forum/domain/forum'
import { TRUST_NAMES, type Viewer } from '@/modules/forum/domain/community'
import { markdownExcerpt, renderMarkdown } from '@/modules/forum/domain/markdown'
import { ensureProfiles, notify, refreshStats } from '@/modules/forum/server/community'
import { profileByUsername, profileCards, relationBetween, updateUserProfile } from '@/modules/identity/server/profile'
import { ProfileError, canFollow } from '@/modules/identity/domain/profile'
import { isModuleEnabled } from '@/extensions/server/modules'
import { authorsFor, fallbackAuthor, visibleCategories } from '@/modules/forum/server/forum'

// Profiles, the member directory, avatars and groups.

// ------------------------------------------------------------------ profiles

export type ProfileTab = 'summary' | 'activity' | 'topics' | 'badges'

/**
 * The member's place in the social layer, read from the one shared identity: followers, following, feed
 * posts and how the viewer stands to them. Null while the social module is off, so the page shows none of it.
 */
async function socialOf(userId: number, viewerId: number | null) {
  if (!await isModuleEnabled('community')) return null
  const card = (await profileCards([userId])).get(userId)
  const found = card ? await profileByUsername(card.username) : null
  if (!found) return null
  const relation = await relationBetween(viewerId, userId)
  return {
    username: found.profile.username, headline: found.profile.headline, verified: found.profile.verified,
    followers: found.profile.followers, following: found.profile.following, posts: found.profile.posts,
    isFollowing: relation.following, followsViewer: relation.followedBy,
    // A visitor is offered the button and sent to sign in; a blocked pair is offered nothing.
    canFollow: !relation.signedIn || canFollow(relation),
  }
}

export async function getProfile(username: string, viewer: Viewer, tab: ProfileTab = 'summary') {
  const profile = await db.forumProfile.findUnique({ where: { username: String(username || '').toLowerCase() }, include: { user: { select: { id: true, name: true, createdAt: true, role: true, status: true, avatarColor: true } } } })
  if (!profile || profile.user.status !== 'ACTIVE') return null
  const userId = profile.userId
  const categories = (await visibleCategories(viewer)).map((c) => c.id)
  const visiblePost = { userId, status: 'VISIBLE', thread: { status: 'VISIBLE', categoryId: { in: categories } } }
  const [social, ahead, author, groups, badges, topTopics, topReplies, activity, topics] = await Promise.all([
    socialOf(userId, viewer.userId).catch(() => null),
    // Standing by reputation among active members; a member nobody has liked yet has no standing.
    profile.reputation > 0 ? db.forumProfile.count({ where: { reputation: { gt: profile.reputation }, user: { status: 'ACTIVE' } } }) : Promise.resolve(-1),
    authorsFor([userId]).then((map) => map.get(userId) || fallbackAuthor(userId)),
    db.forumGroupMember.findMany({ where: { userId, status: 'ACTIVE', group: { visibility: 'PUBLIC', automatic: null } }, include: { group: true } }),
    db.forumUserBadge.findMany({ where: { userId, badge: { enabled: true } }, include: { badge: true }, orderBy: { grantedAt: 'desc' } }),
    tab === 'summary' ? db.forumThread.findMany({ where: { userId, status: 'VISIBLE', categoryId: { in: categories } }, orderBy: [{ likeCount: 'desc' }, { replyCount: 'desc' }], take: 5, select: { id: true, title: true, likeCount: true, replyCount: true, createdAt: true } }) : Promise.resolve([]),
    tab === 'summary' ? db.forumPost.findMany({ where: { ...visiblePost, postNumber: { gt: 1 } }, orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }], take: 5, select: { id: true, postNumber: true, likeCount: true, content: true, thread: { select: { id: true, title: true } } } }) : Promise.resolve([]),
    tab === 'activity' ? db.forumPost.findMany({ where: visiblePost, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, postNumber: true, likeCount: true, content: true, createdAt: true, thread: { select: { id: true, title: true } } } }) : Promise.resolve([]),
    tab === 'topics' ? db.forumThread.findMany({ where: { userId, status: 'VISIBLE', categoryId: { in: categories } }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, title: true, replyCount: true, views: true, likeCount: true, createdAt: true, solvedPostId: true } }) : Promise.resolve([]),
  ])
  const now = Date.now()
  return {
    author, own: viewer.userId === userId, staffView: viewer.moderator, social, rank: ahead < 0 ? null : ahead + 1,
    profile: {
      userId, username: profile.username, bio: profile.bio, bioHtml: renderMarkdown(profile.bio, { images: false }), location: profile.location, website: profile.website, cover: profile.cover,
      trustLevel: profile.trustLevel, trustName: TRUST_NAMES[profile.trustLevel] || '', joinedAt: profile.user.createdAt, lastSeenAt: profile.lastSeenAt,
      stats: { reputation: profile.reputation, daysVisited: profile.daysVisited, topicsEntered: profile.topicsEntered, topicCount: profile.topicCount, postCount: profile.postCount, likesGiven: profile.likesGiven, likesReceived: profile.likesReceived, solvedCount: profile.solvedCount },
      silenced: !!profile.silencedUntil && profile.silencedUntil.getTime() > now, suspended: !!profile.suspendedUntil && profile.suspendedUntil.getTime() > now,
      silencedUntil: profile.silencedUntil, suspendedUntil: profile.suspendedUntil, primaryGroupId: profile.primaryGroupId, title: profile.title,
    },
    groups: groups.map((row) => ({ id: row.group.id, slug: row.group.slug, name: row.group.name, icon: row.group.icon, color: row.group.color, title: row.group.title, owner: row.owner })),
    badges: badges.map((row) => ({ slug: row.badge.slug, name: row.badge.name, icon: row.badge.icon, tier: row.badge.tier, description: row.badge.description, grantedAt: row.grantedAt })),
    topTopics, activity: activity.map((post) => ({ ...post, excerpt: markdownExcerpt(post.content, 220), content: undefined })),
    topReplies: topReplies.map((post) => ({ ...post, excerpt: markdownExcerpt(post.content, 160), content: undefined })),
    topics,
  }
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').trim().slice(0, max)

/**
 * Own profile edit. The public identity (username, bio, location, website,
 * avatar, cover) is the unified member profile; titles and the primary
 * group stay forum-only and come from the user's groups (or staff).
 */
export async function updateProfile(viewer: Viewer, input: Record<string, unknown>) {
  if (!viewer.userId) throw new ForumError('وارد شوید', 401)
  await ensureProfiles([viewer.userId])
  const profile = await db.forumProfile.findUnique({ where: { userId: viewer.userId } })
  if (!profile) throw new ForumError('پروفایل پیدا نشد', 404)
  const identity = Object.fromEntries(['username', 'bio', 'location', 'website', 'avatar', 'cover'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]))
  if (Object.keys(identity).length) {
    try { await updateUserProfile(viewer.userId, identity) } catch (error) {
      if (error instanceof ProfileError) throw new ForumError(error.message, error.status)
      throw error
    }
  }
  const data: Record<string, unknown> = {}
  if (input.primaryGroupId !== undefined || input.title !== undefined) {
    const memberships = await db.forumGroupMember.findMany({ where: { userId: viewer.userId, status: 'ACTIVE' }, include: { group: { select: { id: true, title: true } } } })
    if (input.primaryGroupId !== undefined) {
      const groupId = Number(input.primaryGroupId) || null
      if (groupId && !memberships.some((row) => row.groupId === groupId)) throw new ForumError('عضو این گروه نیستید', 403)
      data.primaryGroupId = groupId
    }
    if (input.title !== undefined) {
      const title = clean(input.title, 40)
      const allowed = viewer.moderator || !title || memberships.some((row) => row.group.title === title) || await db.forumUserBadge.count({ where: { userId: viewer.userId, badge: { name: title } } }) > 0
      if (!allowed) throw new ForumError('این عنوان را فقط از گروه‌ها یا نشان‌های خودتان می‌توانید انتخاب کنید', 403)
      data.title = title
    }
  }
  const updated = Object.keys(data).length ? await db.forumProfile.update({ where: { userId: viewer.userId }, data }) : await db.forumProfile.findUniqueOrThrow({ where: { userId: viewer.userId } })
  void refreshStats(viewer.userId).catch(() => undefined)
  return { username: updated.username }
}

// ------------------------------------------------------------------ media (avatars, covers)

const MEDIA_DIR = () => join(process.cwd(), 'storage', 'forum')
const MAX_BYTES = 3 * 1024 * 1024

export async function saveProfileImage(userId: number, file: File | null) {
  if (!rateLimitHit(`forum:upload:${userId}`, 20, 3_600_000).ok) throw new ForumError('تعداد بارگذاری زیاد است؛ کمی بعد تلاش کنید', 429)
  if (!file || !file.size) throw new ForumError('تصویری انتخاب نشده است')
  if (file.size > MAX_BYTES) throw new ForumError('حجم تصویر حداکثر ۳ مگابایت است', 413)
  const bytes = Buffer.from(await file.arrayBuffer())
  const type = sniffImage(bytes)
  if (!type) throw new ForumError('فقط تصویر PNG، JPEG یا WebP مجاز است')
  const name = `${randomUUID()}.${type.extension}`
  await mkdir(MEDIA_DIR(), { recursive: true })
  await writeFile(join(MEDIA_DIR(), name), bytes, { flag: 'wx', mode: 0o644 })
  return { url: `/api/forum/media/${name}` }
}

export async function readProfileImage(name: string) {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return null
  try {
    const bytes = await readFile(join(MEDIA_DIR(), name))
    return { bytes, type: name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }
  } catch { return null }
}

export async function removeProfileImage(name: string) {
  if (/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) await unlink(join(MEDIA_DIR(), name)).catch(() => undefined)
}

// ------------------------------------------------------------------ directory & mentions

export type DirectorySort = 'likesReceived' | 'postCount' | 'topicCount' | 'solvedCount' | 'daysVisited' | 'recent'

/** The member directory. With a viewer it can be narrowed to one group, among the groups that viewer may see. */
export async function userDirectory(input: { sort?: string; q?: string; page?: number; group?: string }, viewer?: Viewer) {
  const sorts: DirectorySort[] = ['likesReceived', 'postCount', 'topicCount', 'solvedCount', 'daysVisited', 'recent']
  const sort = sorts.includes(input.sort as DirectorySort) ? input.sort as DirectorySort : 'likesReceived'
  const page = Math.max(1, Math.min(200, Number(input.page) || 1))
  const q = clean(input.q, 40).toLowerCase()
  const groups = viewer ? await listGroups(viewer, 0) : []
  const group = groups.find((row) => row.slug === clean(input.group, 80)) || null
  // Quiet accounts stay out of the plain list, but a group shows all of its members.
  const where = {
    user: { status: 'ACTIVE', ...(group ? { forumGroups: { some: { groupId: group.id, status: 'ACTIVE' } } } : {}) },
    ...(q ? { username: { contains: q } } : group ? {} : { OR: [{ postCount: { gt: 0 } }, { daysVisited: { gt: 0 } }] }),
  }
  const [rows, total] = await Promise.all([
    db.forumProfile.findMany({ where, orderBy: sort === 'recent' ? { lastSeenAt: 'desc' } : [{ [sort === 'likesReceived' ? 'reputation' : sort]: 'desc' }, { postCount: 'desc' }], skip: (page - 1) * 30, take: 30 }),
    db.forumProfile.count({ where }),
  ])
  const authors = await authorsFor(rows.map((row) => row.userId))
  return {
    sort, q, page, pages: Math.max(1, Math.ceil(total / 30)), total,
    group: group ? { slug: group.slug, name: group.name, color: group.color } : null,
    groups: groups.filter((row) => row.memberCount > 0).map((row) => ({ slug: row.slug, name: row.name, color: row.color, memberCount: row.memberCount })),
    users: rows.map((row) => ({ author: authors.get(row.userId) || fallbackAuthor(row.userId), reputation: row.reputation, likesReceived: row.likesReceived, likesGiven: row.likesGiven, postCount: row.postCount, topicCount: row.topicCount, solvedCount: row.solvedCount, daysVisited: row.daysVisited, lastSeenAt: row.lastSeenAt })),
  }
}

/** Username prefix search for @mention autocomplete. */
export async function mentionSearch(q: string) {
  const term = clean(q, 20).toLowerCase().replace(/^@/, '')
  if (!/^[a-z0-9_]{1,20}$/.test(term)) return []
  const rows = await db.forumProfile.findMany({ where: { username: { startsWith: term }, user: { status: 'ACTIVE' } }, orderBy: { postCount: 'desc' }, take: 8, select: { userId: true } })
  const authors = await authorsFor(rows.map((row) => row.userId))
  return rows.map((row) => authors.get(row.userId)!).filter(Boolean).map((a) => ({ username: a.username, name: a.name, avatar: a.avatar, avatarColor: a.avatarColor }))
}

// ------------------------------------------------------------------ groups

const groupVisible = (group: { visibility: string }, viewer: Viewer, isMember: boolean) =>
  group.visibility === 'PUBLIC' || viewer.moderator || (group.visibility === 'MEMBERS' && isMember)

/** Groups this viewer may see, each with the first few of its members to show as faces. */
export async function listGroups(viewer: Viewer, faces = 5) {
  // Clubs are groups too, but they have a page of their own and are not listed among the user groups.
  const groups = await db.forumGroup.findMany({ where: { clubCategoryId: null, OR: [{ automatic: null }, { automatic: { in: ['staff', 'vip'] } }] }, orderBy: [{ automatic: 'asc' }, { memberCount: 'desc' }, { name: 'asc' }] })
  const mine = viewer.userId ? await db.forumGroupMember.findMany({ where: { userId: viewer.userId }, select: { groupId: true, status: true, owner: true } }) : []
  const state = new Map(mine.map((row) => [row.groupId, row]))
  const visible = groups.filter((group) => groupVisible(group, viewer, state.get(group.id)?.status === 'ACTIVE'))
  // Members are read only for groups that passed the visibility rule above: owners first, then the earliest.
  const first = faces > 0 ? await Promise.all(visible.map((group) => db.forumGroupMember.findMany({ where: { groupId: group.id, status: 'ACTIVE', user: { status: 'ACTIVE' } }, orderBy: [{ owner: 'desc' }, { createdAt: 'asc' }], take: faces, select: { userId: true } }))) : []
  const authors = await authorsFor(first.flat().map((row) => row.userId))
  return visible
    .map((group, index) => ({ faces: (first[index] || []).map((row) => authors.get(row.userId) || fallbackAuthor(row.userId)), id: group.id, slug: group.slug, name: group.name, description: group.description, icon: group.icon, color: group.color, title: group.title, automatic: group.automatic, joinMode: group.joinMode, memberCount: group.memberCount, membership: state.get(group.id) ?? null }))
}

export async function getGroup(slug: string, viewer: Viewer, page = 1) {
  const group = await db.forumGroup.findUnique({ where: { slug } })
  if (!group || (group.automatic && !['staff', 'vip'].includes(group.automatic))) return null
  const membership = viewer.userId ? await db.forumGroupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: viewer.userId } } }) : null
  if (!groupVisible(group, viewer, membership?.status === 'ACTIVE')) return null
  const manager = viewer.moderator || !!membership?.owner
  const current = Math.max(1, Number(page) || 1)
  const [members, total, requests] = await Promise.all([
    db.forumGroupMember.findMany({ where: { groupId: group.id, status: 'ACTIVE' }, orderBy: [{ owner: 'desc' }, { createdAt: 'asc' }], skip: (current - 1) * 48, take: 48, select: { userId: true, owner: true, createdAt: true } }),
    db.forumGroupMember.count({ where: { groupId: group.id, status: 'ACTIVE' } }),
    manager ? db.forumGroupMember.findMany({ where: { groupId: group.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50, select: { userId: true, createdAt: true } }) : Promise.resolve([]),
  ])
  const authors = await authorsFor([...members.map((row) => row.userId), ...requests.map((row) => row.userId)])
  const categories = await visibleCategories(viewer)
  const permissions = await db.forumCategoryPermission.findMany({ where: { groupId: group.id, categoryId: { in: categories.map((c) => c.id) } }, select: { categoryId: true, level: true } })
  return {
    group: { id: group.id, slug: group.slug, name: group.name, description: group.description, descriptionHtml: renderMarkdown(group.description, { images: false }), icon: group.icon, color: group.color, title: group.title, automatic: group.automatic, joinMode: group.joinMode, memberCount: total, visibility: group.visibility },
    membership, manager, page: current, pages: Math.max(1, Math.ceil(total / 48)),
    members: members.map((row) => ({ ...(authors.get(row.userId) || fallbackAuthor(row.userId)), owner: row.owner, since: row.createdAt })),
    requests: requests.map((row) => ({ ...(authors.get(row.userId) || fallbackAuthor(row.userId)), since: row.createdAt })),
    categories: permissions.map((row) => ({ ...categories.find((c) => c.id === row.categoryId)!, level: row.level })),
  }
}

async function recountGroup(groupId: number) {
  const count = await db.forumGroupMember.count({ where: { groupId, status: 'ACTIVE' } })
  await db.forumGroup.update({ where: { id: groupId }, data: { memberCount: count } })
}

/** join / leave / request / cancel for the viewer; accept / deny / remove / add / owner for managers. */
export async function groupAction(viewer: Viewer, slug: string, input: { action?: unknown; username?: unknown }) {
  if (!viewer.userId) throw new ForumError('وارد شوید', 401)
  const group = await db.forumGroup.findUnique({ where: { slug } })
  if (!group || group.automatic) throw new ForumError('گروه پیدا نشد', 404)
  const action = String(input.action || '')
  const membership = await db.forumGroupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: viewer.userId } } })
  const manager = viewer.moderator || !!membership?.owner
  if (!rateLimitHit(`forum:group:${viewer.userId}`, 60, 3_600_000).ok) throw new ForumError('کمی صبر کنید', 429)

  if (action === 'join' || action === 'request') {
    if (membership) throw new ForumError(membership.status === 'PENDING' ? 'درخواست شما در انتظار بررسی است' : 'عضو این گروه هستید', 409)
    if (group.joinMode === 'CLOSED' && !viewer.moderator) throw new ForumError('عضویت در این گروه فقط با دعوت مدیران است', 403)
    const status = group.joinMode === 'OPEN' || viewer.moderator ? 'ACTIVE' : 'PENDING'
    await db.forumGroupMember.create({ data: { groupId: group.id, userId: viewer.userId, status } })
    if (status === 'PENDING') {
      const owners = await db.forumGroupMember.findMany({ where: { groupId: group.id, owner: true, status: 'ACTIVE' }, select: { userId: true } })
      for (const owner of owners) await notify(owner.userId, 'FORUM_GROUP', `forum:group:${group.id}:request:${viewer.userId}`, `درخواست عضویت در «${group.name}»`, 'یک کاربر درخواست عضویت داده است.', `/forum/g/${group.slug}`)
    }
    await recountGroup(group.id)
    return { status }
  }
  if (action === 'leave' || action === 'cancel') {
    if (!membership) throw new ForumError('عضو این گروه نیستید', 409)
    await db.forumGroupMember.delete({ where: { id: membership.id } })
    await db.forumProfile.updateMany({ where: { userId: viewer.userId, primaryGroupId: group.id }, data: { primaryGroupId: null } })
    await recountGroup(group.id)
    return { status: 'NONE' }
  }
  if (!manager) throw new ForumError('فقط مدیران گروه این کار را انجام می‌دهند', 403)
  const target = await db.forumProfile.findUnique({ where: { username: String(input.username || '').toLowerCase().replace(/^@/, '') }, select: { userId: true } })
  if (!target) throw new ForumError('کاربر پیدا نشد', 404)
  const row = await db.forumGroupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: target.userId } } })
  if (action === 'add') {
    if (row?.status === 'ACTIVE') throw new ForumError('این کاربر عضو گروه است', 409)
    await db.forumGroupMember.upsert({ where: { groupId_userId: { groupId: group.id, userId: target.userId } }, create: { groupId: group.id, userId: target.userId }, update: { status: 'ACTIVE' } })
    await notify(target.userId, 'FORUM_GROUP', `forum:group:${group.id}:added:${target.userId}`, `به گروه «${group.name}» اضافه شدید ${group.icon}`, group.description, `/forum/g/${group.slug}`)
  } else if (action === 'accept' || action === 'deny') {
    if (row?.status !== 'PENDING') throw new ForumError('درخواستی پیدا نشد', 404)
    if (action === 'accept') {
      await db.forumGroupMember.update({ where: { id: row.id }, data: { status: 'ACTIVE' } })
      await notify(target.userId, 'FORUM_GROUP', `forum:group:${group.id}:accepted:${target.userId}`, `عضویت شما در «${group.name}» پذیرفته شد`, '', `/forum/g/${group.slug}`)
    } else await db.forumGroupMember.delete({ where: { id: row.id } })
  } else if (action === 'remove') {
    if (!row) throw new ForumError('این کاربر عضو گروه نیست', 404)
    await db.forumGroupMember.delete({ where: { id: row.id } })
    await db.forumProfile.updateMany({ where: { userId: target.userId, primaryGroupId: group.id }, data: { primaryGroupId: null } })
  } else if (action === 'owner' || action === 'unowner') {
    if (!row || row.status !== 'ACTIVE') throw new ForumError('این کاربر عضو گروه نیست', 404)
    await db.forumGroupMember.update({ where: { id: row.id }, data: { owner: action === 'owner' } })
    // A club's forum is moderated by its owners.
    if (group.clubCategoryId) await (await import('@/modules/forum/server/clubs')).syncClubModerators(group.id)
  } else throw new ForumError('عملیات نامعتبر')
  await recountGroup(group.id)
  return { ok: true }
}

/** Categories a group grants, for the admin UI summary. */
export async function groupCategoryAccess(groupId: number) {
  const rows = await db.forumCategoryPermission.findMany({ where: { groupId }, include: { category: { select: { id: true, title: true } } } })
  return rows.map((row) => ({ categoryId: row.category.id, title: row.category.title, level: row.level }))
}


// ------------------------------------------------------------------ badges & editor data

/** Enabled badges plus the ids the viewer already owns. */
export async function listBadges(viewer: Viewer) {
  const [badges, mine] = await Promise.all([
    db.forumBadge.findMany({ where: { enabled: true }, orderBy: [{ grantCount: 'desc' }, { id: 'asc' }] }),
    viewer.userId ? db.forumUserBadge.findMany({ where: { userId: viewer.userId }, select: { badgeId: true } }) : Promise.resolve([]),
  ])
  return { badges, owned: new Set(mine.map((row) => row.badgeId)) }
}

export const findBadge = (slug: string) => db.forumBadge.findFirst({ where: { slug, enabled: true } })

/** A badge with its most recent holders. */
export async function getBadge(slug: string) {
  const badge = await findBadge(slug)
  if (!badge) return null
  const grants = await db.forumUserBadge.findMany({ where: { badgeId: badge.id }, orderBy: { grantedAt: 'desc' }, take: 96 })
  const authors = await authorsFor(grants.map((row) => row.userId))
  return { badge, holders: grants.map((row) => ({ id: row.id, grantedAt: row.grantedAt, author: authors.get(row.userId) || fallbackAuthor(row.userId) })) }
}

/** The signed-in member's own profile with the groups and titles they may pick from. */
export async function profileForEdit(userId: number) {
  const profile = await db.forumProfile.findUnique({ where: { userId }, include: { user: { select: { name: true, avatarColor: true } } } })
  if (!profile) return null
  const [groups, badges] = await Promise.all([
    db.forumGroupMember.findMany({ where: { userId, status: 'ACTIVE' }, include: { group: { select: { id: true, name: true, icon: true, title: true } } } }),
    db.forumUserBadge.findMany({ where: { userId }, include: { badge: { select: { name: true } } } }),
  ])
  return {
    profile,
    groups: groups.map((row) => ({ id: row.group.id, name: `${row.group.icon} ${row.group.name}`.trim() })),
    titles: [...new Set([...groups.map((row) => row.group.title), ...badges.map((row) => row.badge.name)].filter(Boolean))],
  }
}

/** Minimal identity for the forum top bar. */
export const shellIdentity = (userId: number) =>
  db.forumProfile.findUnique({ where: { userId }, select: { username: true, avatar: true, user: { select: { name: true, avatarColor: true } } } })
