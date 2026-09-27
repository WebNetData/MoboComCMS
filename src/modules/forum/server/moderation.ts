import { db } from '@/platform/database/prisma'
import { contentChanged } from '@/modules/content/server/events'
import { ForumError, cleanTitle } from '@/modules/forum/domain/forum'
import { categoryAccess, normalizeCategoryLevel, type Viewer } from '@/modules/forum/domain/community'
import { RuleError, SLOW_MODE_CHOICES, normalizeMoveSelection, parseCloseAt } from '@/modules/forum/domain/discourse'
import { markdownExcerpt } from '@/modules/forum/domain/markdown'
import { afterPost, recount } from '@/modules/forum/server/actions'
import { notify, refreshStats } from '@/modules/forum/server/community'
import { authorsFor, fallbackAuthor } from '@/modules/forum/server/forum'

// Staff tools beyond hide/lock: the review queue for held posts, moving
// posts between topics (split / merge), topic timers, slow mode, unlisting,
// wiki posts; plus members' category notification levels.

const requireModerator = (viewer: Viewer) => { if (!viewer.moderator) throw new ForumError('دسترسی مدیریت تالار ندارید', 403) }
const asForumError = (error: unknown) => (error instanceof RuleError ? new ForumError(error.message, error.status) : error)

// ------------------------------------------------------------------ review queue

export async function reviewQueue(viewer: Viewer) {
  requireModerator(viewer)
  const posts = await db.forumPost.findMany({
    where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100,
    include: { thread: { select: { id: true, title: true, status: true, category: { select: { title: true, color: true } } } } },
  })
  const authors = await authorsFor(posts.map((post) => post.userId))
  const counts = await db.forumPost.groupBy({ by: ['userId'], where: { userId: { in: posts.map((post) => post.userId) }, status: 'VISIBLE' }, _count: { _all: true } })
  return posts.map((post) => ({
    id: post.id, number: post.postNumber, content: post.content, excerpt: markdownExcerpt(post.content, 500), reason: post.reviewReason, createdAt: post.createdAt,
    newTopic: post.postNumber === 1, thread: { id: post.thread.id, title: post.thread.title, category: post.thread.category },
    author: authors.get(post.userId) || fallbackAuthor(post.userId), approvedPosts: counts.find((row) => row.userId === post.userId)?._count._all ?? 0,
  }))
}

export const pendingReviewCount = () => db.forumPost.count({ where: { status: 'PENDING' } })

/** Approve (publish, notify, count) or reject (delete) a held post. */
export async function reviewPost(viewer: Viewer, postId: number, decision: 'approve' | 'reject', note = '') {
  requireModerator(viewer)
  const post = await db.forumPost.findUnique({ where: { id: postId }, include: { thread: true } })
  if (!post || post.status !== 'PENDING') throw new ForumError('این پیام در صف بررسی نیست', 404)
  const first = post.postNumber === 1
  if (decision === 'reject') {
    await db.$transaction(async (tx) => {
      if (first) await tx.forumThread.delete({ where: { id: post.threadId } })
      else await tx.forumPost.delete({ where: { id: postId } })
      await recount(tx, post.threadId, post.thread.categoryId)
    })
    await notify(post.userId, 'FORUM_REJECTED', `forum:rejected:${postId}`, 'پیام شما در تالار تأیید نشد', note || `«${post.thread.title}»`, '/forum')
    return { id: postId, decision }
  }
  await db.$transaction(async (tx) => {
    await tx.forumPost.update({ where: { id: postId }, data: { status: 'VISIBLE', reviewReason: '', createdAt: first ? post.createdAt : new Date() } })
    if (first) await tx.forumThread.update({ where: { id: post.threadId }, data: { status: 'VISIBLE', lastPostAt: new Date() } })
    await recount(tx, post.threadId, post.thread.categoryId)
  })
  const { viewerFor } = await import('@/modules/forum/server/community')
  await afterPost(await viewerFor(post.userId), { threadId: post.threadId, title: post.thread.title, number: post.postNumber, content: post.content, categoryId: post.thread.categoryId, replyToUserId: null })
  await notify(post.userId, 'FORUM_APPROVED', `forum:approved:${postId}`, 'پیام شما تأیید و منتشر شد', `«${post.thread.title}»`, `/forum/t/${post.threadId}?post=${post.postNumber}`)
  if (first) contentChanged({ type: 'thread', id: post.threadId }, null, { status: 'VISIBLE', title: post.thread.title })
  return { id: postId, decision }
}

