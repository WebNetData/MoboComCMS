import { db } from '@/platform/database/prisma'
import { pictureOf } from '@/modules/identity/domain/picture'
import { categoryFamily } from '@/modules/forum/domain/tree'
import { forumRanks } from '@/modules/forum/server/team'
import { canEditPost, categoryAccess, inCategory, levelFor, postLimits, type CategoryAccess, type ForumRank, type Viewer } from '@/modules/forum/domain/community'
import { markdownExcerpt, renderMarkdown } from '@/modules/forum/domain/markdown'
import { FORUM_PAGE_SIZE, THREAD_PAGE_SIZE, pageCount } from '@/modules/forum/domain/forum'
import { ensureProfiles, getForumSettings, getForumViewer, viewerFor } from '@/modules/forum/server/community'
import { censorText, timerDue } from '@/modules/forum/domain/discourse'
import { pollsForPosts, type PollView } from '@/modules/forum/server/polls'

// Forum reads: categories, topic lists, topic view, search and author cards.
// Every query is limited to categories the viewer may see.

export { getForumViewer, viewerFor }

// ------------------------------------------------------------------ authors

export type AuthorView = {
  id: number; username: string; name: string; avatar: string; avatarColor: string; title: string
  trustLevel: number; staff: boolean; joinedAt: Date; flair: { icon: string; color: string; name: string } | null
  /** Posts written and likes received: the author's standing, shown beside every post. */
  posts: number; reputation: number
  /** Their rank in the forum's team, when they have one. */
  rank?: ForumRank
  /** Likes received on their posts, the level that standing gives them, and their latest badges. */
  likes: number
  level: { name: string; icon: string; color: string } | null
  badges: { name: string; icon: string; tier: string }[]
}

/** Author cards (profile, title, flair) for a set of users. */
export async function authorsFor(userIds: number[]): Promise<Map<number, AuthorView>> {
  const ids = [...new Set(userIds)].filter((id) => Number.isSafeInteger(id) && id > 0)
  if (!ids.length) return new Map()
  await ensureProfiles(ids)
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, avatarColor: true, role: true, createdAt: true, forumProfile: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } })
  const groupIds = [...new Set(users.map((user) => user.forumProfile?.primaryGroupId).filter((id): id is number => !!id))]
  const groups = new Map((groupIds.length ? await db.forumGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, icon: true, color: true, name: true } }) : []).map((group) => [group.id, group]))
  const ranks = await forumRanks(ids)
  const [{ levels }, grants] = await Promise.all([
    getForumSettings(),
    db.forumUserBadge.findMany({ where: { userId: { in: ids }, badge: { enabled: true } }, orderBy: { grantedAt: 'desc' }, take: ids.length * 12, select: { userId: true, badge: { select: { name: true, icon: true, tier: true } } } }),
  ])
  const TIER = { GOLD: 0, SILVER: 1, BRONZE: 2 } as Record<string, number>
  const badgesOf = (userId: number) => grants.filter((grant) => grant.userId === userId).map((grant) => grant.badge).sort((a, b) => (TIER[a.tier] ?? 3) - (TIER[b.tier] ?? 3)).slice(0, 4)
  return new Map(users.map((user) => {
    const profile = user.forumProfile
    const level = levelFor(levels, { posts: profile?.postCount ?? 0, likes: profile?.likesReceived ?? 0, reputation: profile?.reputation ?? 0 })
    const group = profile?.primaryGroupId ? groups.get(profile.primaryGroupId) : undefined
    return [user.id, {
      id: user.id, username: profile?.username || `user${user.id}`, name: user.name || profile?.username || `کاربر ${user.id}`,
      avatar: profile?.avatar || pictureOf(user), avatarColor: user.avatarColor, title: profile?.title || '', trustLevel: profile?.trustLevel ?? 0,
      staff: user.role === 'ADMIN', joinedAt: user.createdAt, flair: group ? { icon: group.icon, color: group.color, name: group.name } : null,
      likes: profile?.likesReceived ?? 0, level: level ? { name: level.name, icon: level.icon, color: level.color } : null, badges: badgesOf(user.id),
      posts: profile?.postCount ?? 0, reputation: profile?.reputation ?? 0, ...(ranks.has(user.id) ? { rank: ranks.get(user.id) } : {}),
    }]
  }))
}

