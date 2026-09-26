import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { parsePermissions } from '@/modules/identity/rbac'
import { getViewer, isMember } from '@/modules/membership/server/membership'
import {
  FORUM_PAGE_SIZE, THREAD_PAGE_SIZE, ForumError, canEdit, canRead, canReply, canStartThread, cleanContent, cleanTitle, excerpt, pageCount,
  type ForumActor,
} from '@/modules/forum/domain/forum'

// Forum service. Every write re-checks access on the server and keeps the
// denormalized counters (board threads/posts, thread replies/last post) in the
// same transaction as the change.

const MODERATOR_PERMISSIONS = ['forum.moderate', 'cms.posts']
const authorSelect = { id: true, name: true, avatarColor: true, role: true, createdAt: true } as const

/** Moderators are admins with forum.moderate or cms.posts (a legacy super admin has everything). */
export async function isModerator(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true, roleId: true, roleRef: { select: { permissions: true } } } }).catch(() => null)
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') return false
  if (user.roleId == null) return true
  const permissions = parsePermissions(user.roleRef?.permissions || '')
  return MODERATOR_PERMISSIONS.some((permission) => permissions.includes(permission))
}

/** The current visitor as a forum actor (server components). */
export const getForumActor = cache(async (): Promise<ForumActor> => {
  const viewer = await getViewer()
  return { userId: viewer.userId, member: viewer.member, moderator: await isModerator(viewer.userId) }
})

/** Same actor for an API request whose user was already authenticated. */
export async function actorFor(userId: number): Promise<ForumActor> {
  const [member, moderator] = await Promise.all([isMember(userId).catch(() => false), isModerator(userId)])
  return { userId, member, moderator }
}

export type AuthorView = { id: number; name: string; avatarColor: string; staff: boolean; joinedAt: Date }
const author = (user: { id: number; name: string; avatarColor: string; role: string; createdAt: Date }): AuthorView =>
  ({ id: user.id, name: user.name || `کاربر ${user.id}`, avatarColor: user.avatarColor, staff: user.role === 'ADMIN', joinedAt: user.createdAt })

// ------------------------------------------------------------------ reading

export async function listBoards(actor: ForumActor) {
  const boards = await db.forumCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }).catch(() => [])
  const latest = await Promise.all(boards.map((board) => canRead(board.access, actor)
    ? db.forumThread.findFirst({ where: { categoryId: board.id, status: 'VISIBLE' }, orderBy: { lastPostAt: 'desc' }, select: { id: true, title: true, lastPostAt: true } })
    : null))
  return boards.map((board, index) => ({
    id: board.id, slug: board.slug, title: board.title, description: board.description, icon: board.icon, access: board.access, locked: board.locked,
    threadCount: board.threadCount, postCount: board.postCount, lastPostAt: board.lastPostAt, readable: canRead(board.access, actor), latest: latest[index],
  }))
}

export async function forumStats() {
  const [threads, posts, members] = await Promise.all([
    db.forumThread.count({ where: { status: 'VISIBLE' } }),
    db.forumPost.count({ where: { status: 'VISIBLE' } }),
    db.forumPost.groupBy({ by: ['userId'], _count: true }).then((rows) => rows.length),
  ]).catch(() => [0, 0, 0])
  return { threads, posts, members }
}

export type ThreadRow = { id: number; title: string; pinned: boolean; locked: boolean; views: number; replyCount: number; lastPostAt: Date; createdAt: Date; author: AuthorView; board?: { slug: string; title: string } }
const threadRow = (row: any): ThreadRow => ({ id: row.id, title: row.title, pinned: row.pinned, locked: row.locked, views: row.views, replyCount: row.replyCount, lastPostAt: row.lastPostAt, createdAt: row.createdAt, author: author(row.user), ...(row.category ? { board: { slug: row.category.slug, title: row.category.title } } : {}) })

