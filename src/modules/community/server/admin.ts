import { db } from '@/platform/database/prisma'
import { CommunityError, REPORT_REASONS, hashtagsIn } from '@/modules/community/domain/community'
import { ensureUserProfiles, profileCards } from '@/modules/identity/server/profile'

// Community moderation: health dashboard, reports, post moderation and the
// verified badge.

const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export async function communityDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [posts, comments, likes, follows, openReports, profiles, verified, recentPosts] = await Promise.all([
    db.communityPost.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, authorId: true, content: true, status: true } }),
    db.communityComment.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, authorId: true } }),
    db.communityLike.count({ where: { createdAt: { gte: since } } }),
    db.userFollow.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.communityReport.count({ where: { status: 'OPEN' } }),
    db.userProfile.count(),
    db.userProfile.count({ where: { verified: true } }),
    db.communityPost.findMany({ where: { status: 'VISIBLE', createdAt: { gte: since } }, orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }], take: 6 }),
  ])
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const bucket = (rows: { createdAt: Date }[]) => { const counts = new Map(days.map((d) => [d, 0])); for (const row of rows) { const k = tehranDay(row.createdAt); if (counts.has(k)) counts.set(k, counts.get(k)! + 1) } return days.map((d) => counts.get(d)!) }
  const active = new Set([...posts.map((p) => p.authorId), ...comments.map((c) => c.authorId)])
  const tags = new Map<string, number>()
  for (const post of posts) for (const tag of hashtagsIn(post.content)) tags.set(tag, (tags.get(tag) || 0) + 1)
  const topAuthors = await db.userProfile.findMany({ orderBy: [{ followerCount: 'desc' }], take: 6, select: { userId: true } })
  const cards = await profileCards([...topAuthors.map((row) => row.userId), ...recentPosts.map((row) => row.authorId)])
  const series = { posts: bucket(posts), comments: bucket(comments), follows: bucket(follows) }
  return {
    days, series,
    kpis: { posts: posts.length, comments: comments.length, likes, follows: follows.length, activeMembers: active.size, openReports, profiles, verified, hidden: posts.filter((p) => p.status === 'HIDDEN').length },
    tags: [...tags].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count })),
    topMembers: topAuthors.flatMap((row) => (cards.has(row.userId) ? [cards.get(row.userId)!] : [])),
    topPosts: recentPosts.map((row) => ({ id: row.id, text: row.content.slice(0, 140), likes: row.likeCount, comments: row.commentCount, author: cards.get(row.authorId) || null, createdAt: row.createdAt.toISOString() })),
  }
}

export async function reportQueue(status: string) {
  const rows = await db.communityReport.findMany({
    where: { status: ['OPEN', 'RESOLVED', 'DISMISSED'].includes(status) ? status : 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 100,
    include: { post: { select: { id: true, content: true, images: true, status: true, authorId: true, createdAt: true } }, comment: { select: { id: true, content: true, status: true, authorId: true, postId: true } } },
  })
  const cards = await profileCards(rows.flatMap((row) => [row.reporterId, row.post?.authorId, row.comment?.authorId].filter((v): v is number => !!v)))
  const counts = await db.communityReport.groupBy({ by: ['status'], _count: { _all: true } })
  return {
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    reasons: REPORT_REASONS,
    reports: rows.map((row) => ({
      id: row.id, reason: row.reason, reasonLabel: REPORT_REASONS[row.reason as keyof typeof REPORT_REASONS] || row.reason, note: row.note, status: row.status, createdAt: row.createdAt.toISOString(),
      reporter: cards.get(row.reporterId) || null,
      target: row.post ? { kind: 'post', id: row.post.id, text: row.post.content, status: row.post.status, author: cards.get(row.post.authorId) || null, href: `/feed/p/${row.post.id}` }
        : row.comment ? { kind: 'comment', id: row.comment.id, text: row.comment.content, status: row.comment.status, author: cards.get(row.comment.authorId) || null, href: `/feed/p/${row.comment.postId}` } : null,
    })),
  }
}

async function refreshCounts(postId: number) {
  const post = await db.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } })
  if (!post) return
  await db.communityPost.update({ where: { id: postId }, data: { commentCount: await db.communityComment.count({ where: { postId, status: 'VISIBLE' } }) } })
  await db.userProfile.updateMany({ where: { userId: post.authorId }, data: { postCount: await db.communityPost.count({ where: { authorId: post.authorId, status: 'VISIBLE' } }) } })
}

