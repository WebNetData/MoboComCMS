import type { Prisma } from '@prisma/client'
import { contentChanged } from '@/modules/content/server/events'
import { db } from '@/platform/database/prisma'
import { completeOwnerCase } from '@/modules/moderation/server/cases'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { logEvent } from '@/platform/observability/logger'
import { ForumError, cleanContent, cleanTitle } from '@/modules/forum/domain/forum'
import {
  canEditPost, categoryAccess, flagWeight, normalizeFlagReason, normalizeNotificationLevel, normalizeTags, postLimits, type Viewer,
  inCategory, moderatesAnything, moderatesCategory,
} from '@/modules/forum/domain/community'
import { countLinks, extractMentions, markdownExcerpt } from '@/modules/forum/domain/markdown'
import { getForumSettings, notify, refreshStats } from '@/modules/forum/server/community'
import { contentVerdict, formatWait, slowModeWait, timerDue } from '@/modules/forum/domain/discourse'
import { checkPolls, syncPolls } from '@/modules/forum/server/polls'
import { parseItemKey } from '@/modules/content/domain/items'
import { itemCard } from '@/modules/content/server/registry'
import { ENTITY_TOPIC_TYPES, publicEntityCategoryIds } from '@/modules/forum/server/related'

// Forum writes. Every action re-checks access on the server, keeps counters in
// the same transaction as the change, and sends notifications afterwards so a
// notification failure never undoes a post.

type Tx = Prisma.TransactionClient

const categoryWithPermissions = (id: number) => db.forumCategory.findUnique({ where: { id }, include: { permissions: { select: { groupId: true, level: true } } } })

function throttle(viewer: Viewer, action: 'topic' | 'post' | 'react' | 'flag') {
  if (viewer.moderator) return
  const limits = { topic: [5, 3_600_000], post: [30, 600_000], react: [120, 600_000], flag: [20, 86_400_000] } as const
  const [limit, windowMs] = limits[action]
  const burst = action === 'topic' || action === 'post' ? rateLimitHit(`forum:${action}:burst:${viewer.userId}`, 1, 10_000) : { ok: true }
  const window = rateLimitHit(`forum:${action}:${viewer.userId}`, limit, windowMs)
  if (!burst.ok || !window.ok) throw new ForumError('کمی صبر کنید و دوباره تلاش کنید', 429)
}

function requireUser(viewer: Viewer) {
  if (!viewer.userId) throw new ForumError('برای این کار باید وارد شوید', 401)
  if (viewer.suspended) throw new ForumError('حساب شما در تالار موقتاً تعلیق شده است', 403)
  if (viewer.silenced) throw new ForumError('امکان ارسال پیام برای حساب شما موقتاً بسته شده است', 403)
  return viewer.userId
}

async function checkContent(viewer: Viewer, content: string) {
  const settings = await getForumSettings()
  const limits = postLimits(viewer.trustLevel, settings, viewer.moderator)
  if (countLinks(content) > limits.maxLinks) throw new ForumError(`کاربران تازه‌وارد حداکثر ${limits.maxLinks.toLocaleString('fa-IR')} لینک در هر پیام می‌توانند بگذارند`, 422)
  await checkPolls(viewer, content)
}

/** Watched words and new-member approval: publish, send to the review queue, or refuse. */
async function verdictFor(viewer: Viewer, text: string) {
  const settings = await getForumSettings()
  const approvedPosts = !viewer.moderator && viewer.trustLevel === 0 && settings.approveNewUserPosts > 0
    ? await db.forumPost.count({ where: { userId: viewer.userId!, status: 'VISIBLE' } })
    : 0
  const verdict = contentVerdict({ text, viewer, approvedPosts, settings })
  if (verdict.action === 'block') throw new ForumError(`متن شما شامل واژهٔ غیرمجاز «${verdict.word}» است؛ آن را اصلاح کنید`, 422)
  return verdict
}

/** A due topic timer closes the topic the first time anyone touches it. */
export async function applyTimer(thread: { id: number; locked: boolean; closeAt: Date | null }) {
  if (thread.locked || !timerDue(thread.closeAt)) return thread.locked
  await db.forumThread.updateMany({ where: { id: thread.id, locked: false }, data: { locked: true, closeAt: null } }).catch(() => undefined)
  return true
}