export async function getBoard(slug: string, page: number, actor: ForumActor) {
  const board = await db.forumCategory.findUnique({ where: { slug } }).catch(() => null)
  if (!board) return null
  const readable = canRead(board.access, actor)
  const where = { categoryId: board.id, status: 'VISIBLE' }
  const current = Math.max(1, Math.min(1000, page || 1))
  const [threads, total] = readable
    ? await Promise.all([
      db.forumThread.findMany({ where, orderBy: [{ pinned: 'desc' }, { lastPostAt: 'desc' }], skip: (current - 1) * FORUM_PAGE_SIZE, take: FORUM_PAGE_SIZE, include: { user: { select: authorSelect } } }),
      db.forumThread.count({ where }),
    ])
    : [[], 0]
  return {
    board: { id: board.id, slug: board.slug, title: board.title, description: board.description, access: board.access, locked: board.locked, threadCount: board.threadCount },
    readable, canPost: canStartThread(board, actor), threads: threads.map(threadRow), page: current, pages: pageCount(total, FORUM_PAGE_SIZE),
  }
}

export async function getThread(id: number, page: number, actor: ForumActor) {
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const thread = await db.forumThread.findUnique({ where: { id }, include: { category: true, user: { select: authorSelect } } }).catch(() => null)
  if (!thread || (thread.status !== 'VISIBLE' && !actor.moderator)) return null
  const readable = canRead(thread.category.access, actor)
  const postWhere = { threadId: id, ...(actor.moderator ? {} : { status: 'VISIBLE' }) }
  const total = readable ? await db.forumPost.count({ where: postWhere }) : 0
  const pages = pageCount(total, THREAD_PAGE_SIZE)
  const current = Math.max(1, Math.min(pages, page || 1))
  const posts = readable
    ? await db.forumPost.findMany({ where: postWhere, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (current - 1) * THREAD_PAGE_SIZE, take: THREAD_PAGE_SIZE, include: { user: { select: authorSelect } } })
    : []
  if (readable) await db.forumThread.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const firstPostId = readable ? (await db.forumPost.findFirst({ where: { threadId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }))?.id : undefined
  return {
    thread: { id: thread.id, title: thread.title, pinned: thread.pinned, locked: thread.locked, status: thread.status, views: thread.views + 1, replyCount: thread.replyCount, createdAt: thread.createdAt, author: author(thread.user) },
    board: { slug: thread.category.slug, title: thread.category.title, access: thread.category.access },
    readable, canReply: canReply(thread, thread.category, actor), moderator: actor.moderator,
    posts: posts.map((post) => ({ id: post.id, content: post.content, status: post.status, createdAt: post.createdAt, editedAt: post.editedAt, first: post.id === firstPostId, editable: canEdit(post, actor), author: author(post.user) })),
    page: current, pages, description: posts[0] && current === 1 ? excerpt(posts[0].content) : '',
  }
}

/** Latest active threads in public boards (homepage, sidebars). */
export async function recentThreads(limit = 6): Promise<ThreadRow[]> {
  const rows = await db.forumThread.findMany({
    where: { status: 'VISIBLE', category: { access: 'PUBLIC' } }, orderBy: { lastPostAt: 'desc' }, take: Math.max(1, Math.min(20, limit)),
    include: { user: { select: authorSelect }, category: { select: { slug: true, title: true } } },
  }).catch(() => [])
  return rows.map(threadRow)
}

// ------------------------------------------------------------------ writing

function throttle(userId: number, action: 'thread' | 'post', moderator: boolean) {
  if (moderator) return
  const [limit, windowMs] = action === 'thread' ? [5, 60 * 60_000] : [20, 10 * 60_000]
  const burst = rateLimitHit(`forum:${action}:burst:${userId}`, 1, 15_000)
  const window = rateLimitHit(`forum:${action}:${userId}`, limit, windowMs)
  if (!burst.ok || !window.ok) throw new ForumError('کمی صبر کنید و دوباره بفرستید', 429)
}

export async function createThread(actor: ForumActor, input: { categoryId: unknown; title: unknown; content: unknown }) {
  if (!actor.userId) throw new ForumError('برای ارسال باید وارد شوید', 401)
  const categoryId = Number(input.categoryId)
  const board = Number.isSafeInteger(categoryId) ? await db.forumCategory.findUnique({ where: { id: categoryId } }) : null
  if (!board) throw new ForumError('انجمن پیدا نشد', 404)
  if (!canStartThread(board, actor)) throw new ForumError(board.access === 'MEMBERS' && !actor.member ? 'این انجمن مخصوص اعضای ویژه است' : 'ایجاد موضوع در این انجمن مجاز نیست', 403)
  const title = cleanTitle(input.title)
  const content = cleanContent(input.content)
  throttle(actor.userId, 'thread', actor.moderator)
  const now = new Date()
  return db.$transaction(async (tx) => {
    const thread = await tx.forumThread.create({ data: { categoryId: board.id, userId: actor.userId!, title, lastPostAt: now, lastPostUserId: actor.userId } })
    await tx.forumPost.create({ data: { threadId: thread.id, userId: actor.userId!, content, createdAt: now } })
    await tx.forumCategory.update({ where: { id: board.id }, data: { threadCount: { increment: 1 }, postCount: { increment: 1 }, lastPostAt: now } })
    return { id: thread.id }
  })
}

export async function createReply(actor: ForumActor, threadId: number, input: { content: unknown }) {
  if (!actor.userId) throw new ForumError('برای ارسال باید وارد شوید', 401)
  const thread = Number.isSafeInteger(threadId) ? await db.forumThread.findUnique({ where: { id: threadId }, include: { category: true } }) : null
  if (!thread) throw new ForumError('موضوع پیدا نشد', 404)
  if (!canReply(thread, thread.category, actor)) throw new ForumError(thread.locked ? 'این موضوع بسته شده است' : 'پاسخ در این موضوع مجاز نیست', 403)
  const content = cleanContent(input.content)
  throttle(actor.userId, 'post', actor.moderator)
  const now = new Date()
  return db.$transaction(async (tx) => {
    const post = await tx.forumPost.create({ data: { threadId, userId: actor.userId!, content, createdAt: now } })
    await tx.forumThread.update({ where: { id: threadId }, data: { replyCount: { increment: 1 }, lastPostAt: now, lastPostUserId: actor.userId } })
    await tx.forumCategory.update({ where: { id: thread.categoryId }, data: { postCount: { increment: 1 }, lastPostAt: now } })
    const position = await tx.forumPost.count({ where: { threadId, status: 'VISIBLE', OR: [{ createdAt: { lt: now } }, { createdAt: now, id: { lte: post.id } }] } })
    return { id: post.id, page: pageCount(position, THREAD_PAGE_SIZE) }
  })
}

export async function editPost(actor: ForumActor, postId: number, input: { content: unknown }) {
  const post = Number.isSafeInteger(postId) ? await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { include: { category: true } } } }) : null
  if (!post || (post.status !== 'VISIBLE' && !actor.moderator)) throw new ForumError('پیام پیدا نشد', 404)
  if (!canEdit(post, actor) || !canRead(post.thread.category.access, actor)) throw new ForumError('ویرایش این پیام مجاز نیست', 403)
  if (post.thread.locked && !actor.moderator) throw new ForumError('این موضوع بسته شده است', 403)
  const content = cleanContent(input.content)
  await db.forumPost.update({ where: { id: postId }, data: { content, editedAt: new Date() } })
  return { id: postId }
}