export const fallbackAuthor = (id: number): AuthorView => ({ id, username: `user${id}`, name: `کاربر ${id}`, avatar: '', avatarColor: '#64748b', title: '', trustLevel: 0, staff: false, joinedAt: new Date(0), flair: null, posts: 0, reputation: 0, likes: 0, level: null, badges: [] })

// ------------------------------------------------------------------ categories

const loadCategories = () => db.forumCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { permissions: { select: { groupId: true, level: true } } } })

export type CategoryView = { id: number; slug: string; title: string; description: string; icon: string; color: string; parentId: number | null; access: CategoryAccess; threadCount: number; postCount: number; lastPostAt: Date | null; restricted: boolean; vip: boolean; locked: boolean }

// A family is always taken from the list the viewer may see, so a hidden subforum is never part of it.
export { categoryFamily }

/** Categories the viewer can see, with what they may do in each. */
export async function visibleCategories(viewer: Viewer): Promise<CategoryView[]> {
  const rows = await loadCategories().catch(() => [])
  // A section (a top-level category that holds forums) lists them and takes no topics of its own, from anyone.
  const parents = new Set(rows.map((row) => row.parentId))
  const section = (row: { id: number; parentId: number | null }) => row.parentId == null && parents.has(row.id)
  return rows
    .map((row) => ({ row, access: categoryAccess(row, inCategory(viewer, row.id)) }))
    .map(({ row, access }) => ({ row, access: section(row) ? { ...access, create: false } : access }))
    .filter(({ access }) => access.see)
    .map(({ row, access }) => ({
      id: row.id, slug: row.slug, title: row.title, description: row.description, icon: row.icon, color: row.color, parentId: row.parentId, access,
      threadCount: row.threadCount, postCount: row.postCount, lastPostAt: row.lastPostAt, restricted: row.permissions.length > 0, vip: row.access === 'MEMBERS', locked: row.locked,
    }))
}

/** Category index: top-level categories with children and their latest topics. */
export async function categoryIndex(viewer: Viewer) {
  const categories = await visibleCategories(viewer)
  const ids = categories.map((category) => category.id)
  const latest = ids.length ? await db.forumThread.findMany({ where: { categoryId: { in: ids }, status: 'VISIBLE', listed: true }, orderBy: { lastPostAt: 'desc' }, take: 60, select: { id: true, title: true, lastPostAt: true, categoryId: true, replyCount: true } }) : []
  const visibleIds = new Set(ids)
  const tops = categories.filter((category) => !category.parentId || !visibleIds.has(category.parentId))
  return tops.map((category) => {
    const children = categories.filter((child) => child.parentId === category.id)
    const family = categoryFamily(categories, category.id)
    const members = categories.filter((row) => family.includes(row.id))
    return {
      ...category, children,
      topics: members.reduce((sum, row) => sum + row.threadCount, 0),
      posts: members.reduce((sum, row) => sum + row.postCount, 0),
      latest: latest.filter((topic) => family.includes(topic.categoryId)).slice(0, 3),
    }
  })
}

// ------------------------------------------------------------------ topic lists

