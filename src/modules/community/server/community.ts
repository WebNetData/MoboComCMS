export { createBusinessReviewReport, businessReviewReports } from './review-reports'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { logEvent } from '@/platform/observability/logger'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { itemCards, type ItemCard } from '@/modules/content/server/registry'
import { isItemType, itemKey, type ItemRef } from '@/modules/content/domain/items'
import { blockedIds, ensureUserProfiles, followingIds, profileCards, relationBetween, type ProfileCard } from '@/modules/identity/server/profile'
import { canViewProfile, normalizePrivacy, type Privacy } from '@/modules/identity/domain/profile'
import {
  CommunityError, canEdit, hashtagsIn, mentionsIn, mergeActivity, normalizeCommunitySettings, normalizeReason, normalizeTag, parseCursor, renderBody, validateComment, validatePost,
  type CommunitySettings,
} from '@/modules/community/domain/community'

// Member posts, comments, likes and reports; the home feed, profile feeds
// and the cross-site activity timeline (forum, reviews, game library).

const PAGE = 20

export async function communitySettings(): Promise<CommunitySettings> {
  return normalizeCommunitySettings(await getModuleSettings('community').catch(() => ({})))
}

async function notify(userId: number, kind: string, dedupeKey: string, title: string, body: string, href: string) {
  await createInboxEvent({ userId, kind, dedupeKey, titleFa: title, titleEn: title, bodyFa: body.slice(0, 300), bodyEn: body.slice(0, 300), href }).catch((error) => logEvent('warn', 'community.notify_failed', { kind, error }))
}

async function staff(userId: number | null) {
  if (!userId) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
  return user?.role === 'ADMIN' && user.status === 'ACTIVE'
}

// ------------------------------------------------------------------ views

export type PostView = {
  id: number; html: string; content: string; images: string[]; visibility: string; createdAt: string; editedAt: string | null; editable: boolean
  author: ProfileCard; likes: number; comments: number; liked: boolean; own: boolean; pinned: boolean
  item: Pick<ItemCard, 'type' | 'title' | 'subtitle' | 'url' | 'image'> | null
  preview: CommentView[]
}
export type CommentView = { id: number; html: string; createdAt: string; author: ProfileCard; own: boolean }

type PostRow = { id: number; authorId: number; content: string; images: string; itemType: string; itemId: number | null; visibility: string; likeCount: number; commentCount: number; editedAt: Date | null; createdAt: Date }

/** Comments the viewer may see: a block hides the two members' comments from each other, like their posts. */
async function visibleComments(viewerId: number | null) {
  const hidden = await blockedIds(viewerId)
  return { status: 'VISIBLE', ...(hidden.length ? { authorId: { notIn: hidden } } : {}) }
}