async function applyTags(tx: Tx, threadId: number, names: string[], viewer: Viewer) {
  const settings = await getForumSettings()
  const existing = await tx.forumTag.findMany({ where: { name: { in: names } } })
  const missing = names.filter((name) => !existing.some((tag) => tag.name === name))
  if (missing.length && !viewer.moderator && (!settings.membersCreateTags || viewer.trustLevel < 1)) throw new ForumError(`برچسب «${missing[0]}» وجود ندارد و فقط کاربران با سطح اعتماد ۱ به بالا برچسب تازه می‌سازند`, 422)
  const created = await Promise.all(missing.map((name) => tx.forumTag.create({ data: { name } })))
  const tags = [...existing, ...created]
  const current = await tx.forumThreadTag.findMany({ where: { threadId }, select: { tagId: true } })
  const keep = new Set(tags.map((tag) => tag.id))
  const removed = current.filter((row) => !keep.has(row.tagId)).map((row) => row.tagId)
  const added = tags.filter((tag) => !current.some((row) => row.tagId === tag.id)).map((tag) => tag.id)
  if (removed.length) {
    await tx.forumThreadTag.deleteMany({ where: { threadId, tagId: { in: removed } } })
    await tx.forumTag.updateMany({ where: { id: { in: removed } }, data: { topicCount: { decrement: 1 } } })
  }
  if (added.length) {
    await tx.forumThreadTag.createMany({ data: added.map((tagId) => ({ threadId, tagId })) })
    await tx.forumTag.updateMany({ where: { id: { in: added } }, data: { topicCount: { increment: 1 } } })
  }
}

// ------------------------------------------------------------------ topics & replies

export async function createTopic(viewer: Viewer, input: { categoryId: unknown; title: unknown; content: unknown; tags?: unknown; item?: unknown; kind?: unknown }) {
  const userId = requireUser(viewer)
  const category = await categoryWithPermissions(Number(input.categoryId)).catch(() => null)
  if (!category) throw new ForumError('دسته‌بندی پیدا نشد', 404)
  viewer = inCategory(viewer, category.id)
  const access = categoryAccess(category, viewer)
  // A section only holds forums; topics are written in the forums under it.
  if (access.see && await isSection(category)) throw new ForumError('در «بخش» نمی‌توان موضوع ساخت؛ یکی از انجمن‌های آن را انتخاب کنید', 409)
  if (!access.create) throw new ForumError(access.see ? 'ایجاد موضوع در این دسته برای شما مجاز نیست' : 'دسته‌بندی پیدا نشد', access.see ? 403 : 404)
  const ref = input.item == null || input.item === '' ? null : parseItemKey(input.item)
  if (input.item && (!ref || !ENTITY_TOPIC_TYPES.includes(ref.type as (typeof ENTITY_TOPIC_TYPES)[number]) || !await itemCard(ref))) throw new ForumError('مورد مرتبط در دسترس نیست', 404)
  if (ref && !(await publicEntityCategoryIds()).includes(category.id)) throw new ForumError('موضوع مرتبط باید در یک دسته‌بندی عمومی ثبت شود', 422)
  const kind = ref && input.kind === 'QUESTION' ? 'QUESTION' : 'DISCUSSION'
  const title = cleanTitle(input.title)
  const content = cleanContent(input.content)
  const settings = await getForumSettings()
  const tags = normalizeTags(input.tags, settings.maxTagsPerTopic)
  await checkContent(viewer, content)
  const verdict = await verdictFor(viewer, `${title}\n${content}`)
  const pending = verdict.action === 'review'
  throttle(viewer, 'topic')
  if (!viewer.moderator && viewer.trustLevel === 0) {
    const today = await db.forumThread.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } })
    if (today >= settings.newUserTopicsPerDay) throw new ForumError(`کاربران تازه‌وارد روزانه حداکثر ${settings.newUserTopicsPerDay.toLocaleString('fa-IR')} موضوع می‌سازند`, 429)
  }
  const now = new Date()
  const thread = await db.$transaction(async (tx) => {
    const created = await tx.forumThread.create({ data: { categoryId: category.id, userId, title, lastPostAt: now, lastPostUserId: userId, postCount: 1, status: pending ? 'PENDING' : 'VISIBLE', itemType: ref?.type, itemId: ref?.id, kind } })
    const first = await tx.forumPost.create({ data: { threadId: created.id, userId, content, postNumber: 1, createdAt: now, status: pending ? 'PENDING' : 'VISIBLE', reviewReason: pending ? verdict.reason : '' } })
    await syncPolls(tx, first.id, content)
    if (tags.length) await applyTags(tx, created.id, tags, viewer)
    if (!pending) await tx.forumCategory.update({ where: { id: category.id }, data: { threadCount: { increment: 1 }, postCount: { increment: 1 }, lastPostAt: now } })
    await tx.forumTopicUser.create({ data: { userId, threadId: created.id, lastRead: 1, level: 'WATCHING' } })
    return created
  })
  if (pending) return { id: thread.id, pending: true }
  await afterPost(viewer, { threadId: thread.id, title, number: 1, content, categoryId: category.id, replyToUserId: null })
  contentChanged({ type: 'thread', id: thread.id }, null, { status: 'VISIBLE', title: thread.title })
  return { id: thread.id, pending: false }
}