export type TopicFilter = 'latest' | 'top' | 'new' | 'unread' | 'bookmarks' | 'mine' | 'unanswered' | 'solved'
export const TOPIC_FILTERS: TopicFilter[] = ['latest', 'top', 'new', 'unread', 'bookmarks', 'mine', 'unanswered', 'solved']
export type TopPeriod = 'day' | 'week' | 'month' | 'year' | 'all'
export const TOP_PERIODS: TopPeriod[] = ['day', 'week', 'month', 'year', 'all']
const PERIOD_DAYS: Record<TopPeriod, number> = { day: 1, week: 7, month: 30, year: 365, all: 0 }
const NEW_DAYS = 7
const PERSONAL: TopicFilter[] = ['new', 'unread', 'bookmarks', 'mine']

export type TopicRow = {
  id: number; title: string; excerpt: string; pinned: boolean; locked: boolean; solved: boolean; status: string
  replyCount: number; views: number; likeCount: number; postCount: number; createdAt: Date; lastPostAt: Date
  category: { id: number; slug: string; title: string; color: string; icon: string }; tags: string[]
  author: AuthorView; lastPoster: AuthorView; posters: AuthorView[]; unread: number; isNew: boolean
}

type ThreadRecord = {
  id: number; title: string; pinned: boolean; locked: boolean; solvedPostId: number | null; status: string; replyCount: number; views: number; likeCount: number; postCount: number
  createdAt: Date; lastPostAt: Date; categoryId: number; userId: number; lastPostUserId: number | null; tags: { tag: { name: string } }[]; closeAt?: Date | null
}

export async function topicList(input: { viewer: Viewer; filter?: TopicFilter; categorySlug?: string; tag?: string; period?: TopPeriod; page?: number }) {
  const { viewer } = input
  const filter: TopicFilter = input.filter && TOPIC_FILTERS.includes(input.filter) ? input.filter : 'latest'
  const categories = await visibleCategories(viewer)
  const category = input.categorySlug ? categories.find((c) => c.slug === input.categorySlug) : undefined
  if (input.categorySlug && !category) return null
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  if (PERSONAL.includes(filter) && !viewer.userId) return { filter, category, rows: [] as TopicRow[], page, pages: 1, total: 0, categories }

  const scope = category ? categoryFamily(categories, category.id) : categories.map((c) => c.id)
  // Muted categories drop out of the general lists (still open when browsed directly).
  const muted = viewer.userId && !category ? new Set((await db.forumCategoryUser.findMany({ where: { userId: viewer.userId, level: 'MUTED' }, select: { categoryId: true } })).map((row) => row.categoryId)) : new Set<number>()
  const inScope = ['mine', 'bookmarks'].includes(filter) ? scope : scope.filter((id) => !muted.has(id))
  const where: Record<string, unknown> = { status: 'VISIBLE', categoryId: { in: inScope } }
  // Unlisted topics open by link only; they still show in the member's own lists.
  if (!['mine', 'bookmarks'].includes(filter)) where.listed = true
  if (input.tag) where.tags = { some: { tag: { name: input.tag } } }
  const states = viewer.userId ? await db.forumTopicUser.findMany({ where: { userId: viewer.userId }, select: { threadId: true, lastRead: true, level: true, thread: { select: { postCount: true } } }, orderBy: { lastVisitedAt: 'desc' }, take: 2000 }) : []
  const state = new Map(states.map((row) => [row.threadId, row]))

  let orderBy: Record<string, 'asc' | 'desc'>[] = [{ pinned: 'desc' }, { lastPostAt: 'desc' }]
  if (filter === 'top') {
    const days = PERIOD_DAYS[input.period && TOP_PERIODS.includes(input.period) ? input.period : 'month']
    if (days) where.createdAt = { gte: new Date(Date.now() - days * 86_400_000) }
    orderBy = [{ likeCount: 'desc' }, { replyCount: 'desc' }, { views: 'desc' }]
  }
  if (filter === 'unanswered') { where.replyCount = 0; orderBy = [{ createdAt: 'desc' }] }
  if (filter === 'solved') where.solvedPostId = { not: null }
  if (filter === 'new') {
    where.createdAt = { gte: new Date(Date.now() - NEW_DAYS * 86_400_000) }
    where.topicUsers = { none: { userId: viewer.userId! } }
    orderBy = [{ createdAt: 'desc' }]
  }
  if (filter === 'unread') { where.id = { in: states.filter((row) => row.level !== 'MUTED' && row.lastRead < row.thread.postCount).map((row) => row.threadId) }; orderBy = [{ lastPostAt: 'desc' }] }
  if (filter === 'bookmarks') { where.posts = { some: { bookmarks: { some: { userId: viewer.userId! } } } }; orderBy = [{ lastPostAt: 'desc' }] }
  if (filter === 'mine') { where.OR = [{ userId: viewer.userId! }, { posts: { some: { userId: viewer.userId! } } }]; orderBy = [{ lastPostAt: 'desc' }] }

  const [threads, total] = await Promise.all([
    db.forumThread.findMany({ where, orderBy, skip: (page - 1) * FORUM_PAGE_SIZE, take: FORUM_PAGE_SIZE, include: { tags: { include: { tag: { select: { name: true } } } } } }),
    db.forumThread.count({ where }),
  ]).catch(() => [[], 0] as [ThreadRecord[], number])
  const rows = await decorate(threads, categories, state, viewer)
  return { filter, category, rows, page, pages: pageCount(total, FORUM_PAGE_SIZE), total, categories }
}