// ------------------------------------------------------------------ moderation

/** Recount a thread and its board after posts were hidden or removed. */
async function recount(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], threadId: number, categoryId: number) {
  const visible = await tx.forumPost.findMany({ where: { threadId, status: 'VISIBLE' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { createdAt: true, userId: true }, take: 1 })
  const count = await tx.forumPost.count({ where: { threadId, status: 'VISIBLE' } })
  const thread = await tx.forumThread.findUnique({ where: { id: threadId }, select: { id: true } })
  if (thread) await tx.forumThread.update({ where: { id: threadId }, data: { replyCount: Math.max(0, count - 1), ...(visible[0] ? { lastPostAt: visible[0].createdAt, lastPostUserId: visible[0].userId } : {}) } })
  const [threads, posts, last] = await Promise.all([
    tx.forumThread.count({ where: { categoryId, status: 'VISIBLE' } }),
    tx.forumPost.count({ where: { status: 'VISIBLE', thread: { categoryId, status: 'VISIBLE' } } }),
    tx.forumThread.findFirst({ where: { categoryId, status: 'VISIBLE' }, orderBy: { lastPostAt: 'desc' }, select: { lastPostAt: true } }),
  ])
  await tx.forumCategory.update({ where: { id: categoryId }, data: { threadCount: threads, postCount: posts, lastPostAt: last?.lastPostAt ?? null } })
}

export async function moderateThread(actor: ForumActor, threadId: number, patch: { pinned?: unknown; locked?: unknown; status?: unknown; categoryId?: unknown }) {
  if (!actor.moderator) throw new ForumError('دسترسی مدیریت انجمن ندارید', 403)
  const thread = await db.forumThread.findUnique({ where: { id: threadId } })
  if (!thread) throw new ForumError('موضوع پیدا نشد', 404)
  const data: Record<string, unknown> = {}
  if (typeof patch.pinned === 'boolean') data.pinned = patch.pinned
  if (typeof patch.locked === 'boolean') data.locked = patch.locked
  if (patch.status === 'VISIBLE' || patch.status === 'HIDDEN') data.status = patch.status
  let target = thread.categoryId
  if (patch.categoryId !== undefined) {
    const board = await db.forumCategory.findUnique({ where: { id: Number(patch.categoryId) }, select: { id: true } })
    if (!board) throw new ForumError('انجمن مقصد پیدا نشد', 404)
    data.categoryId = target = board.id
  }
  await db.$transaction(async (tx) => {
    await tx.forumThread.update({ where: { id: threadId }, data })
    await recount(tx, threadId, thread.categoryId)
    if (target !== thread.categoryId) await recount(tx, threadId, target)
  })
  return { id: threadId, ...data }
}

export async function deleteThread(actor: ForumActor, threadId: number) {
  if (!actor.moderator) throw new ForumError('دسترسی مدیریت انجمن ندارید', 403)
  const thread = await db.forumThread.findUnique({ where: { id: threadId }, select: { id: true, categoryId: true, title: true } })
  if (!thread) throw new ForumError('موضوع پیدا نشد', 404)
  await db.$transaction(async (tx) => {
    await tx.forumThread.delete({ where: { id: threadId } })
    await recount(tx, threadId, thread.categoryId)
  })
  return thread
}

export async function moderatePost(actor: ForumActor, postId: number, action: 'hide' | 'show' | 'delete') {
  if (!actor.moderator) throw new ForumError('دسترسی مدیریت انجمن ندارید', 403)
  const post = await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { select: { id: true, categoryId: true } } } })
  if (!post) throw new ForumError('پیام پیدا نشد', 404)
  const first = await db.forumPost.findFirst({ where: { threadId: post.threadId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } })
  if (first?.id === postId && action !== 'show') throw new ForumError('پیام اول موضوع را با پنهان یا حذف‌کردن خود موضوع مدیریت کنید', 409)
  await db.$transaction(async (tx) => {
    if (action === 'delete') await tx.forumPost.delete({ where: { id: postId } })
    else await tx.forumPost.update({ where: { id: postId }, data: { status: action === 'hide' ? 'HIDDEN' : 'VISIBLE' } })
    await recount(tx, post.threadId, post.thread.categoryId)
  })
  return { id: postId, threadId: post.threadId }
}