// ------------------------------------------------------------------ move / merge

/**
 * Moves posts to a new topic (split) or an existing one (merge). Moved posts
 * get new numbers at the end of the target; replies that point outside the
 * moved set lose their reply link; a moved solution is unset.
 */
export async function movePosts(viewer: Viewer, threadId: number, input: { postNumbers?: unknown; all?: unknown; target?: unknown; title?: unknown; categoryId?: unknown }) {
  requireModerator(viewer)
  const source = await db.forumThread.findUnique({ where: { id: threadId } })
  if (!source) throw new ForumError('موضوع پیدا نشد', 404)
  const all = input.all === true
  let numbers: number[]
  try {
    numbers = all ? (await db.forumPost.findMany({ where: { threadId }, select: { postNumber: true }, orderBy: { postNumber: 'asc' } })).map((row) => row.postNumber) : normalizeMoveSelection(input.postNumbers)
  } catch (error) { throw asForumError(error) }
  const posts = await db.forumPost.findMany({ where: { threadId, postNumber: { in: numbers } }, orderBy: { postNumber: 'asc' } })
  if (!posts.length) throw new ForumError('پیامی برای انتقال پیدا نشد', 404)
  const targetId = Number(input.target) || 0
  if (targetId === threadId) throw new ForumError('مقصد با موضوع فعلی یکی است')
  const target = targetId ? await db.forumThread.findUnique({ where: { id: targetId } }) : null
  if (targetId && !target) throw new ForumError('موضوع مقصد پیدا نشد', 404)
  let categoryId = source.categoryId
  if (!target && input.categoryId !== undefined) {
    const category = await db.forumCategory.findUnique({ where: { id: Number(input.categoryId) }, select: { id: true } })
    if (!category) throw new ForumError('دستهٔ مقصد پیدا نشد', 404)
    categoryId = category.id
  }
  const title = target ? target.title : cleanTitle(input.title)
  const movedIds = new Set(posts.map((post) => post.id))

  const result = await db.$transaction(async (tx) => {
    const destination = target ?? await tx.forumThread.create({ data: { categoryId, userId: posts[0].userId, title, postCount: 0, lastPostAt: posts[posts.length - 1].createdAt, lastPostUserId: posts[posts.length - 1].userId, createdAt: posts[0].createdAt } })
    let next = destination.postCount
    for (const post of posts) {
      next += 1
      await tx.forumPost.update({ where: { id: post.id }, data: { threadId: destination.id, postNumber: next, replyToId: post.replyToId && movedIds.has(post.replyToId) ? post.replyToId : null } })
    }
    await tx.forumThread.update({ where: { id: destination.id }, data: { postCount: next } })
    if (source.solvedPostId && movedIds.has(source.solvedPostId)) await tx.forumThread.update({ where: { id: source.id }, data: { solvedPostId: null } })
    const remaining = await tx.forumPost.count({ where: { threadId: source.id } })
    if (!remaining) {
      const tags = await tx.forumThreadTag.findMany({ where: { threadId: source.id }, select: { tagId: true } })
      if (tags.length) await tx.forumTag.updateMany({ where: { id: { in: tags.map((row) => row.tagId) } }, data: { topicCount: { decrement: 1 } } })
      await tx.forumThread.delete({ where: { id: source.id } })
    }
    else {
      // Replies left behind that pointed at moved posts lose the link.
      await tx.forumPost.updateMany({ where: { threadId: source.id, replyToId: { in: [...movedIds] } }, data: { replyToId: null } })
      await recount(tx, source.id, source.categoryId)
    }
    await recount(tx, destination.id, destination.categoryId)
    if (!remaining && destination.categoryId !== source.categoryId) await recount(tx, source.id, source.categoryId)
    return { id: destination.id, sourceRemoved: !remaining, moved: posts.length }
  })
  const authors = [...new Set(posts.map((post) => post.userId))]
  void Promise.all(authors.map((id) => refreshStats(id))).catch(() => undefined)
  for (const userId of authors.filter((id) => id !== viewer.userId)) {
    await notify(userId, 'FORUM_MOVED', `forum:moved:${result.id}:${userId}:${Date.now()}`, 'پیام شما به موضوع دیگری منتقل شد', `«${title}»`, `/forum/t/${result.id}`)
  }
  contentChanged({ type: 'thread', id: threadId }, null, null)
  return result
}