async function decorate(threads: ThreadRecord[], categories: CategoryView[], state: Map<number, { lastRead: number; level: string }>, viewer: Viewer): Promise<TopicRow[]> {
  if (!threads.length) return []
  const ids = threads.map((thread) => thread.id)
  const [participants, firstPosts] = await Promise.all([
    db.forumPost.findMany({ where: { threadId: { in: ids }, status: 'VISIBLE' }, distinct: ['threadId', 'userId'], orderBy: { createdAt: 'desc' }, select: { threadId: true, userId: true }, take: ids.length * 12 }),
    db.forumPost.findMany({ where: { threadId: { in: ids }, postNumber: 1 }, select: { threadId: true, content: true } }),
  ])
  const authors = await authorsFor([...threads.map((thread) => thread.userId), ...threads.map((thread) => thread.lastPostUserId || thread.userId), ...participants.map((row) => row.userId)])
  const byId = new Map(categories.map((category) => [category.id, category]))
  const firstText = new Map(firstPosts.map((post) => [post.threadId, post.content]))
  const censored = (await getForumSettings()).watchedWords.censor
  return threads.map((thread) => {
    const category = byId.get(thread.categoryId)
    const posterIds = [thread.userId, ...participants.filter((row) => row.threadId === thread.id && row.userId !== thread.userId).map((row) => row.userId)].slice(0, 5)
    const read = state.get(thread.id)
    return {
      id: thread.id, title: censorText(thread.title, censored), excerpt: censorText(markdownExcerpt(firstText.get(thread.id) || '', 200), censored), pinned: thread.pinned, locked: thread.locked || timerDue(thread.closeAt), solved: !!thread.solvedPostId, status: thread.status,
      replyCount: thread.replyCount, views: thread.views, likeCount: thread.likeCount, postCount: thread.postCount, createdAt: thread.createdAt, lastPostAt: thread.lastPostAt,
      category: category ? { id: category.id, slug: category.slug, title: category.title, color: category.color, icon: category.icon } : { id: 0, slug: '', title: '', color: '#64748b', icon: '' },
      tags: thread.tags.map((row) => row.tag.name),
      author: authors.get(thread.userId) || fallbackAuthor(thread.userId),
      lastPoster: authors.get(thread.lastPostUserId || thread.userId) || fallbackAuthor(thread.userId),
      posters: posterIds.map((id) => authors.get(id) || fallbackAuthor(id)),
      unread: read && read.level !== 'MUTED' ? Math.max(0, thread.postCount - read.lastRead) : 0,
      isNew: !!viewer.userId && !read && Date.now() - new Date(thread.createdAt).getTime() < NEW_DAYS * 86_400_000,
    }
  })
}