export async function createReply(viewer: Viewer, threadId: number, input: { content: unknown; replyToId?: unknown }) {
  const userId = requireUser(viewer)
  const thread = Number.isSafeInteger(threadId) ? await db.forumThread.findUnique({ where: { id: threadId }, include: { category: { include: { permissions: { select: { groupId: true, level: true } } } } } }) : null
  if (thread) viewer = inCategory(viewer, thread.categoryId)
  if (!thread || (thread.status !== 'VISIBLE' && !viewer.moderator)) throw new ForumError('موضوع پیدا نشد', 404)
  const access = categoryAccess(thread.category, viewer)
  if (!access.see) throw new ForumError('موضوع پیدا نشد', 404)
  if (!access.reply) throw new ForumError('پاسخ در این دسته برای شما مجاز نیست', 403)
  const locked = await applyTimer(thread)
  if (locked && !viewer.moderator) throw new ForumError('این موضوع بسته شده است', 403)
  if (thread.slowModeSeconds && !viewer.moderator) {
    const last = await db.forumPost.findFirst({ where: { threadId, userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    const wait = slowModeWait(thread.slowModeSeconds, last?.createdAt ?? null)
    if (wait) throw new ForumError(`این موضوع در حالت کند است؛ ${formatWait(wait)} دیگر می‌توانید پاسخ بدهید`, 429)
  }
  const content = cleanContent(input.content)
  await checkContent(viewer, content)
  const verdict = await verdictFor(viewer, content)
  const pending = verdict.action === 'review'
  const replyToId = Number(input.replyToId) || null
  const replyTo = replyToId ? await db.forumPost.findFirst({ where: { id: replyToId, threadId, status: 'VISIBLE' }, select: { id: true, userId: true } }) : null
  throttle(viewer, 'post')
  const now = new Date()
  const post = await db.$transaction(async (tx) => {
    // The increment locks the topic row, so concurrent replies get distinct numbers.
    // A post held for review takes a number but does not bump the topic until approved.
    const updated = await tx.forumThread.update({ where: { id: threadId }, data: pending ? { postCount: { increment: 1 } } : { postCount: { increment: 1 }, replyCount: { increment: 1 }, lastPostAt: now, lastPostUserId: userId } })
    const created = await tx.forumPost.create({ data: { threadId, userId, content, postNumber: updated.postCount, replyToId: replyTo?.id ?? null, createdAt: now, status: pending ? 'PENDING' : 'VISIBLE', reviewReason: pending ? verdict.reason : '' } })
    await syncPolls(tx, created.id, content)
    if (!pending) await tx.forumCategory.update({ where: { id: thread.categoryId }, data: { postCount: { increment: 1 }, lastPostAt: now } })
    const state = await tx.forumTopicUser.findUnique({ where: { userId_threadId: { userId, threadId } } })
    await tx.forumTopicUser.upsert({
      where: { userId_threadId: { userId, threadId } },
      create: { userId, threadId, lastRead: created.postNumber, level: 'TRACKING' },
      update: { lastRead: created.postNumber, lastVisitedAt: now, ...(state && state.level === 'NORMAL' ? { level: 'TRACKING' } : {}) },
    })
    return created
  })
  if (pending) return { id: post.id, number: post.postNumber, pending: true }
  await afterPost(viewer, { threadId, title: thread.title, number: post.postNumber, content, categoryId: thread.categoryId, replyToUserId: replyTo?.userId ?? null })
  return { id: post.id, number: post.postNumber, pending: false }
}

async function viewerCanSee(userId: number, categoryId: number) {
  const [{ viewerFor }, category] = await Promise.all([import('@/modules/forum/server/community'), categoryWithPermissions(categoryId)])
  if (!category) return false
  return categoryAccess(category, await viewerFor(userId)).see
}

/** Notifications (reply, watching, mentions) and stats after a new post. */
export async function afterPost(viewer: Viewer, post: { threadId: number; title: string; number: number; content: string; categoryId: number; replyToUserId: number | null }) {
  const actorId = viewer.userId!
  const actor = await db.forumProfile.findUnique({ where: { userId: actorId }, select: { username: true } })
  const who = `@${actor?.username || 'user'}`
  const href = `/forum/t/${post.threadId}?post=${post.number}`
  const excerpt = markdownExcerpt(post.content, 140)
  const notified = new Set<number>([actorId])
  try {
    if (post.replyToUserId && !notified.has(post.replyToUserId)) {
      notified.add(post.replyToUserId)
      await notify(post.replyToUserId, 'FORUM_REPLY', `forum:${post.threadId}:${post.number}:reply`, `${who} به پیام شما پاسخ داد`, `«${post.title}»: ${excerpt}`, href)
    }
    const mentioned = extractMentions(post.content)
    if (mentioned.length) {
      const profiles = await db.forumProfile.findMany({ where: { username: { in: mentioned } }, select: { userId: true } })
      for (const profile of profiles) {
        if (notified.has(profile.userId) || !await viewerCanSee(profile.userId, post.categoryId)) continue
        notified.add(profile.userId)
        await notify(profile.userId, 'FORUM_MENTION', `forum:${post.threadId}:${post.number}:mention:${profile.userId}`, `${who} از شما نام برد`, `«${post.title}»: ${excerpt}`, href)
      }
    }
    const muted = new Set((await db.forumTopicUser.findMany({ where: { threadId: post.threadId, level: 'MUTED' }, select: { userId: true } })).map((row) => row.userId))
    if (post.number > 1) {
      const watchers = await db.forumTopicUser.findMany({ where: { threadId: post.threadId, level: 'WATCHING', userId: { notIn: [...notified] } }, select: { userId: true }, take: 300 })
      for (const watcher of watchers) {
        notified.add(watcher.userId)
        await notify(watcher.userId, 'FORUM_POSTED', `forum:${post.threadId}:${post.number}:watch:${watcher.userId}`, `پاسخ تازه در «${post.title}»`, `${who}: ${excerpt}`, href)
      }
    }
    // Category watchers: every post (WATCHING) or new topics only (WATCHING_FIRST).
    const levels = post.number === 1 ? ['WATCHING', 'WATCHING_FIRST'] : ['WATCHING']
    const categoryWatchers = await db.forumCategoryUser.findMany({ where: { categoryId: post.categoryId, level: { in: levels }, userId: { notIn: [...notified] } }, select: { userId: true }, take: 300 })
    for (const watcher of categoryWatchers) {
      if (muted.has(watcher.userId) || !await viewerCanSee(watcher.userId, post.categoryId)) continue
      notified.add(watcher.userId)
      if (post.number === 1) await notify(watcher.userId, 'FORUM_NEW_TOPIC', `forum:${post.threadId}:new:${watcher.userId}`, `موضوع تازه: «${post.title}»`, `${who}: ${excerpt}`, href)
      else await notify(watcher.userId, 'FORUM_POSTED', `forum:${post.threadId}:${post.number}:watch:${watcher.userId}`, `پاسخ تازه در «${post.title}»`, `${who}: ${excerpt}`, href)
    }
    await refreshStats(actorId)
    const category = await db.forumCategory.findUnique({ where: { id: post.categoryId }, include: { permissions: { select: { groupId: true } } } })
    if (category && !category.permissions.length && category.access === 'PUBLIC') {
      const { queueIndexNow } = await import('@/modules/seo/server/indexnow')
      queueIndexNow([`/forum/t/${post.threadId}`])
    }
  } catch (error) {
    logEvent('warn', 'forum.after_post_failed', { threadId: post.threadId, error })
  }
}

// ------------------------------------------------------------------ editing

export async function editPost(viewer: Viewer, postId: number, input: { content?: unknown; title?: unknown; tags?: unknown; categoryId?: unknown }) {
  requireUser(viewer)
  const post = Number.isSafeInteger(postId) ? await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { include: { category: { include: { permissions: { select: { groupId: true, level: true } } } } } } } }) : null
  const everywhere = viewer
  if (post) viewer = inCategory(viewer, post.thread.categoryId)
  if (!post || (post.status !== 'VISIBLE' && !viewer.moderator)) throw new ForumError('پیام پیدا نشد', 404)
  const settings = await getForumSettings()
  if (!categoryAccess(post.thread.category, viewer).see) throw new ForumError('پیام پیدا نشد', 404)
  if (!canEditPost(post, viewer, settings.editWindowHours)) throw new ForumError('مهلت ویرایش این پیام تمام شده یا اجازهٔ ویرایش ندارید', 403)
  if (post.thread.locked && !viewer.moderator) throw new ForumError('این موضوع بسته شده است', 403)
  const content = input.content === undefined ? post.content : cleanContent(input.content)
  if (content !== post.content) { await checkContent(viewer, content); await verdictFor(viewer, content) }
  const first = post.postNumber === 1
  const title = first && input.title !== undefined ? cleanTitle(input.title) : undefined
  const tags = first && input.tags !== undefined ? normalizeTags(input.tags, settings.maxTagsPerTopic) : undefined
  let categoryId: number | undefined
  if (first && input.categoryId !== undefined && Number(input.categoryId) !== post.thread.categoryId) {
    const target = await categoryWithPermissions(Number(input.categoryId))
    // The way in is judged by who they are in the forum they move it to, not the one they move it from.
    if (!target || !categoryAccess(target, inCategory(everywhere, target.id)).create || await isSection(target)) throw new ForumError('انتقال به این دسته مجاز نیست', 403)
    categoryId = target.id
  }
  await db.$transaction(async (tx) => {
    if (content !== post.content) {
      await tx.forumPostRevision.create({ data: { postId, userId: viewer.userId!, content: post.content } })
      await tx.forumPost.update({ where: { id: postId }, data: { content, editedAt: new Date(), editCount: { increment: 1 } } })
      await syncPolls(tx, postId, content)
    }
    if (title !== undefined || categoryId !== undefined) await tx.forumThread.update({ where: { id: post.threadId }, data: { ...(title !== undefined ? { title } : {}), ...(categoryId !== undefined ? { categoryId } : {}) } })
    if (tags) await applyTags(tx, post.threadId, tags, viewer)
    if (categoryId !== undefined) { await recount(tx, post.threadId, post.thread.categoryId); await recount(tx, post.threadId, categoryId) }
  })
  const added = extractMentions(content).filter((name) => !extractMentions(post.content).includes(name))
  if (added.length) await afterMentions(viewer, post.threadId, post.postNumber, post.thread.title, content, categoryId ?? post.thread.categoryId, added)
  return { id: postId }
}