// ------------------------------------------------------------------ timers, slow mode, listing, wiki

export async function topicSettings(viewer: Viewer, threadId: number, input: { closeHours?: unknown; closeAt?: unknown; slowMode?: unknown; listed?: unknown }) {
  requireModerator(viewer)
  const thread = await db.forumThread.findUnique({ where: { id: threadId }, select: { id: true } })
  if (!thread) throw new ForumError('موضوع پیدا نشد', 404)
  const data: { closeAt?: Date | null; slowModeSeconds?: number; listed?: boolean } = {}
  try {
    if (input.closeHours !== undefined || input.closeAt !== undefined) data.closeAt = parseCloseAt({ hours: input.closeHours, at: input.closeAt })
  } catch (error) { throw asForumError(error) }
  if (input.slowMode !== undefined) {
    const seconds = Number(input.slowMode)
    if (!SLOW_MODE_CHOICES.includes(seconds)) throw new ForumError('مقدار حالت کند معتبر نیست')
    data.slowModeSeconds = seconds
  }
  if (typeof input.listed === 'boolean') data.listed = input.listed
  const updated = await db.forumThread.update({ where: { id: threadId }, data, select: { id: true, closeAt: true, slowModeSeconds: true, listed: true } })
  contentChanged({ type: 'thread', id: threadId }, null, null)
  return updated
}

/** Staff (and the author from trust level 2) turn a post into a wiki any member from trust level 1 can edit. */
export async function setWiki(viewer: Viewer, postId: number, wiki: boolean) {
  const post = await db.forumPost.findUnique({ where: { id: postId }, select: { id: true, userId: true, status: true } })
  if (!post || post.status !== 'VISIBLE') throw new ForumError('پیام پیدا نشد', 404)
  if (!viewer.moderator && !(post.userId === viewer.userId && viewer.trustLevel >= 2)) throw new ForumError('ویکی کردن این پیام برای شما مجاز نیست', 403)
  await db.forumPost.update({ where: { id: postId }, data: { wiki } })
  return { id: postId, wiki }
}

// ------------------------------------------------------------------ category notification levels

export async function setCategoryLevel(viewer: Viewer, categoryId: number, level: unknown) {
  if (!viewer.userId) throw new ForumError('وارد شوید', 401)
  const category = await db.forumCategory.findUnique({ where: { id: categoryId }, include: { permissions: { select: { groupId: true, level: true } } } })
  if (!category || !categoryAccess(category, viewer).see) throw new ForumError('دسته پیدا نشد', 404)
  const value = normalizeCategoryLevel(level)
  if (value === 'NORMAL') await db.forumCategoryUser.deleteMany({ where: { userId: viewer.userId, categoryId } })
  else await db.forumCategoryUser.upsert({ where: { userId_categoryId: { userId: viewer.userId, categoryId } }, create: { userId: viewer.userId, categoryId, level: value }, update: { level: value } })
  return { categoryId, level: value }
}

export async function categoryLevels(userId: number | null) {
  if (!userId) return new Map<number, string>()
  const rows = await db.forumCategoryUser.findMany({ where: { userId }, select: { categoryId: true, level: true } })
  return new Map(rows.map((row) => [row.categoryId, row.level]))
}