/** Counts for the sidebar (new / unread / bookmarks). */
export async function viewerCounts(viewer: Viewer) {
  if (!viewer.userId) return { unread: 0, fresh: 0, bookmarks: 0, messages: 0, review: 0 }
  const categories = (await visibleCategories(viewer)).map((c) => c.id)
  const [states, fresh, bookmarks] = await Promise.all([
    db.forumTopicUser.findMany({ where: { userId: viewer.userId, level: { not: 'MUTED' }, thread: { status: 'VISIBLE', categoryId: { in: categories } } }, select: { lastRead: true, thread: { select: { postCount: true } } }, take: 2000 }),
    db.forumThread.count({ where: { status: 'VISIBLE', categoryId: { in: categories }, createdAt: { gte: new Date(Date.now() - NEW_DAYS * 86_400_000) }, topicUsers: { none: { userId: viewer.userId } } } }),
    db.forumBookmark.count({ where: { userId: viewer.userId } }),
  ]).catch(() => [[], 0, 0] as [{ lastRead: number; thread: { postCount: number } }[], number, number])
  const { unreadMessageCount } = await import('@/modules/forum/server/message-counts')
  const [messages, review] = await Promise.all([unreadMessageCount(viewer.userId).catch(() => 0), viewer.moderator ? db.forumPost.count({ where: { status: 'PENDING' } }).catch(() => 0) : viewer.moderates?.length ? db.forumPost.count({ where: { status: 'PENDING', thread: { categoryId: { in: viewer.moderates } } } }).catch(() => 0) : Promise.resolve(0)])
  return { unread: states.filter((row) => row.lastRead < row.thread.postCount).length, fresh, bookmarks, messages, review }
}

export async function popularTags(viewer: Viewer, take = 20) {
  const categories = (await visibleCategories(viewer)).map((c) => c.id)
  return db.forumTag.findMany({ where: { topicCount: { gt: 0 }, threads: { some: { thread: { status: 'VISIBLE', categoryId: { in: categories } } } } }, orderBy: { topicCount: 'desc' }, take, select: { name: true, topicCount: true } }).catch(() => [])
}

// ------------------------------------------------------------------ topic view

export type PostView = {
  id: number; number: number; html: string; raw: string | null; status: string; createdAt: Date; editedAt: Date | null; editCount: number
  author: AuthorView; replyTo: { number: number; username: string } | null
  reactions: { emoji: string; count: number; mine: boolean }[]; bookmarked: boolean; canEdit: boolean; own: boolean; solution: boolean; flags: number
  wiki: boolean; pendingReason: string; polls: PollView[]
}

