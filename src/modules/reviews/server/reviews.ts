import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { logEvent } from '@/platform/observability/logger'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { FAVORITABLE, ITEM_LABEL, REVIEWABLE, itemKey, parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import { itemCard, itemCards, type ItemCard } from '@/modules/content/server/registry'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { ReviewError, initialReviewStatus, normalizeRating, normalizeReviewBody, summarizeDistribution, type RatingSummary } from '@/modules/reviews/domain/reviews'

const PAGE = 10
const counted = { status: { not: 'REJECTED' } }

async function assertOn() {
  if (!await isModuleEnabled('reviews')) throw new ReviewError('این بخش فعال نیست', 404)
}

async function publicItem(ref: ItemRef): Promise<ItemCard> {
  const item = await itemCard(ref)
  if (!item) throw new ReviewError('مورد پیدا نشد', 404)
  return item
}

/** Recomputes the cached rating/favorite totals used for sorting and comparison. */
export async function refreshItemStat(ref: ItemRef) {
  const [ratings, favorites] = await Promise.all([
    db.itemReview.aggregate({ where: { itemType: ref.type, itemId: ref.id, ...counted }, _count: true, _sum: { rating: true } }),
    db.itemFavorite.count({ where: { itemType: ref.type, itemId: ref.id } }),
  ])
  const data = { ratingCount: ratings._count, ratingSum: ratings._sum.rating || 0, favorites }
  await db.itemStat.upsert({ where: { itemType_itemId: { itemType: ref.type, itemId: ref.id } }, create: { itemType: ref.type, itemId: ref.id, ...data }, update: data })
}

export type PublicReview = { id: number; rating: number; body: string; createdAt: Date; author: { name: string; color: string }; mine: boolean; helpfulCount: number; helpfulByMe: boolean }

/** Everything an item page shows: summary, the viewer's own review/favorite and a page of reviews. */
export async function itemEngagement(ref: ItemRef, userId: number | null, page = 1) {
  const reviewable = REVIEWABLE.includes(ref.type)
  const where = { itemType: ref.type, itemId: ref.id }
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1
  const [ratings, mine, favorite, favorites, total, rows] = await Promise.all([
    reviewable ? db.itemReview.groupBy({ by: ['rating'], where: { ...where, ...counted }, _count: { rating: true } }) : Promise.resolve([]),
    reviewable && userId ? db.itemReview.findUnique({ where: { itemType_itemId_userId: { ...where, userId } } }) : Promise.resolve(null),
    userId ? db.itemFavorite.findUnique({ where: { userId_itemType_itemId: { userId, ...where } } }) : Promise.resolve(null),
    db.itemFavorite.count({ where }),
    reviewable ? db.itemReview.count({ where: { ...where, status: 'APPROVED', NOT: { body: '' } } }) : Promise.resolve(0),
    reviewable ? db.itemReview.findMany({ where: { ...where, status: 'APPROVED', NOT: { body: '' } }, orderBy: { createdAt: 'desc' }, skip: (safePage - 1) * PAGE, take: PAGE, include: { user: { select: { name: true, avatarColor: true } } } }) : Promise.resolve([]),
  ])
  const distribution: RatingSummary['distribution'] = [0, 0, 0, 0, 0]
  for (const row of ratings) if (row.rating >= 1 && row.rating <= 5) distribution[row.rating - 1] = row._count.rating
  const summary = summarizeDistribution(distribution)
  const reviewIds = rows.map((row) => row.id)
  const [helpfulCounts, myHelpful] = reviewIds.length ? await Promise.all([
    db.itemReviewHelpful.groupBy({ by: ['reviewId'], where: { reviewId: { in: reviewIds } }, _count: { reviewId: true } }),
    userId ? db.itemReviewHelpful.findMany({ where: { userId, reviewId: { in: reviewIds } }, select: { reviewId: true } }) : Promise.resolve([]),
  ]) : [[], []]
  const helpfulById = new Map(helpfulCounts.map((row) => [row.reviewId, row._count.reviewId]))
  const helpfulByMe = new Set(myHelpful.map((row) => row.reviewId))
  return {
    reviewable, summary, favorites, total, page: safePage, pages: Math.ceil(total / PAGE),
    mine: mine ? { rating: mine.rating, body: mine.body, status: mine.status } : null,
    favorite: favorite ? { notify: favorite.notify } : null,
    reviews: rows.map((row): PublicReview => ({ id: row.id, rating: row.rating, body: row.body, createdAt: row.createdAt, author: { name: row.user.name || 'کاربر موبوکام', color: row.user.avatarColor }, mine: row.userId === userId, helpfulCount: helpfulById.get(row.id) || 0, helpfulByMe: helpfulByMe.has(row.id) })),
  }
}

/** One reversible helpful vote per member on a currently public approved review. */
export async function setReviewHelpful(userId: number, reviewId: number, on: boolean) {
  await assertOn()
  if (!rateLimitHit(`review-helpful:${userId}`, 120, 3_600_000).ok) throw new ReviewError('کمی بعد دوباره تلاش کنید', 429)
  const review = await db.itemReview.findUnique({ where: { id: reviewId } })
  if (!review || review.status !== 'APPROVED' || !review.body.trim()) throw new ReviewError('نظر در دسترس نیست', 404)
  if (review.userId === userId) throw new ReviewError('نمی‌توانید به نظر خودتان رأی دهید', 403)
  const ref = parseItemKey(`${review.itemType}:${review.itemId}`)
  if (!ref || !await itemCard(ref)) throw new ReviewError('نظر در دسترس نیست', 404)
  const where = { reviewId_userId: { reviewId, userId } }
  if (on) await db.itemReviewHelpful.upsert({ where, create: { reviewId, userId }, update: {} })
  else await db.itemReviewHelpful.deleteMany({ where: { reviewId, userId } })
  return { reviewId, on, count: await db.itemReviewHelpful.count({ where: { reviewId } }) }
}

export async function saveReview(userId: number, ref: ItemRef, input: { rating: unknown; body?: unknown }) {
  await assertOn()
  if (!REVIEWABLE.includes(ref.type)) throw new ReviewError('برای این مورد امکان امتیازدهی نیست')
  if (!rateLimitHit(`review:${userId}`, 20, 3_600_000).ok) throw new ReviewError('کمی بعد دوباره امتحان کنید', 429)
  await publicItem(ref)
  const rating = normalizeRating(input.rating)
  const body = normalizeReviewBody(input.body)
  const settings = await getModuleSettings('reviews').catch(() => ({} as Record<string, unknown>))
  const where = { itemType_itemId_userId: { itemType: ref.type, itemId: ref.id, userId } }
  const previous = await db.itemReview.findUnique({ where })
  // An unchanged approved text stays approved when only the stars change.
  const status = previous && previous.body === body && previous.status === 'APPROVED' ? 'APPROVED' : initialReviewStatus(body, settings['moderate-text'] !== false)
  if (previous && previous.body !== body) {
    await db.$transaction([
      db.itemReview.upsert({ where, create: { itemType: ref.type, itemId: ref.id, userId, rating, body, status }, update: { rating, body, status } }),
      db.itemReviewHelpful.deleteMany({ where: { reviewId: previous.id } }),
    ])
  } else {
    await db.itemReview.upsert({ where, create: { itemType: ref.type, itemId: ref.id, userId, rating, body, status }, update: { rating, body, status } })
  }
  await refreshItemStat(ref)
  return { rating, body, status }
}

export async function deleteReview(userId: number, ref: ItemRef) {
  await db.itemReview.deleteMany({ where: { itemType: ref.type, itemId: ref.id, userId } })
  await refreshItemStat(ref)
  return { deleted: true }
}

export async function setFavorite(userId: number, ref: ItemRef, input: { on: boolean; notify?: boolean }) {
  await assertOn()
  if (!FAVORITABLE.includes(ref.type)) throw new ReviewError('این مورد را نمی‌توان به علاقه‌مندی‌ها افزود')
  const where = { userId_itemType_itemId: { userId, itemType: ref.type, itemId: ref.id } }
  if (!input.on) await db.itemFavorite.deleteMany({ where: { userId, itemType: ref.type, itemId: ref.id } })
  else {
    if (!rateLimitHit(`favorite:${userId}`, 120, 3_600_000).ok) throw new ReviewError('کمی بعد دوباره امتحان کنید', 429)
    await publicItem(ref)
    const notify = input.notify !== false
    await db.itemFavorite.upsert({ where, create: { userId, itemType: ref.type, itemId: ref.id, notify }, update: { notify } })
  }
  await refreshItemStat(ref)
  const favorite = await db.itemFavorite.findUnique({ where })
  return { favorite: favorite ? { notify: favorite.notify } : null }
}

/** The member's favorites as cards, newest first (items that are gone are skipped). */
export async function listFavorites(userId: number) {
  const rows = await db.itemFavorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 })
  const cards = await itemCards(rows.map((row) => ({ type: row.itemType, id: row.itemId }) as ItemRef))
  return rows.flatMap((row) => {
    const card = cards.get(`${row.itemType}:${row.itemId}`)
    return card ? [{ ...card, notify: row.notify, addedAt: row.createdAt }] : []
  })
}