async function afterMentions(viewer: Viewer, threadId: number, number: number, title: string, content: string, categoryId: number, names: string[]) {
  const actor = await db.forumProfile.findUnique({ where: { userId: viewer.userId! }, select: { username: true } })
  const profiles = await db.forumProfile.findMany({ where: { username: { in: names }, userId: { not: viewer.userId! } }, select: { userId: true } })
  for (const profile of profiles) {
    if (!await viewerCanSee(profile.userId, categoryId)) continue
    await notify(profile.userId, 'FORUM_MENTION', `forum:${threadId}:${number}:mention:${profile.userId}`, `@${actor?.username} از شما نام برد`, `«${title}»: ${markdownExcerpt(content, 140)}`, `/forum/t/${threadId}?post=${number}`)
  }
}

export async function postRevisions(viewer: Viewer, postId: number) {
  const post = await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { include: { category: { include: { permissions: { select: { groupId: true, level: true } } } } } } } })
  if (post) viewer = inCategory(viewer, post.thread.categoryId)
  if (!post || (post.status !== 'VISIBLE' && !viewer.moderator) || !categoryAccess(post.thread.category, viewer).see) throw new ForumError('پیام پیدا نشد', 404)
  const revisions = await db.forumPostRevision.findMany({ where: { postId }, orderBy: { createdAt: 'desc' }, take: 30 })
  const editors = new Map((await db.forumProfile.findMany({ where: { userId: { in: revisions.map((row) => row.userId) } }, select: { userId: true, username: true } })).map((row) => [row.userId, row.username]))
  return { current: post.content, revisions: revisions.map((row) => ({ id: row.id, content: row.content, createdAt: row.createdAt, editor: editors.get(row.userId) || '' })) }
}