/** A topic page: posts (by post number), reactions, bookmarks and what the viewer may do. */
export async function getTopic(id: number, viewer: Viewer, input: { page?: number; post?: number } = {}) {
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const thread = await db.forumThread.findUnique({ where: { id }, include: { category: { include: { permissions: { select: { groupId: true, level: true } }, parent: { select: { slug: true, title: true, color: true } } } }, tags: { include: { tag: true } } } }).catch(() => null)
  if (!thread) return null
  // Inside their own forum an assigned moderator sees and may do what a moderator does.
  viewer = inCategory(viewer, thread.categoryId)
  const access = categoryAccess(thread.category, viewer)
  // A topic waiting for review is visible to its author (with a notice) and staff.
  const ownPending = thread.status === 'PENDING' && !!viewer.userId && thread.userId === viewer.userId
  if (!access.see || (thread.status !== 'VISIBLE' && !viewer.moderator && !ownPending)) return null
  const settings = await getForumSettings()
  const censored = settings.watchedWords.censor
  if (!thread.locked && timerDue(thread.closeAt)) {
    await db.forumThread.updateMany({ where: { id, locked: false }, data: { locked: true, closeAt: null } }).catch(() => undefined)
    thread.locked = true
    thread.closeAt = null
  }
  const postWhere = viewer.moderator ? { threadId: id } : { threadId: id, OR: [{ status: 'VISIBLE' }, ...(viewer.userId ? [{ status: 'PENDING', userId: viewer.userId }] : [])] }
  const total = await db.forumPost.count({ where: postWhere })
  const pages = pageCount(total, THREAD_PAGE_SIZE)
  let page = Math.max(1, Math.min(pages, Number(input.page) || 1))
  if (input.post && Number.isSafeInteger(input.post) && input.post > 0) page = pageCount(await db.forumPost.count({ where: { ...postWhere, postNumber: { lte: input.post } } }), THREAD_PAGE_SIZE)
  const posts = await db.forumPost.findMany({ where: postWhere, orderBy: [{ postNumber: 'asc' }, { id: 'asc' }], skip: (page - 1) * THREAD_PAGE_SIZE, take: THREAD_PAGE_SIZE })
  const postIds = posts.map((post) => post.id)
  const replyIds = posts.map((post) => post.replyToId).filter((value): value is number => !!value)
  const [reactions, mine, bookmarks, replyTargets, participantsRaw, flagRows, solved, state, suggested, polls, categoryLevel] = await Promise.all([
    db.forumReaction.groupBy({ by: ['postId', 'emoji'], where: { postId: { in: postIds } }, _count: { _all: true } }),
    viewer.userId ? db.forumReaction.findMany({ where: { postId: { in: postIds }, userId: viewer.userId }, select: { postId: true, emoji: true } }) : Promise.resolve([]),
    viewer.userId ? db.forumBookmark.findMany({ where: { postId: { in: postIds }, userId: viewer.userId }, select: { postId: true } }) : Promise.resolve([]),
    replyIds.length ? db.forumPost.findMany({ where: { id: { in: replyIds } }, select: { id: true, postNumber: true, userId: true } }) : Promise.resolve([]),
    db.forumPost.groupBy({ by: ['userId'], where: { threadId: id, status: 'VISIBLE' }, _count: { _all: true }, orderBy: { _count: { userId: 'desc' } }, take: 8 }),
    viewer.moderator ? db.forumFlag.groupBy({ by: ['postId'], where: { postId: { in: postIds }, status: 'PENDING' }, _count: { _all: true } }) : Promise.resolve([]),
    thread.solvedPostId ? db.forumPost.findUnique({ where: { id: thread.solvedPostId }, select: { id: true, postNumber: true, content: true, userId: true } }) : Promise.resolve(null),
    viewer.userId ? db.forumTopicUser.findUnique({ where: { userId_threadId: { userId: viewer.userId, threadId: id } } }) : Promise.resolve(null),
    db.forumThread.findMany({ where: { status: 'VISIBLE', listed: true, categoryId: thread.categoryId, id: { not: id } }, orderBy: { lastPostAt: 'desc' }, take: 5, select: { id: true, title: true, replyCount: true, lastPostAt: true } }),
    pollsForPosts(postIds, viewer),
    viewer.userId ? db.forumCategoryUser.findUnique({ where: { userId_categoryId: { userId: viewer.userId, categoryId: thread.categoryId } }, select: { level: true } }) : Promise.resolve(null),
  ])
  const authors = await authorsFor([...posts.map((post) => post.userId), ...replyTargets.map((row) => row.userId), ...participantsRaw.map((row) => row.userId), thread.userId, ...(solved ? [solved.userId] : [])])
  const author = (userId: number) => authors.get(userId) || fallbackAuthor(userId)
  const mineSet = new Set(mine.map((row) => `${row.postId}:${row.emoji}`))
  const bookmarked = new Set(bookmarks.map((row) => row.postId))
  const replyMap = new Map(replyTargets.map((row) => [row.id, { number: row.postNumber, username: author(row.userId).username }]))
  const flagMap = new Map(flagRows.map((row) => [row.postId, row._count._all]))

  // Read position (for unread/new) and view count.
  if (viewer.userId) {
    const lastNumber = posts.length ? posts[posts.length - 1].postNumber : 0
    await db.forumTopicUser.upsert({
      where: { userId_threadId: { userId: viewer.userId, threadId: id } },
      create: { userId: viewer.userId, threadId: id, lastRead: lastNumber, level: thread.userId === viewer.userId ? 'WATCHING' : 'NORMAL' },
      update: { lastRead: Math.max(state?.lastRead ?? 0, lastNumber), lastVisitedAt: new Date() },
    }).catch(() => undefined)
  }
  await db.forumThread.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => undefined)

  const imagesFor = (a: AuthorView) => postLimits(a.trustLevel, settings, a.staff).images
  const editable = (post: { userId: number; createdAt: Date }) => canEditPost(post, viewer, settings.editWindowHours) && (!thread.locked || viewer.moderator)
  return {
    thread: {
      id: thread.id, title: censorText(thread.title, censored), pinned: thread.pinned, locked: thread.locked, status: thread.status, views: thread.views + 1, replyCount: thread.replyCount,
      likeCount: thread.likeCount, postCount: thread.postCount, createdAt: thread.createdAt, lastPostAt: thread.lastPostAt, userId: thread.userId, tags: thread.tags.map((row) => row.tag.name),
      closeAt: thread.closeAt, slowModeSeconds: thread.slowModeSeconds, listed: thread.listed,
      itemType: thread.itemType, itemId: thread.itemId, kind: thread.kind,
    },
    lastRead: state?.lastRead ?? 0,
    categoryLevel: categoryLevel?.level || 'NORMAL',
    category: { id: thread.category.id, slug: thread.category.slug, title: thread.category.title, color: thread.category.color, icon: thread.category.icon, parent: thread.category.parent },
    access, moderator: viewer.moderator, signedIn: !!viewer.userId,
    canSolve: !!viewer.userId && (viewer.moderator || thread.userId === viewer.userId),
    solution: solved ? { id: solved.id, number: solved.postNumber, excerpt: censorText(markdownExcerpt(solved.content, 240), censored), author: author(solved.userId) } : null,
    level: state?.level || (viewer.userId && thread.userId === viewer.userId ? 'WATCHING' : 'NORMAL'),
    participants: participantsRaw.map((row) => ({ ...author(row.userId), posts: row._count._all })),
    suggested,
    posts: posts.map((post): PostView => {
      const a = author(post.userId)
      return {
        id: post.id, number: post.postNumber, html: renderMarkdown(censorText(post.content, censored), { images: imagesFor(a) }), raw: editable(post) ? post.content : null,
        wiki: post.wiki, pendingReason: post.status === 'PENDING' ? post.reviewReason || 'در انتظار تأیید' : '', polls: polls.get(post.id) || [],
        status: post.status, createdAt: post.createdAt, editedAt: post.editedAt, editCount: post.editCount, author: a,
        replyTo: post.replyToId ? replyMap.get(post.replyToId) ?? null : null,
        reactions: settings.reactions.map((emoji) => {
          const count = reactions.find((row) => row.postId === post.id && row.emoji === emoji)?._count._all ?? 0
          return { emoji, count, mine: mineSet.has(`${post.id}:${emoji}`) }
        }).filter((reaction) => reaction.count > 0 || reaction.emoji === 'heart'),
        bookmarked: bookmarked.has(post.id), canEdit: editable(post), own: post.userId === viewer.userId,
        solution: thread.solvedPostId === post.id, flags: flagMap.get(post.id) ?? 0,
      }
    }),
    reactionsAllowed: settings.reactions,
    page, pages, total,
    description: page === 1 && posts[0] ? censorText(markdownExcerpt(posts[0].content, 160), censored) : '',
  }
}