async function toViews(rows: PostRow[], viewerId: number | null, withComments = 2): Promise<PostView[]> {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const commentWhere = withComments ? await visibleComments(viewerId) : null
  const [liked, comments, pinned] = await Promise.all([
    viewerId ? db.communityLike.findMany({ where: { postId: { in: ids }, userId: viewerId }, select: { postId: true } }) : Promise.resolve([]),
    commentWhere ? db.communityComment.findMany({ where: { postId: { in: ids }, ...commentWhere }, orderBy: { createdAt: 'desc' }, take: ids.length * 6 }) : Promise.resolve([]),
    db.userProfile.findMany({ where: { pinnedPostId: { in: ids } }, select: { pinnedPostId: true } }),
  ])
  const refs = rows.flatMap((row) => (row.itemId && isItemType(row.itemType) ? [{ type: row.itemType, id: row.itemId } as ItemRef] : []))
  const [cards, items] = await Promise.all([profileCards([...rows.map((row) => row.authorId), ...comments.map((c) => c.authorId)]), itemCards(refs).catch(() => new Map<string, ItemCard>())])
  const likedSet = new Set(liked.map((row) => row.postId))
  const pinnedSet = new Set(pinned.map((row) => row.pinnedPostId))
  const byPost = new Map<number, typeof comments>()
  for (const comment of comments) { const list = byPost.get(comment.postId) || []; if (list.length < withComments) byPost.set(comment.postId, [...list, comment]) }
  return rows.flatMap((row) => {
    const author = cards.get(row.authorId)
    if (!author) return []
    const item = row.itemId && isItemType(row.itemType) ? items.get(itemKey({ type: row.itemType, id: row.itemId })) : undefined
    const images = (() => { try { return JSON.parse(row.images) as string[] } catch { return [] } })()
    return [{
      id: row.id, html: renderBody(row.content), content: row.id && viewerId === row.authorId ? row.content : '', images, visibility: row.visibility,
      createdAt: row.createdAt.toISOString(), editedAt: row.editedAt?.toISOString() || null, editable: viewerId === row.authorId && canEdit(row.createdAt),
      author, likes: row.likeCount, comments: row.commentCount, liked: likedSet.has(row.id), own: viewerId === row.authorId, pinned: pinnedSet.has(row.id),
      item: item ? { type: item.type, title: item.title, subtitle: item.subtitle, url: item.url, image: item.image } : null,
      preview: (byPost.get(row.id) || []).reverse().flatMap((comment) => (cards.get(comment.authorId) ? [{ id: comment.id, html: renderBody(comment.content), createdAt: comment.createdAt.toISOString(), author: cards.get(comment.authorId)!, own: comment.authorId === viewerId }] : [])),
    }]
  })
}

/** Posts the viewer may see: public ones, followers-only from people they follow, and their own. */
async function visibilityWhere(viewerId: number | null) {
  const hidden = await blockedIds(viewerId)
  const followed = viewerId ? await followingIds(viewerId) : []
  return {
    status: 'VISIBLE',
    ...(hidden.length ? { authorId: { notIn: hidden } } : {}),
    OR: [{ visibility: 'PUBLIC' }, ...(viewerId ? [{ authorId: { in: [viewerId, ...followed] } }] : [])],
  }
}

// ------------------------------------------------------------------ feeds

export async function homeFeed(viewerId: number | null, input: { mode?: string; tag?: string; cursor?: string }) {
  const before = parseCursor(input.cursor)
  const tag = normalizeTag(input.tag)
  const base = await visibilityWhere(viewerId)
  const mode = tag ? 'tag' : input.mode === 'following' && viewerId ? 'following' : 'all'
  const where: Record<string, unknown> = { ...base, ...(before ? { createdAt: { lt: before } } : {}) }
  if (mode === 'following') where.authorId = { in: [viewerId!, ...(await followingIds(viewerId!))] }
  if (tag) where.content = { contains: `#${tag}` }
  // Private profiles keep their posts off the public feed.
  const rows = await db.communityPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE * 2 })
  const visible = await filterByProfilePrivacy(rows, viewerId)
  const page = visible.slice(0, PAGE)
  return { mode, tag, posts: await toViews(page, viewerId), next: page.length === PAGE ? page[page.length - 1].createdAt.toISOString() : null }
}

async function filterByProfilePrivacy<T extends { authorId: number }>(rows: T[], viewerId: number | null): Promise<T[]> {
  const authors = [...new Set(rows.map((row) => row.authorId))]
  if (!authors.length) return rows
  const privacy = new Map((await db.userProfile.findMany({ where: { userId: { in: authors } }, select: { userId: true, privacy: true } })).map((row) => [row.userId, normalizePrivacy(row.privacy)]))
  const allowed = new Set<number>()
  for (const author of authors) {
    const p = privacy.get(author)
    if (!p || p.profile === 'PUBLIC' || author === viewerId) { allowed.add(author); continue }
    if (canViewProfile(p, await relationBetween(viewerId, author))) allowed.add(author)
  }
  return rows.filter((row) => allowed.has(row.authorId))
}