// ------------------------------------------------------------------ reactions, bookmarks, flags, solutions

async function visiblePost(viewer: Viewer, postId: number) {
  const post = Number.isSafeInteger(postId) ? await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { include: { category: { include: { permissions: { select: { groupId: true, level: true } } } } } } } }) : null
  if (!post || post.status !== 'VISIBLE' || post.thread.status !== 'VISIBLE' || !categoryAccess(post.thread.category, inCategory(viewer, post.thread.categoryId)).see) throw new ForumError('پیام پیدا نشد', 404)
  return post
}

export async function react(viewer: Viewer, postId: number, emoji: string, on: boolean) {
  const userId = requireUser(viewer)
  const settings = await getForumSettings()
  if (!settings.reactions.includes(emoji)) throw new ForumError('این واکنش مجاز نیست')
  const post = await visiblePost(viewer, postId)
  if (post.userId === userId) throw new ForumError('به پیام خودتان نمی‌توانید واکنش بدهید', 403)
  throttle(viewer, 'react')
  if (on) await db.forumReaction.create({ data: { postId, userId, emoji } }).catch((error: { code?: string }) => { if (error?.code !== 'P2002') throw error })
  else await db.forumReaction.deleteMany({ where: { postId, userId, emoji } })
  const [postLikes, threadLikes] = await Promise.all([db.forumReaction.count({ where: { postId } }), db.forumReaction.count({ where: { post: { threadId: post.threadId } } })])
  await db.$transaction([db.forumPost.update({ where: { id: postId }, data: { likeCount: postLikes } }), db.forumThread.update({ where: { id: post.threadId }, data: { likeCount: threadLikes } })])
  if (on) {
    const actor = await db.forumProfile.findUnique({ where: { userId }, select: { username: true } })
    await notify(post.userId, 'FORUM_REACTION', `forum:react:${postId}:${userId}`, `@${actor?.username} به پیام شما واکنش نشان داد`, `«${post.thread.title}»`, `/forum/t/${post.threadId}?post=${post.postNumber}`)
  }
  void Promise.all([refreshStats(userId), refreshStats(post.userId)]).catch(() => undefined)
  const counts = await db.forumReaction.groupBy({ by: ['emoji'], where: { postId }, _count: { _all: true } })
  const mine = await db.forumReaction.findMany({ where: { postId, userId }, select: { emoji: true } })
  return { reactions: counts.map((row) => ({ emoji: row.emoji, count: row._count._all, mine: mine.some((m) => m.emoji === row.emoji) })) }
}