/** Closes a report; `hide` also hides the reported post or comment (and closes other open reports on it). */
export async function resolveReport(reportId: number, action: 'resolve' | 'dismiss', adminId: number, hide: boolean) {
  const row = await db.communityReport.findUnique({ where: { id: reportId } })
  if (!row) throw new CommunityError('گزارش پیدا نشد', 404)
  const status = action === 'resolve' ? 'RESOLVED' : 'DISMISSED'
  if (hide && action === 'resolve') {
    if (row.postId) {
      // A post its author already deleted stays "deleted by author".
      await db.communityPost.updateMany({ where: { id: row.postId, status: 'VISIBLE' }, data: { status: 'HIDDEN' } })
      await db.userProfile.updateMany({ where: { pinnedPostId: row.postId }, data: { pinnedPostId: null } })
      await refreshCounts(row.postId)
    }
    if (row.commentId) {
      const comment = await db.communityComment.update({ where: { id: row.commentId }, data: { status: 'HIDDEN' } })
      await refreshCounts(comment.postId)
    }
    await db.communityReport.updateMany({ where: { status: 'OPEN', ...(row.postId ? { postId: row.postId } : { commentId: row.commentId }) }, data: { status } })
  } else await db.communityReport.update({ where: { id: reportId }, data: { status } })
  void adminId
  return { status }
}

export async function moderationPosts(input: { q?: string; status?: string; page?: number }) {
  const size = 30
  const page = Math.max(1, Number(input.page) || 1)
  const q = String(input.q || '').trim().slice(0, 80)
  const where = { ...(input.status === 'HIDDEN' || input.status === 'VISIBLE' || input.status === 'DELETED' ? { status: input.status } : {}), ...(q ? { content: { contains: q } } : {}) }
  const [rows, total] = await Promise.all([db.communityPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size, include: { _count: { select: { reports: { where: { status: 'OPEN' } } } } } }), db.communityPost.count({ where })])
  const cards = await profileCards(rows.map((row) => row.authorId))
  return { total, page, pages: Math.max(1, Math.ceil(total / size)), posts: rows.map((row) => ({ id: row.id, text: row.content.slice(0, 300), images: (() => { try { return JSON.parse(row.images) as string[] } catch { return [] } })(), status: row.status, visibility: row.visibility, likes: row.likeCount, comments: row.commentCount, reports: row._count.reports, createdAt: row.createdAt.toISOString(), author: cards.get(row.authorId) || null })) }
}

export async function moderatePost(postId: number, action: 'hide' | 'restore') {
  const row = await db.communityPost.findUnique({ where: { id: postId } })
  if (!row) throw new CommunityError('پست پیدا نشد', 404)
  if (row.status === 'DELETED') throw new CommunityError('این پست را نویسنده‌اش حذف کرده است و بازگردانده نمی‌شود', 409)
  await db.communityPost.update({ where: { id: postId }, data: { status: action === 'hide' ? 'HIDDEN' : 'VISIBLE' } })
  if (action === 'hide') {
    await db.userProfile.updateMany({ where: { pinnedPostId: postId }, data: { pinnedPostId: null } })
    // The decision the open reports were waiting for has been made.
    await db.communityReport.updateMany({ where: { postId, status: 'OPEN' }, data: { status: 'RESOLVED' } })
  }
  await refreshCounts(postId)
  return { status: action === 'hide' ? 'HIDDEN' : 'VISIBLE' }
}

export async function verificationList(input: { q?: string; verified?: string; page?: number }) {
  const size = 30
  const page = Math.max(1, Number(input.page) || 1)
  const q = String(input.q || '').trim().toLowerCase().slice(0, 40)
  const where = { ...(input.verified === '1' ? { verified: true } : {}), ...(q ? { OR: [{ username: { contains: q } }, { user: { name: { contains: q } } }, { user: { email: { contains: q } } }] } : {}) }
  const [rows, total] = await Promise.all([db.userProfile.findMany({ where, orderBy: [{ verified: 'desc' }, { followerCount: 'desc' }], skip: (page - 1) * size, take: size, select: { userId: true, postCount: true, followingCount: true, user: { select: { email: true, createdAt: true } } } }), db.userProfile.count({ where })])
  const cards = await profileCards(rows.map((row) => row.userId))
  return { total, page, pages: Math.max(1, Math.ceil(total / size)), people: rows.flatMap((row) => (cards.has(row.userId) ? [{ ...cards.get(row.userId)!, email: row.user.email, joinedAt: row.user.createdAt.toISOString(), posts: row.postCount, following: row.followingCount }] : [])) }
}

export async function setVerified(userId: number, verified: boolean) {
  await ensureUserProfiles([userId])
  const row = await db.userProfile.update({ where: { userId }, data: { verified } }).catch(() => null)
  if (!row) throw new CommunityError('کاربر پیدا نشد', 404)
  return { verified: row.verified }
}