export async function profilePosts(ownerId: number, viewerId: number | null, cursor?: string) {
  const before = parseCursor(cursor)
  const [relation, owner] = await Promise.all([relationBetween(viewerId, ownerId), db.userProfile.findUnique({ where: { userId: ownerId }, select: { privacy: true } })])
  // The same gate as the profile page: a private profile, or one whose owner blocked the viewer, lists nothing.
  if (!owner || !canViewProfile(normalizePrivacy(owner.privacy), relation)) return { posts: [], next: null }
  const where = { authorId: ownerId, status: 'VISIBLE', ...(relation.self || relation.following || relation.staff ? {} : { visibility: 'PUBLIC' }), ...(before ? { createdAt: { lt: before } } : {}) }
  const rows = await db.communityPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE })
  return { posts: await toViews(rows, viewerId), next: rows.length === PAGE ? rows[rows.length - 1].createdAt.toISOString() : null }
}

export async function pinnedPost(postId: number | null, viewerId: number | null) {
  if (!postId) return null
  const row = await db.communityPost.findFirst({ where: { id: postId, status: 'VISIBLE', visibility: 'PUBLIC' } })
  return row ? (await toViews([row], viewerId))[0] || null : null
}

export async function getPost(id: number, viewerId: number | null) {
  const row = await db.communityPost.findFirst({ where: { id, ...(await visibilityWhere(viewerId)) } })
  if (!row || !(await filterByProfilePrivacy([row], viewerId)).length) throw new CommunityError('پست پیدا نشد', 404, 'NOT_FOUND')
  const [view] = await toViews([row], viewerId, 0)
  const comments = await db.communityComment.findMany({ where: { postId: id, ...(await visibleComments(viewerId)) }, orderBy: { createdAt: 'asc' }, take: 300 })
  const cards = await profileCards(comments.map((c) => c.authorId))
  return { ...view, all: comments.flatMap((comment) => (cards.get(comment.authorId) ? [{ id: comment.id, html: renderBody(comment.content), createdAt: comment.createdAt.toISOString(), author: cards.get(comment.authorId)!, own: comment.authorId === viewerId }] : [])) }
}

export async function trendingTags(days = 7, take = 8) {
  const rows = await db.communityPost.findMany({ where: { status: 'VISIBLE', visibility: 'PUBLIC', createdAt: { gte: new Date(Date.now() - days * 86_400_000) }, content: { contains: '#' } }, select: { content: true }, take: 1000 })
  const counts = new Map<string, number>()
  for (const row of rows) for (const tag of hashtagsIn(row.content)) counts.set(tag, (counts.get(tag) || 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, take).map(([tag, count]) => ({ tag, count }))
}

// ------------------------------------------------------------------ writing

async function assertCanPost(userId: number, settings: CommunitySettings) {
  if (!settings.postsEnabled) throw new CommunityError('ارسال پست فعلاً غیرفعال است', 403)
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, createdAt: true, role: true } })
  if (!user || user.status !== 'ACTIVE') throw new CommunityError('حساب شما فعال نیست', 403)
  if (settings.minAccountDays && user.role !== 'ADMIN' && Date.now() - user.createdAt.getTime() < settings.minAccountDays * 86_400_000) throw new CommunityError(`ارسال پست از ${settings.minAccountDays.toLocaleString('fa-IR')} روز پس از ثبت‌نام ممکن است`, 403)
}

async function refreshPostCount(userId: number) {
  const count = await db.communityPost.count({ where: { authorId: userId, status: 'VISIBLE' } })
  await db.userProfile.updateMany({ where: { userId }, data: { postCount: count } })
}

async function notifyMentions(authorId: number, text: string, href: string, what: string, key: string) {
  const names = mentionsIn(text)
  if (!names.length) return
  const [targets, author] = await Promise.all([db.userProfile.findMany({ where: { username: { in: names } }, select: { userId: true } }), db.userProfile.findUnique({ where: { userId: authorId }, select: { username: true } })])
  const hidden = new Set(await blockedIds(authorId))
  for (const target of targets) if (target.userId !== authorId && !hidden.has(target.userId)) await notify(target.userId, 'COMMUNITY_MENTION', `${key}:mention:${target.userId}`, `@${author?.username} در ${what} از شما نام برد`, text.slice(0, 160), href)
}