// ------------------------------------------------------------------ search

export async function searchForum(viewer: Viewer, input: { q?: string; page?: number; category?: string }) {
  const q = String(input.q || '').trim().slice(0, 100)
  const page = Math.max(1, Math.min(50, Number(input.page) || 1))
  if (q.length < 2) return { q, results: [], total: 0, page, pages: 1 }
  const categories = await visibleCategories(viewer)
  const scope = input.category ? categories.filter((c) => c.slug === input.category).map((c) => c.id) : categories.map((c) => c.id)
  const where = { status: 'VISIBLE', thread: { status: 'VISIBLE', listed: true, categoryId: { in: scope } }, OR: [{ content: { contains: q } }, { postNumber: 1, thread: { title: { contains: q } } }] }
  const [posts, total] = await Promise.all([
    db.forumPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20, include: { thread: { select: { id: true, title: true, categoryId: true, solvedPostId: true } } } }),
    db.forumPost.count({ where }),
  ])
  const authors = await authorsFor(posts.map((post) => post.userId))
  const byId = new Map(categories.map((category) => [category.id, category]))
  const censored = (await getForumSettings()).watchedWords.censor
  return {
    q, total, page, pages: pageCount(total, 20),
    results: posts.map((post) => {
      const text = censorText(markdownExcerpt(post.content, 100000), censored)
      const at = text.indexOf(q)
      const start = Math.max(0, at - 80)
      return {
        id: post.id, number: post.postNumber, createdAt: post.createdAt, author: authors.get(post.userId) || fallbackAuthor(post.userId),
        topic: { id: post.thread.id, title: post.thread.title, solved: !!post.thread.solvedPostId }, category: byId.get(post.thread.categoryId) ?? null,
        snippet: `${start > 0 ? '…' : ''}${text.slice(start, start + 220)}${text.length > start + 220 ? '…' : ''}`,
      }
    }),
  }
}