export async function bookmark(viewer: Viewer, postId: number, on: boolean) {
  const userId = requireUser(viewer)
  await visiblePost(viewer, postId)
  if (on) await db.forumBookmark.create({ data: { userId, postId } }).catch((error: { code?: string }) => { if (error?.code !== 'P2002') throw error })
  else await db.forumBookmark.deleteMany({ where: { userId, postId } })
  return { bookmarked: on }
}

export async function flag(viewer: Viewer, postId: number, input: { reason?: unknown; note?: unknown }) {
  const userId = requireUser(viewer)
  const post = await visiblePost(viewer, postId)
  if (post.userId === userId) throw new ForumError('پیام خودتان را نمی‌توانید گزارش کنید', 403)
  const reason = normalizeFlagReason(input.reason)
  const note = String(input.note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 500)
  if (reason === 'OTHER' && note.length < 5) throw new ForumError('دلیل گزارش را کوتاه توضیح دهید')
  throttle(viewer, 'flag')
  const weight = flagWeight(viewer.trustLevel, viewer.moderator)
  const created = await db.forumFlag.create({ data: { postId, userId, reason, note, weight } }).catch((error: { code?: string }) => { if (error?.code === 'P2002') return null; throw error })
  if (!created) throw new ForumError('این پیام را قبلاً گزارش کرده‌اید', 409)
  const settings = await getForumSettings()
  const total = await db.forumFlag.aggregate({ where: { postId, status: 'PENDING' }, _sum: { weight: true } })
  let hidden = false
  if ((total._sum.weight ?? 0) >= settings.flagHideWeight) {
    await db.$transaction(async (tx) => {
      if (post.postNumber === 1) await tx.forumThread.update({ where: { id: post.threadId }, data: { status: 'HIDDEN' } })
      else await tx.forumPost.update({ where: { id: postId }, data: { status: 'HIDDEN' } })
      await recount(tx, post.threadId, post.thread.categoryId)
    })
    hidden = true
    await notify(post.userId, 'FORUM_HIDDEN', `forum:hidden:${postId}`, 'پیام شما با گزارش کاربران پنهان شد', 'تیم تالار آن را بررسی می‌کند. اگر فکر می‌کنید اشتباه شده، با پشتیبانی تماس بگیرید.', `/forum/t/${post.threadId}`)
    void refreshStats(post.userId).catch(() => undefined)
  }
  return { flagged: true, hidden }
}

export async function setSolution(viewer: Viewer, postId: number, on: boolean) {
  const userId = requireUser(viewer)
  const post = await visiblePost(viewer, postId)
  if (!moderatesCategory(viewer, post.thread.categoryId) && post.thread.userId !== userId) throw new ForumError('فقط نویسندهٔ موضوع یا ناظران راه‌حل را انتخاب می‌کنند', 403)
  if (post.postNumber === 1) throw new ForumError('پیام اول موضوع نمی‌تواند راه‌حل باشد')
  const previous = post.thread.solvedPostId
  await db.forumThread.update({ where: { id: post.threadId }, data: { solvedPostId: on ? postId : null } })
  if (on && previous !== postId) {
    await notify(post.userId, 'FORUM_SOLVED', `forum:solved:${postId}`, 'پاسخ شما به‌عنوان راه‌حل انتخاب شد ✅', `«${post.thread.title}»`, `/forum/t/${post.threadId}?post=${post.postNumber}`)
  }
  const affected = [post.userId]
  if (previous && previous !== postId) {
    const old = await db.forumPost.findUnique({ where: { id: previous }, select: { userId: true } })
    if (old) affected.push(old.userId)
  }
  void Promise.all(affected.map((id) => refreshStats(id))).catch(() => undefined)
  return { solved: on }
}

export async function setTopicState(viewer: Viewer, threadId: number, input: { level?: unknown }) {
  const userId = requireUser(viewer)
  const thread = await db.forumThread.findUnique({ where: { id: threadId }, include: { category: { include: { permissions: { select: { groupId: true, level: true } } } } } })
  if (!thread || !categoryAccess(thread.category, inCategory(viewer, thread.categoryId)).see) throw new ForumError('موضوع پیدا نشد', 404)
  const level = normalizeNotificationLevel(input.level)
  await db.forumTopicUser.upsert({ where: { userId_threadId: { userId, threadId } }, create: { userId, threadId, level }, update: { level } })
  return { level }
}