export async function createPost(userId: number, input: { content?: unknown; images?: unknown; visibility?: unknown; item?: unknown }) {
  const settings = await communitySettings()
  await assertCanPost(userId, settings)
  if (!rateLimitHit(`community:post:${userId}`, 12, 3_600_000).ok) throw new CommunityError('تعداد پست‌ها در این ساعت زیاد است؛ کمی بعد تلاش کنید', 429)
  const post = validatePost({ content: input.content, images: input.images, visibility: input.visibility }, settings)
  let itemType = ''
  let itemId: number | null = null
  if (input.item && typeof input.item === 'object') {
    const ref = input.item as { type?: unknown; id?: unknown }
    if (isItemType(ref.type) && Number.isSafeInteger(Number(ref.id))) {
      const card = (await itemCards([{ type: ref.type, id: Number(ref.id) }])).get(itemKey({ type: ref.type, id: Number(ref.id) }))
      if (!card) throw new CommunityError('موردی که می‌خواهید به اشتراک بگذارید پیدا نشد', 404)
      itemType = ref.type
      itemId = Number(ref.id)
    }
  }
  await ensureUserProfiles([userId])
  const row = await db.communityPost.create({ data: { authorId: userId, content: post.content, images: JSON.stringify(post.images), visibility: post.visibility, itemType, itemId } })
  await refreshPostCount(userId)
  await notifyMentions(userId, post.content, `/feed/p/${row.id}`, 'یک پست', `community:post:${row.id}`)
  return (await toViews([row], userId))[0]
}

async function ownPost(userId: number, postId: number) {
  const row = await db.communityPost.findUnique({ where: { id: postId } })
  if (!row || row.status !== 'VISIBLE') throw new CommunityError('پست پیدا نشد', 404, 'NOT_FOUND')
  if (row.authorId !== userId && !await staff(userId)) throw new CommunityError('اجازهٔ این کار را ندارید', 403)
  return row
}

export async function editPost(userId: number, postId: number, input: { content?: unknown; visibility?: unknown }) {
  const row = await ownPost(userId, postId)
  if (row.authorId !== userId) throw new CommunityError('فقط نویسنده می‌تواند پست را ویرایش کند', 403)
  if (!canEdit(row.createdAt)) throw new CommunityError('ویرایش فقط تا ۳۰ دقیقه پس از انتشار ممکن است', 403)
  const settings = await communitySettings()
  const post = validatePost({ content: input.content, images: row.images, visibility: input.visibility ?? row.visibility }, settings)
  const saved = await db.communityPost.update({ where: { id: postId }, data: { content: post.content, visibility: post.visibility, editedAt: new Date() } })
  return (await toViews([saved], userId))[0]
}

export async function deletePost(userId: number, postId: number) {
  const row = await ownPost(userId, postId)
  // The author's own removal is final: staff can hide and restore a post, but not bring back one its author deleted.
  await db.communityPost.update({ where: { id: postId }, data: { status: row.authorId === userId ? 'DELETED' : 'HIDDEN' } })
  await db.userProfile.updateMany({ where: { pinnedPostId: postId }, data: { pinnedPostId: null } })
  await refreshPostCount(row.authorId)
  return { deleted: true, moderated: row.authorId !== userId }
}

export async function pinPost(userId: number, postId: number | null) {
  if (postId) {
    const row = await db.communityPost.findFirst({ where: { id: postId, authorId: userId, status: 'VISIBLE' } })
    if (!row) throw new CommunityError('فقط پست‌های خودتان را می‌توانید سنجاق کنید', 403)
  }
  await db.userProfile.update({ where: { userId }, data: { pinnedPostId: postId } })
  return { pinned: postId }
}

async function visiblePost(postId: number, viewerId: number) {
  const row = await db.communityPost.findFirst({ where: { id: postId, ...(await visibilityWhere(viewerId)) } })
  if (!row || !(await filterByProfilePrivacy([row], viewerId)).length) throw new CommunityError('پست پیدا نشد', 404, 'NOT_FOUND')
  return row
}