// ------------------------------------------------------------------ helpers used by other modules

export type ThreadRow = { id: number; title: string; pinned: boolean; locked: boolean; views: number; replyCount: number; lastPostAt: Date; createdAt: Date; author: { id: number; name: string; avatarColor: string; staff: boolean; joinedAt: Date }; board?: { slug: string; title: string } }

/** Latest active topics anyone can read (homepage showcase). */
export async function recentThreads(limit = 6): Promise<ThreadRow[]> {
  const categories = await visibleCategories(await viewerFor(null))
  const rows = await db.forumThread.findMany({
    where: { status: 'VISIBLE', listed: true, categoryId: { in: categories.map((c) => c.id) } }, orderBy: { lastPostAt: 'desc' }, take: Math.max(1, Math.min(20, limit)),
    include: { user: { select: { id: true, name: true, avatarColor: true, role: true, createdAt: true } }, category: { select: { slug: true, title: true } } },
  }).catch(() => [])
  return rows.map((row) => ({
    id: row.id, title: row.title, pinned: row.pinned, locked: row.locked, views: row.views, replyCount: row.replyCount, lastPostAt: row.lastPostAt, createdAt: row.createdAt,
    author: { id: row.user.id, name: row.user.name || `کاربر ${row.user.id}`, avatarColor: row.user.avatarColor, staff: row.user.role === 'ADMIN', joinedAt: row.user.createdAt },
    board: { slug: row.category.slug, title: row.category.title },
  }))
}

export async function forumStats() {
  const [threads, posts, members, online] = await Promise.all([
    db.forumThread.count({ where: { status: 'VISIBLE' } }),
    db.forumPost.count({ where: { status: 'VISIBLE' } }),
    db.forumProfile.count({ where: { postCount: { gt: 0 } } }),
    db.forumProfile.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 10 * 60_000) } } }),
  ]).catch(() => [0, 0, 0, 0])
  return { threads, posts, members, online }
}