/** Bounded account-home preview; the full favorites page owns the complete list. */
export async function favoritePreview(userId: number, take = 6) {
  const size = Math.min(12, Math.max(1, Math.trunc(take) || 6))
  const [total, rows] = await Promise.all([
    db.itemFavorite.count({ where: { userId } }),
    db.itemFavorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(48, size * 4) }),
  ])
  const cards = await itemCards(rows.map((row) => ({ type: row.itemType, id: row.itemId }) as ItemRef))
  const items = rows.flatMap((row) => {
    const card = cards.get(`${row.itemType}:${row.itemId}`)
    return card ? [{ ...card, addedAt: row.createdAt }] : []
  }).slice(0, size)
  return { total, items }
}

/** Ratings for many items at once (cards, comparison). */
export async function ratingsFor(refs: ItemRef[]): Promise<Map<string, { average: number | null; count: number; favorites: number }>> {
  if (!refs.length) return new Map()
  const rows = await db.itemStat.findMany({ where: { OR: refs.map((ref) => ({ itemType: ref.type, itemId: ref.id })) } })
  return new Map(rows.map((row) => [`${row.itemType}:${row.itemId}`, { average: row.ratingCount ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : null, count: row.ratingCount, favorites: row.favorites }]))
}

/**
 * Tells members who follow an item (favorite with notify on) about an update,
 * e.g. a new software version. The dedupe key makes repeats harmless.
 */