export async function toggleLike(userId: number, postId: number, on: boolean) {
  const post = await visiblePost(postId, userId)
  if (!rateLimitHit(`community:like:${userId}`, 300, 3_600_000).ok) throw new CommunityError('کمی آهسته‌تر!', 429)
  if (on) {
    const created = await db.communityLike.create({ data: { postId, userId } }).then(() => true).catch((error: { code?: string }) => { if (error?.code === 'P2002') return false; throw error })
    if (created && post.authorId !== userId) {
      const who = await db.userProfile.findUnique({ where: { userId }, select: { username: true } })
      await notify(post.authorId, 'COMMUNITY_LIKE', `community:like:${postId}:${userId}`, `@${who?.username} پست شما را پسندید`, post.content.slice(0, 160), `/feed/p/${postId}`)
    }
  } else await db.communityLike.deleteMany({ where: { postId, userId } })
  const likes = await db.communityLike.count({ where: { postId } })
  await db.communityPost.update({ where: { id: postId }, data: { likeCount: likes } })
  return { liked: on, likes }
}

export async function addComment(userId: number, postId: number, input: { content?: unknown }) {
  const post = await visiblePost(postId, userId)
  const settings = await communitySettings()
  await assertCanPost(userId, settings)
  if (!rateLimitHit(`community:comment:${userId}`, 60, 3_600_000).ok) throw new CommunityError('تعداد دیدگاه‌ها زیاد است؛ کمی بعد تلاش کنید', 429)
  const relation = await relationBetween(userId, post.authorId)
  if (relation.blocked || relation.blockedBy) throw new CommunityError('امکان دیدگاه گذاشتن روی این پست نیست', 403)
  const content = validateComment(input.content)
  await ensureUserProfiles([userId])
  const row = await db.communityComment.create({ data: { postId, authorId: userId, content } })
  await db.communityPost.update({ where: { id: postId }, data: { commentCount: await db.communityComment.count({ where: { postId, status: 'VISIBLE' } }) } })
  const who = await db.userProfile.findUnique({ where: { userId }, select: { username: true } })
  if (post.authorId !== userId) await notify(post.authorId, 'COMMUNITY_COMMENT', `community:comment:${row.id}`, `@${who?.username} برای پست شما دیدگاه گذاشت`, content.slice(0, 160), `/feed/p/${postId}`)
  await notifyMentions(userId, content, `/feed/p/${postId}`, 'یک دیدگاه', `community:comment:${row.id}`)
  const card = (await profileCards([userId])).get(userId)!
  return { id: row.id, html: renderBody(content), createdAt: row.createdAt.toISOString(), author: card, own: true }
}

export async function deleteComment(userId: number, commentId: number) {
  const row = await db.communityComment.findUnique({ where: { id: commentId }, include: { post: { select: { authorId: true } } } })
  if (!row || row.status !== 'VISIBLE') throw new CommunityError('دیدگاه پیدا نشد', 404)
  // The commenter, the post's author and staff may remove a comment.
  if (row.authorId !== userId && row.post.authorId !== userId && !await staff(userId)) throw new CommunityError('اجازهٔ این کار را ندارید', 403)
  await db.communityComment.update({ where: { id: commentId }, data: { status: 'HIDDEN' } })
  await db.communityPost.update({ where: { id: row.postId }, data: { commentCount: await db.communityComment.count({ where: { postId: row.postId, status: 'VISIBLE' } }) } })
  return { deleted: true }
}

