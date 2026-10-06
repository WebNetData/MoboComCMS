import type { Prisma } from '@prisma/client'
import { plainText } from '@/shared/text/plain'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { logEvent } from '@/platform/observability/logger'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { FAVORITABLE, ITEM_LABEL, REVIEWABLE, itemKey, parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import { itemCard, itemCards, type ItemCard } from '@/modules/content/server/registry'
import { memberItemExperience } from '@/modules/content/server/experience'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { ReviewError, initialReviewStatus, normalizeRating, normalizeReviewBody, summarizeDistribution, type RatingSummary } from '@/modules/reviews/domain/reviews'
import { dimensionsFor, isExperienceKind, normalizeScores, reviewSort, type ExperienceKind, type ReviewScores, type ReviewSort } from '@/modules/reviews/domain/dimensions'

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

export type PublicReview = { id: number; rating: number; body: string; createdAt: Date; author: { name: string; color: string }; mine: boolean; helpfulCount: number; helpfulByMe: boolean; verified: ExperienceKind | ''; scores: ReviewScores }
export type DimensionSummary = { key: string; label: string; average: number; count: number }

const verifiedOf = (value: string): ExperienceKind | '' => isExperienceKind(value) ? value : ''
/** Stored scores limited to the dimensions the type currently shows. */
const scoresOf = (type: ItemRef['type'], rows: { key: string; score: number }[]): ReviewScores => {
  const known = new Set(dimensionsFor(type).map((dimension) => dimension.key))
  return Object.fromEntries(rows.filter((row) => known.has(row.key)).map((row) => [row.key, row.score]))
}
const LIST_ORDER: Record<ReviewSort, Prisma.ItemReviewOrderByWithRelationInput[]> = {
  new: [{ createdAt: 'desc' }, { id: 'desc' }],
  helpful: [{ helpfulVotes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
  high: [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  low: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
}

/**
 * The badge is kept once earned: download logs are pruned, so a later look must not take it back.
 * Returns the stored value, upgrading an unbadged review when the site now has a record of use.
 */
async function earnedBadge(review: { id: number; userId: number; verified: string; updatedAt: Date }, ref: ItemRef): Promise<ExperienceKind | ''> {
  if (verifiedOf(review.verified)) return verifiedOf(review.verified)
  const experience = await memberItemExperience(review.userId, ref).catch(() => '' as const)
  // The edit date is the member's; earning a badge is not an edit.
  if (experience) await db.itemReview.updateMany({ where: { id: review.id, verified: '' }, data: { verified: experience, updatedAt: review.updatedAt } }).catch(() => undefined)
  return experience
}

/**
 * Everything an item page shows: summary, the viewer's own review/favorite and a page of reviews.
 * `viewerExperience` also reports whether the viewer would get the verified badge (review form only).
 */
export async function itemEngagement(ref: ItemRef, userId: number | null, page = 1, options: { sort?: unknown; verifiedOnly?: boolean; viewerExperience?: boolean } = {}) {
  const reviewable = REVIEWABLE.includes(ref.type)
  const where = { itemType: ref.type, itemId: ref.id }
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1
  const sort = reviewSort(options.sort)
  const listed = { ...where, status: 'APPROVED', NOT: { body: '' }, ...(options.verifiedOnly ? { verified: { not: '' } } : {}) }
  const [ratings, mine, favorite, favorites, total, rows, dimensionRows, verifiedCount] = await Promise.all([
    reviewable ? db.itemReview.groupBy({ by: ['rating'], where: { ...where, ...counted }, _count: { rating: true } }) : Promise.resolve([]),
    reviewable && userId ? db.itemReview.findUnique({ where: { itemType_itemId_userId: { ...where, userId } }, include: { scores: true } }) : Promise.resolve(null),
    userId ? db.itemFavorite.findUnique({ where: { userId_itemType_itemId: { userId, ...where } } }) : Promise.resolve(null),
    db.itemFavorite.count({ where }),
    reviewable ? db.itemReview.count({ where: listed }) : Promise.resolve(0),
    reviewable ? db.itemReview.findMany({ where: listed, orderBy: LIST_ORDER[sort], skip: (safePage - 1) * PAGE, take: PAGE, include: { user: { select: { name: true, avatarColor: true } }, scores: true } }) : Promise.resolve([]),
    reviewable ? db.itemReviewScore.groupBy({ by: ['key'], where: { review: { ...where, ...counted } }, _avg: { score: true }, _count: { score: true } }) : Promise.resolve([]),
    reviewable ? db.itemReview.count({ where: { ...where, ...counted, verified: { not: '' } } }) : Promise.resolve(0),
  ])
  const dimensionByKey = new Map(dimensionRows.map((row) => [row.key, row]))
  const dimensions = dimensionsFor(ref.type).flatMap((dimension): DimensionSummary[] => {
    const row = dimensionByKey.get(dimension.key)
    return row && row._count.score && row._avg.score !== null ? [{ key: dimension.key, label: dimension.label, average: Math.round(row._avg.score * 10) / 10, count: row._count.score }] : []
  })
  const mineVerified = mine ? await earnedBadge(mine, ref) : ''
  const experience = !reviewable || !userId || !options.viewerExperience ? '' : mineVerified || (mine ? '' : await memberItemExperience(userId, ref).catch(() => '' as const))
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
    reviewable, summary, dimensions, verifiedCount, favorites, total, page: safePage, pages: Math.ceil(total / PAGE), sort, verifiedOnly: !!options.verifiedOnly,
    mine: mine ? { rating: mine.rating, body: mine.body, status: mine.status, verified: mineVerified, scores: scoresOf(ref.type, mine.scores) } : null,
    experience,
    favorite: favorite ? { notify: favorite.notify } : null,
    reviews: rows.map((row): PublicReview => ({ id: row.id, rating: row.rating, body: row.body, createdAt: row.createdAt, author: { name: row.user.name || 'کاربر موبوکام', color: row.user.avatarColor }, mine: row.userId === userId, helpfulCount: helpfulById.get(row.id) || 0, helpfulByMe: helpfulByMe.has(row.id), verified: row.userId === userId && mineVerified ? mineVerified : verifiedOf(row.verified), scores: scoresOf(ref.type, row.scores) })),
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

export async function saveReview(userId: number, ref: ItemRef, input: { rating: unknown; body?: unknown; scores?: unknown }) {
  await assertOn()
  if (!REVIEWABLE.includes(ref.type)) throw new ReviewError('برای این مورد امکان امتیازدهی نیست')
  if (!rateLimitHit(`review:${userId}`, 20, 3_600_000).ok) throw new ReviewError('کمی بعد دوباره امتحان کنید', 429)
  await publicItem(ref)
  const rating = normalizeRating(input.rating)
  const body = normalizeReviewBody(input.body)
  // Not sent (a client that only knows stars): stored dimension scores stay as they are.
  const scores = normalizeScores(ref.type, input.scores)
  const settings = await getModuleSettings('reviews').catch(() => ({} as Record<string, unknown>))
  const where = { itemType_itemId_userId: { itemType: ref.type, itemId: ref.id, userId } }
  const previous = await db.itemReview.findUnique({ where })
  // An unchanged approved text stays approved when only the stars change.
  const status = previous && previous.body === body && previous.status === 'APPROVED' ? 'APPROVED' : initialReviewStatus(body, settings['moderate-text'] !== false)
  // Kept once earned; otherwise taken from the site's own record of a purchase, download, watch or listen.
  const verified = (previous && verifiedOf(previous.verified)) || await memberItemExperience(userId, ref).catch(() => '' as const)
  const saved = await db.$transaction(async (tx) => {
    const review = await tx.itemReview.upsert({ where, create: { itemType: ref.type, itemId: ref.id, userId, rating, body, status, verified }, update: { rating, body, status, verified } })
    if (previous && previous.body !== body) await tx.itemReviewHelpful.deleteMany({ where: { reviewId: review.id } })
    if (scores) {
      await tx.itemReviewScore.deleteMany({ where: { reviewId: review.id } })
      const data = Object.entries(scores).map(([key, score]) => ({ reviewId: review.id, key, score }))
      if (data.length) await tx.itemReviewScore.createMany({ data })
    }
    return scoresOf(ref.type, await tx.itemReviewScore.findMany({ where: { reviewId: review.id } }))
  })
  await refreshItemStat(ref)
  return { rating, body, status, verified, scores: saved }
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

/**
 * The member's own ratings and reviews, last changed first, whatever their moderation state.
 * `item` is the current public card; it is null when the item is no longer public, so a
 * withdrawn item's title is not shown even to its reviewer.
 */
export async function memberItemReviews(userId: number, take: number) {
  const where = { userId }
  const [total, rows] = await Promise.all([
    db.itemReview.count({ where }),
    db.itemReview.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: Math.max(1, Math.min(500, Math.trunc(take) || 1)), include: { scores: true } }),
  ])
  const cards = await itemCards(rows.map((row) => ({ type: row.itemType, id: row.itemId }) as ItemRef))
  return {
    total,
    reviews: rows.map((row) => {
      const card = cards.get(`${row.itemType}:${row.itemId}`)
      return { id: row.id, itemType: row.itemType, itemId: row.itemId, rating: row.rating, body: row.body, status: row.status, verified: verifiedOf(row.verified), scores: scoresOf(row.itemType as ItemRef['type'], row.scores), updatedAt: row.updatedAt, item: card ? { title: card.title, url: card.url, image: card.image } : null }
    }),
  }
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

const BADGE_CURSOR = 'reviewBadgeBackfillCursor'

/**
 * Gives the verified-experience badge to reviews that have earned it but were never opened again
 * by their author: older reviews, and members who used the item after reviewing it. Walks the
 * unbadged reviews in id order, a bounded number per run, and starts over after the last one,
 * so a review becomes eligible again when its author uses the item later. Run before download
 * logs are pruned. One review that cannot be checked does not stop the others.
 */
export async function backfillVerifiedBadges(limit = 200) {
  if (!await isModuleEnabled('reviews')) return { checked: 0, badged: 0, failed: 0 }
  const take = Math.max(1, Math.min(1000, Math.trunc(limit) || 200))
  const after = Number((await db.setting.findUnique({ where: { key: BADGE_CURSOR } }))?.value) || 0
  const rows = await db.itemReview.findMany({ where: { verified: '', id: { gt: after } }, orderBy: { id: 'asc' }, take, select: { id: true, userId: true, itemType: true, itemId: true, updatedAt: true } })
  let badged = 0
  let failed = 0
  for (const row of rows) {
    try {
      const ref = parseItemKey(`${row.itemType}:${row.itemId}`)
      const experience = ref ? await memberItemExperience(row.userId, ref) : ''
      // Not an edit: the review keeps its date. A badge written meanwhile is left alone.
      if (experience) badged += (await db.itemReview.updateMany({ where: { id: row.id, verified: '' }, data: { verified: experience, updatedAt: row.updatedAt } })).count
    } catch (error) {
      failed++
      logEvent('error', 'reviews.badge_backfill_failed', { reviewId: row.id, error: String(error) })
    }
  }
  const next = rows.length === take ? rows[rows.length - 1].id : 0
  await db.setting.upsert({ where: { key: BADGE_CURSOR }, create: { key: BADGE_CURSOR, value: String(next) }, update: { value: String(next) } })
  return { checked: rows.length, badged, failed }
}

/**
 * Dimension averages and the number of verified raters for a few items at once (comparison).
 * Keyed by "type:id"; an item nobody scored has no dimensions. Empty when the reviews module is off.
 */
export async function dimensionSummariesFor(refs: ItemRef[]): Promise<Map<string, { dimensions: DimensionSummary[]; verifiedCount: number }>> {
  const reviewable = refs.filter((ref) => REVIEWABLE.includes(ref.type)).slice(0, 8)
  if (!reviewable.length || !await isModuleEnabled('reviews')) return new Map()
  return new Map(await Promise.all(reviewable.map(async (ref) => {
    const where = { itemType: ref.type, itemId: ref.id, ...counted }
    const [rows, verifiedCount] = await Promise.all([
      db.itemReviewScore.groupBy({ by: ['key'], where: { review: where }, _avg: { score: true }, _count: { score: true } }),
      db.itemReview.count({ where: { ...where, verified: { not: '' } } }),
    ])
    const byKey = new Map(rows.map((row) => [row.key, row]))
    const dimensions = dimensionsFor(ref.type).flatMap((dimension): DimensionSummary[] => {
      const row = byKey.get(dimension.key)
      return row && row._count.score && row._avg.score !== null ? [{ key: dimension.key, label: dimension.label, average: Math.round(row._avg.score * 10) / 10, count: row._count.score }] : []
    })
    return [itemKey(ref), { dimensions, verifiedCount }] as const
  })))
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
    db.itemReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, include: { user: { select: { id: true, name: true, email: true } }, scores: true } }),
  ])
  const cards = await itemCards(rows.map((row) => ({ type: row.itemType, id: row.itemId }) as ItemRef))
  return {
    total, page, pages: Math.ceil(total / 30),
    pending: await db.itemReview.count({ where: { status: 'PENDING' } }),
    reviews: rows.map((row) => {
      const card = cards.get(`${row.itemType}:${row.itemId}`)
      return { id: row.id, rating: row.rating, body: row.body, status: row.status, verified: verifiedOf(row.verified), scores: dimensionsFor(row.itemType as ItemRef['type']).flatMap((dimension) => { const hit = row.scores.find((score) => score.key === dimension.key); return hit ? [{ label: dimension.label, score: hit.score }] : [] }), createdAt: row.createdAt, user: row.user, item: { key: `${row.itemType}:${row.itemId}`, title: card?.title || '(حذف‌شده)', url: card?.url || '', label: ITEM_LABEL[row.itemType as keyof typeof ITEM_LABEL]?.one || row.itemType } }
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

/** For the staff moderation overview: review texts waiting for approval, oldest first. */
export async function waitingForModeration(take = 5) {
  const [count, rows] = await Promise.all([
    db.itemReview.count({ where: { status: 'PENDING' } }),
    db.itemReview.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take, select: { id: true, body: true, itemType: true, itemId: true, createdAt: true, user: { select: { name: true } } } }),
  ])
  const cards = await itemCards(rows.map((row) => ({ type: row.itemType, id: row.itemId }) as ItemRef))
  return { count, items: rows.map((row) => ({ id: row.id, text: plainText(row.body, 160), full: plainText(row.body, 2000), by: row.user.name || '', about: cards.get(`${row.itemType}:${row.itemId}`)?.title || '', at: row.createdAt })) }
}