// ------------------------------------------------------------------ moderation

/** Recount a topic and its category after posts were hidden, moved or removed. */
export async function recount(tx: Tx, threadId: number, categoryId: number) {
  const thread = await tx.forumThread.findUnique({ where: { id: threadId }, select: { id: true } })
  if (thread) {
    const [count, last] = await Promise.all([
      tx.forumPost.count({ where: { threadId, status: 'VISIBLE' } }),
      tx.forumPost.findFirst({ where: { threadId, status: 'VISIBLE' }, orderBy: [{ postNumber: 'desc' }], select: { createdAt: true, userId: true } }),
    ])
    await tx.forumThread.update({ where: { id: threadId }, data: { replyCount: Math.max(0, count - 1), ...(last ? { lastPostAt: last.createdAt, lastPostUserId: last.userId } : {}) } })
  }
  const [threads, posts, latest] = await Promise.all([
    tx.forumThread.count({ where: { categoryId, status: 'VISIBLE' } }),
    tx.forumPost.count({ where: { status: 'VISIBLE', thread: { categoryId, status: 'VISIBLE' } } }),
    tx.forumThread.findFirst({ where: { categoryId, status: 'VISIBLE' }, orderBy: { lastPostAt: 'desc' }, select: { lastPostAt: true } }),
  ])
  await tx.forumCategory.update({ where: { id: categoryId }, data: { threadCount: threads, postCount: posts, lastPostAt: latest?.lastPostAt ?? null } })
}

/** Moderation of a topic or post is allowed to whoever moderates the forum it is in. */
const requireModerator = (viewer: Viewer, categoryId: number) => { if (!moderatesCategory(viewer, categoryId)) throw new ForumError('دسترسی مدیریت این انجمن را ندارید', 403) }
/** A section is a top-level category that holds forums: it lists them and takes no topics of its own. */
const isSection = async (category: { id: number; parentId: number | null }) => category.parentId == null && await db.forumCategory.count({ where: { parentId: category.id } }) > 0
/** Whether a moderator may move a topic into this forum: one they moderate, or one they could post in anyway. */
async function mayMoveInto(viewer: Viewer, categoryId: number) {
  const target = await categoryWithPermissions(categoryId)
  if (!target) throw new ForumError('دستهٔ مقصد پیدا نشد', 404)
  if (await isSection(target)) throw new ForumError('موضوع را به یکی از انجمن‌های این بخش منتقل کنید، نه خود بخش', 409)
  if (!moderatesCategory(viewer, target.id) && !categoryAccess(target, viewer).create) throw new ForumError('انتقال به این انجمن برای شما مجاز نیست', 403)
  return target.id
}

/**
 * A moderator hiding or showing content has answered the flags waiting on it. Left pending, they
 * keep the item in the flag queue and their weight still counts, so one more flag would hide
 * again what a moderator had just restored.
 */
async function settleFlags(tx: Tx, viewer: Viewer, where: Prisma.ForumFlagWhereInput, agreed: boolean) {
  const flags = await tx.forumFlag.findMany({ where: { ...where, status: 'PENDING' }, select: { id: true } })
  await tx.forumFlag.updateMany({ where: { ...where, status: 'PENDING' }, data: { status: agreed ? 'AGREED' : 'DISAGREED', handledBy: viewer.userId, handledAt: new Date() } })
  for (const flag of flags) await completeOwnerCase(tx, 'forum-flags', flag.id, viewer.userId!, agreed ? 'approve' : 'reject')
}

export async function moderateThread(viewer: Viewer, threadId: number, patch: { pinned?: unknown; locked?: unknown; status?: unknown; categoryId?: unknown }) {
  const thread = await db.forumThread.findUnique({ where: { id: threadId } })
  if (!thread || !moderatesAnything(viewer)) throw new ForumError(thread ? 'دسترسی مدیریت تالار ندارید' : 'موضوع پیدا نشد', thread ? 403 : 404)
  requireModerator(viewer, thread.categoryId)
  const data: Record<string, unknown> = {}
  if (typeof patch.pinned === 'boolean') data.pinned = patch.pinned
  if (typeof patch.locked === 'boolean') data.locked = patch.locked
  if (patch.status === 'VISIBLE' || patch.status === 'HIDDEN') data.status = patch.status
  let target = thread.categoryId
  if (patch.categoryId !== undefined) {
    if (Number(patch.categoryId) !== thread.categoryId) data.categoryId = target = await mayMoveInto(viewer, Number(patch.categoryId))
  }
  await db.$transaction(async (tx) => {
    await tx.forumThread.update({ where: { id: threadId }, data })
    // A topic is flagged through its first post; replies keep their own flags.
    if (data.status && data.status !== thread.status) await settleFlags(tx, viewer, { post: { threadId, postNumber: 1 } }, data.status === 'HIDDEN')
    await recount(tx, threadId, thread.categoryId)
    if (target !== thread.categoryId) await recount(tx, threadId, target)
  })
  void refreshStats(thread.userId).catch(() => undefined)
  contentChanged({ type: 'thread', id: threadId }, null, null)
  return { id: threadId, ...data }
}