export async function report(userId: number, input: { postId?: unknown; commentId?: unknown; reason?: unknown; note?: unknown }) {
  if (!rateLimitHit(`community:report:${userId}`, 20, 3_600_000).ok) throw new CommunityError('تعداد گزارش‌ها زیاد است', 429)
  const reason = normalizeReason(input.reason)
  const postId = Number(input.postId) || null
  const commentId = Number(input.commentId) || null
  if (!postId && !commentId) throw new CommunityError('موردی برای گزارش انتخاب نشده است')
  if (postId) await visiblePost(postId, userId)
  if (commentId) {
    const comment = await db.communityComment.findFirst({ where: { id: commentId, status: 'VISIBLE' }, select: { postId: true } })
    if (!comment) throw new CommunityError('دیدگاه پیدا نشد', 404)
    // A comment is reported from its post; a post the member cannot open has no comments to report.
    if (!postId) await visiblePost(comment.postId, userId).catch(() => { throw new CommunityError('دیدگاه پیدا نشد', 404) })
  }
  const duplicate = await db.communityReport.findFirst({ where: { reporterId: userId, status: 'OPEN', ...(postId ? { postId } : { commentId }) } })
  if (duplicate) return { reported: true, duplicate: true }
  await db.communityReport.create({ data: { reporterId: userId, postId, commentId, reason, note: String(input.note || '').trim().slice(0, 500) } })
  return { reported: true, duplicate: false }
}

// ------------------------------------------------------------------ activity (cross-site)

export type Activity = { key: string; at: Date; kind: 'post' | 'topic' | 'reply' | 'review' | 'library'; title: string; text: string; href: string; image: string; meta: string }

/**
 * A member's public activity across enabled sections, newest first: posts,
 * forum topics and replies (public categories only), item reviews and game
 * library changes — each source honoring the owner's privacy switches.
 */