export async function notifyFollowers(ref: ItemRef, update: { key: string; title: string; body: string }) {
  const item = await itemCard(ref)
  if (!item) return 0
  const followers = await db.itemFavorite.findMany({ where: { itemType: ref.type, itemId: ref.id, notify: true }, select: { userId: true }, take: 5000 })
  let sent = 0
  for (const { userId } of followers) {
    try {
      await createInboxEvent({
        userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `follow:${itemKey(ref)}:${update.key}:${userId}`,
        titleFa: update.title, titleEn: update.title, bodyFa: update.body, bodyEn: update.body, href: item.url,
      })
      sent++
    } catch (error) { logEvent('error', 'reviews.follower_notify_failed', { ref: itemKey(ref), error }) }
  }
  return sent
}

// ------------------------------------------------------------------ admin

export async function reviewQueue(status: string, page = 1) {
  const where = status === 'ALL' ? { NOT: { body: '' } } : { status: ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : 'PENDING' }
  const [total, rows] = await Promise.all([
    db.itemReview.count({ where }),
    db.itemReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, include: { user: { select: { id: true, name: true, email: true } } } }),
  ])
  const cards = await itemCards(rows.map((row) => ({ type: row.itemType, id: row.itemId }) as ItemRef))
  return {
    total, page, pages: Math.ceil(total / 30),
    pending: await db.itemReview.count({ where: { status: 'PENDING' } }),
    reviews: rows.map((row) => {
      const card = cards.get(`${row.itemType}:${row.itemId}`)
      return { id: row.id, rating: row.rating, body: row.body, status: row.status, createdAt: row.createdAt, user: row.user, item: { key: `${row.itemType}:${row.itemId}`, title: card?.title || '(حذف‌شده)', url: card?.url || '', label: ITEM_LABEL[row.itemType as keyof typeof ITEM_LABEL]?.one || row.itemType } }
    }),
  }
}

export async function moderateReview(id: number, action: 'approve' | 'reject' | 'delete') {
  const review = await db.itemReview.findUnique({ where: { id } })
  if (!review) throw new ReviewError('نظر پیدا نشد', 404)
  if (action === 'delete') await db.itemReview.delete({ where: { id } })
  else if (action === 'reject') await db.$transaction([
    db.itemReview.update({ where: { id }, data: { status: 'REJECTED' } }),
    db.itemReviewHelpful.deleteMany({ where: { reviewId: id } }),
  ])
  else await db.itemReview.update({ where: { id }, data: { status: 'APPROVED' } })
  const ref = parseItemKey(`${review.itemType}:${review.itemId}`)
  if (ref) await refreshItemStat(ref)
  if (action === 'approve' && review.status !== 'APPROVED') {
    const item = ref && await itemCard(ref)
    if (item) await createInboxEvent({ userId: review.userId, kind: 'REVIEW_APPROVED', dedupeKey: `review:${id}:approved`, titleFa: 'نظر شما منتشر شد', titleEn: 'Your review is live', bodyFa: `نظر شما دربارهٔ «${item.title}» تأیید و منتشر شد.`, bodyEn: `Your review of ${item.title} was published.`, href: item.url }).catch(() => undefined)
  }
  return { id, action }
}