export async function deleteThread(viewer: Viewer, threadId: number) {
  const thread = await db.forumThread.findUnique({ where: { id: threadId }, select: { id: true, categoryId: true, title: true, userId: true, tags: { select: { tagId: true } } } })
  if (!thread || !moderatesAnything(viewer)) throw new ForumError(thread ? 'دسترسی مدیریت تالار ندارید' : 'موضوع پیدا نشد', thread ? 403 : 404)
  requireModerator(viewer, thread.categoryId)
  const authors = await db.forumPost.findMany({ where: { threadId }, distinct: ['userId'], select: { userId: true } })
  await db.$transaction(async (tx) => {
    if (thread.tags.length) await tx.forumTag.updateMany({ where: { id: { in: thread.tags.map((row) => row.tagId) } }, data: { topicCount: { decrement: 1 } } })
    await tx.forumThread.delete({ where: { id: threadId } })
    await recount(tx, threadId, thread.categoryId)
  })
  void Promise.all(authors.map((row) => refreshStats(row.userId))).catch(() => undefined)
  contentChanged({ type: 'thread', id: threadId }, null, null)
  return thread
}

export async function moderatePost(viewer: Viewer, postId: number, action: 'hide' | 'show' | 'delete') {
  const post = await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { select: { id: true, categoryId: true } } } })
  if (!post || !moderatesAnything(viewer)) throw new ForumError(post ? 'دسترسی مدیریت تالار ندارید' : 'پیام پیدا نشد', post ? 403 : 404)
  requireModerator(viewer, post.thread.categoryId)
  if (post.postNumber === 1 && action !== 'show') throw new ForumError('پیام اول موضوع را با پنهان یا حذف‌کردن خود موضوع مدیریت کنید', 409)
  await db.$transaction(async (tx) => {
    if (action === 'delete') await tx.forumPost.delete({ where: { id: postId } })
    else {
      await tx.forumPost.update({ where: { id: postId }, data: { status: action === 'hide' ? 'HIDDEN' : 'VISIBLE' } })
      await settleFlags(tx, viewer, { postId }, action === 'hide')
    }
    await recount(tx, post.threadId, post.thread.categoryId)
  })
  void refreshStats(post.userId).catch(() => undefined)
  return { id: postId, threadId: post.threadId }
}

/** Staff decision on a post's pending flags: agree (keep hidden), disagree (restore) or delete. */
export async function resolveFlags(viewer: Viewer, postId: number, action: 'agree' | 'disagree' | 'delete') {
  const post = await db.forumPost.findUnique({ where: { id: postId }, include: { thread: { select: { id: true, categoryId: true } } } })
  if (!post || !moderatesAnything(viewer)) throw new ForumError(post ? 'دسترسی مدیریت تالار ندارید' : 'پیام پیدا نشد', post ? 403 : 404)
  requireModerator(viewer, post.thread.categoryId)
  const status = action === 'disagree' ? 'DISAGREED' : 'AGREED'
  const cases = await db.forumFlag.findMany({ where: { postId, status: 'PENDING' }, select: { id: true } })
  await db.forumFlag.updateMany({ where: { postId, status: 'PENDING' }, data: { status, handledBy: viewer.userId, handledAt: new Date() } })
  if (action === 'delete') {
    if (post.postNumber === 1) await deleteThread(viewer, post.threadId)
    else await moderatePost(viewer, postId, 'delete')
  } else {
    const visible = action === 'disagree'
    await db.$transaction(async (tx) => {
      if (post.postNumber === 1) await tx.forumThread.update({ where: { id: post.threadId }, data: { status: visible ? 'VISIBLE' : 'HIDDEN' } })
      else await tx.forumPost.update({ where: { id: postId }, data: { status: visible ? 'VISIBLE' : 'HIDDEN' } })
      await recount(tx, post.threadId, post.thread.categoryId)
    })
    void refreshStats(post.userId).catch(() => undefined)
  }
  await db.$transaction(async tx => { for (const flag of cases) await completeOwnerCase(tx, 'forum-flags', flag.id, viewer.userId!, action === 'disagree' ? 'reject' : 'approve') })
  return { postId, status }
}