export async function activityFor(ownerId: number, privacy: Privacy, viewerId: number | null, limit = 30): Promise<Activity[]> {
  const relation = await relationBetween(viewerId, ownerId)
  const self = relation.self || relation.staff
  const lists: Activity[][] = []
  const posts = await db.communityPost.findMany({ where: { authorId: ownerId, status: 'VISIBLE', ...(self || relation.following ? {} : { visibility: 'PUBLIC' }) }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, content: true, images: true, createdAt: true } })
  lists.push(posts.map((post) => ({ key: `post:${post.id}`, at: post.createdAt, kind: 'post', title: 'پست تازه', text: post.content.slice(0, 220), href: `/feed/p/${post.id}`, image: (() => { try { return (JSON.parse(post.images) as string[])[0] || '' } catch { return '' } })(), meta: '' })))
  if (!self && !privacy.showActivity) return mergeActivity(lists, limit)
  if (await isModuleEnabled('forum')) {
    const threads = await db.forumThread.findMany({ where: { userId: ownerId, status: 'VISIBLE', listed: true, category: { access: 'PUBLIC', permissions: { none: {} } } }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, title: true, createdAt: true, replyCount: true, category: { select: { title: true } } } }).catch(() => [])
    lists.push(threads.map((thread) => ({ key: `topic:${thread.id}`, at: thread.createdAt, kind: 'topic', title: thread.title, text: '', href: `/forum/t/${thread.id}`, image: '', meta: `${thread.category.title} · ${thread.replyCount.toLocaleString('fa-IR')} پاسخ` })))
    const replies = await db.forumPost.findMany({ where: { userId: ownerId, status: 'VISIBLE', postNumber: { gt: 1 }, thread: { status: 'VISIBLE', listed: true, category: { access: 'PUBLIC', permissions: { none: {} } } } }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, postNumber: true, content: true, createdAt: true, thread: { select: { id: true, title: true } } } }).catch(() => [])
    lists.push(replies.map((reply) => ({ key: `reply:${reply.id}`, at: reply.createdAt, kind: 'reply', title: reply.thread.title, text: reply.content.replace(/\[poll[\s\S]*?\[\/poll\]/g, '').replace(/[#*_`>[\]()!]/g, '').slice(0, 200), href: `/forum/t/${reply.thread.id}?post=${reply.postNumber}`, image: '', meta: '' })))
  }
  const reviews = await db.itemReview.findMany({ where: { userId: ownerId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: limit }).catch(() => [])
  const libraryRows = (self || privacy.showLibrary) && await isModuleEnabled('games') ? await db.gameLibrary.findMany({ where: { userId: ownerId, game: { status: 'PUBLISHED' } }, orderBy: { updatedAt: 'desc' }, take: limit, include: { game: { select: { id: true, title: true, slug: true, cover: true } } } }).catch(() => []) : []
  const cards = await itemCards(reviews.flatMap((row) => (isItemType(row.itemType) ? [{ type: row.itemType, id: row.itemId } as ItemRef] : []))).catch(() => new Map<string, ItemCard>())
  lists.push(reviews.flatMap((row) => {
    const card = isItemType(row.itemType) ? cards.get(itemKey({ type: row.itemType, id: row.itemId })) : undefined
    return card ? [{ key: `review:${row.id}`, at: row.createdAt, kind: 'review' as const, title: card.title, text: row.body.slice(0, 220), href: card.url, image: card.image, meta: `امتیاز ${row.rating.toLocaleString('fa-IR')} از ۵` }] : []
  }))
  const SHELF: Record<string, string> = { PLAYED: 'بازی کرد', PLAYING: 'در حال بازی است', WANT: 'می‌خواهد بازی کند', DROPPED: 'رها کرد' }
  lists.push(libraryRows.map((row) => ({ key: `library:${row.id}`, at: row.updatedAt, kind: 'library' as const, title: row.game.title, text: '', href: `/games/${row.game.slug}`, image: row.game.cover, meta: `${SHELF[row.status] || ''}${row.hours ? ` · ${row.hours.toLocaleString('fa-IR')} ساعت` : ''}` })))
  return mergeActivity(lists, limit)
}

/** Profile tabs data: game shelf, reviews, favorites (as the owner allows). */
export async function profileShelves(ownerId: number, privacy: Privacy, viewerId: number | null) {
  const relation = await relationBetween(viewerId, ownerId)
  const self = relation.self || relation.staff
  const [games, favorites, stats] = await Promise.all([
    (self || privacy.showLibrary) && await isModuleEnabled('games') ? db.gameLibrary.findMany({ where: { userId: ownerId, game: { status: 'PUBLISHED' } }, orderBy: { updatedAt: 'desc' }, take: 60, include: { game: { select: { title: true, slug: true, cover: true } } } }).catch(() => []) : Promise.resolve([]),
    (self || privacy.showFavorites) ? db.itemFavorite.findMany({ where: { userId: ownerId }, orderBy: { createdAt: 'desc' }, take: 40, select: { itemType: true, itemId: true } }).catch(() => []) : Promise.resolve([]),
    Promise.all([
      db.forumProfile.findUnique({ where: { userId: ownerId }, select: { topicCount: true, postCount: true, likesReceived: true, solvedCount: true, trustLevel: true } }).catch(() => null),
      db.itemReview.count({ where: { userId: ownerId, status: 'APPROVED' } }).catch(() => 0),
      db.forumUserBadge.findMany({ where: { userId: ownerId }, orderBy: { grantedAt: 'desc' }, take: 12, include: { badge: { select: { name: true, icon: true, tier: true, description: true } } } }).catch(() => []),
    ]),
  ])
  const favCards = await itemCards(favorites.flatMap((row) => (isItemType(row.itemType) ? [{ type: row.itemType, id: row.itemId } as ItemRef] : []))).catch(() => new Map<string, ItemCard>())
  return {
    games: games.map((row) => ({ status: row.status, hours: row.hours, title: row.game.title, slug: row.game.slug, cover: row.game.cover })),
    favorites: favorites.flatMap((row) => { const card = isItemType(row.itemType) ? favCards.get(itemKey({ type: row.itemType, id: row.itemId })) : undefined; return card ? [{ type: card.type, title: card.title, url: card.url, image: card.image }] : [] }),
    forum: stats[0], reviews: stats[1],
    badges: stats[2].map((row) => ({ name: row.badge.name, icon: row.badge.icon, tier: row.badge.tier, description: row.badge.description })),
    showsLibrary: self || privacy.showLibrary, showsFavorites: self || privacy.showFavorites,
  }
}
