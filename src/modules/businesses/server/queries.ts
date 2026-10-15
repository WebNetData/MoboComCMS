import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { itemEngagement } from '@/modules/reviews/server/reviews'
import { summarizeDistribution } from '@/modules/reviews/domain/reviews'
import { BusinessError } from '../domain/businesses'
import type { BusinessProfile } from '@prisma/client'

const publicWhere = { status: 'PUBLISHED', OR: [{ kind: { not: 'SELLER' } }, { seller: { is: { status: 'ACTIVE' } } }] }
const pageNumber = (input: unknown) => Math.min(10000, Math.max(1, Number.isSafeInteger(Number(input)) ? Number(input) : 1))
async function on() { if (!await isModuleEnabled('businesses') || !await isModuleEnabled('reviews')) throw new BusinessError('این بخش فعال نیست', 404) }
export type BusinessCard = Pick<BusinessProfile, 'id' | 'slug' | 'name' | 'kind' | 'domain' | 'website' | 'category' | 'description'> & { average: number | null; reviewCount: number }

export async function businessDirectory(input: { q?: unknown; category?: unknown; kind?: unknown; page?: unknown }) {
  await on()
  const q = String(input.q || '').trim().slice(0, 100), category = String(input.category || '').trim().slice(0, 80), kind = ['EXTERNAL', 'SELLER', 'SITE'].includes(String(input.kind)) ? String(input.kind) : ''
  const page = pageNumber(input.page), where = { ...publicWhere, ...(category ? { category } : {}), ...(kind ? { kind } : {}), ...(q ? { AND: [{ OR: [{ name: { contains: q } }, { domain: { contains: q.toLowerCase() } }, { category: { contains: q } }] }] } : {}) }
  const [total, rows, categories] = await Promise.all([
    db.businessProfile.count({ where }), db.businessProfile.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
    db.businessProfile.findMany({ where: publicWhere, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' }, take: 100 }),
  ])
  const stats = await db.itemStat.findMany({ where: { itemType: 'business', itemId: { in: rows.map(row => row.id) } } })
  return { q, category, kind, page, pages: Math.ceil(total / 20), total, categories: categories.map(row => row.category).filter(Boolean), businesses: rows.map((row): BusinessCard => { const stat = stats.find(stat => stat.itemId === row.id); return { id: row.id, slug: row.slug, name: row.name, kind: row.kind, domain: row.domain, website: row.website, category: row.category, description: row.description, average: stat?.ratingCount ? Math.round(stat.ratingSum / stat.ratingCount * 10) / 10 : null, reviewCount: stat?.ratingCount || 0 } }) }
}

export async function businessPage(slug: string, viewerId: number | null, input: { page?: unknown; sort?: unknown; stars?: unknown } = {}) {
  await on()
  const profile = await db.businessProfile.findFirst({ where: { ...publicWhere, slug }, include: { seller: { select: { userId: true } } } })
  if (!profile) throw new BusinessError('کسب‌وکار پیدا نشد', 404)
  const page = pageNumber(input.page), stars = Number(input.stars), rating = Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null
  const sort = ['high', 'low'].includes(String(input.sort)) ? String(input.sort) : 'new'
  const canReply = !!viewerId && (profile.kind === 'SELLER' ? profile.seller?.userId === viewerId : profile.representativeId === viewerId)
  const publicProfile = { id: profile.id, slug: profile.slug, name: profile.name, kind: profile.kind, domain: profile.domain, website: profile.website, category: profile.category, description: profile.description, represented: profile.kind === 'SELLER' || !!profile.representativeId }
  if (profile.kind !== 'SELLER') {
    const data = await itemEngagement({ type: 'business', id: profile.id }, viewerId, page, { sort, viewerExperience: true, rating })
    const metadata = new Map((await db.itemReview.findMany({ where: { id: { in: data.reviews.map(row => row.id) }, itemType: 'business', itemId: profile.id, status: 'APPROVED' }, select: { id: true, businessReply: true, experiencedOn: true } })).map(row => [row.id, row]))
    const own = viewerId ? await db.itemReview.findUnique({ where: { itemType_itemId_userId: { itemType: 'business', itemId: profile.id, userId: viewerId } }, select: { experiencedOn: true } }) : null
    return { profile: publicProfile, canReply, dimensions: data.dimensions, page: data.page, pages: data.pages, total: data.total, summary: data.summary, sort, stars: rating, mine: data.mine ? { ...data.mine, experiencedOn: own?.experiencedOn?.toISOString().slice(0, 10) || null } : null, orders: [], reviews: data.reviews.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), reply: metadata.get(row.id)?.businessReply || '', experiencedOn: metadata.get(row.id)?.experiencedOn?.toISOString().slice(0, 10) || null })) }
  }
  const where = { sellerId: profile.sellerId!, status: 'APPROVED', ...(rating ? { rating } : {}) }
  const [buckets, total, rows, orders] = await Promise.all([
    db.sellerReview.groupBy({ by: ['rating'], where: { sellerId: profile.sellerId!, status: 'APPROVED' }, _count: true }), db.sellerReview.count({ where }),
    db.sellerReview.findMany({ where, orderBy: sort === 'new' ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ rating: sort === 'high' ? 'desc' : 'asc' }, { id: 'desc' }], skip: (page - 1) * 10, take: 10 }),
    viewerId && !canReply ? db.order.findMany({ where: { userId: viewerId, status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } }, lines: { some: { sellerId: profile.sellerId! } } }, select: { id: true }, orderBy: { id: 'desc' }, take: 30 }) : [],
  ])
  const names = new Map((await db.user.findMany({ where: { id: { in: rows.map(row => row.userId) } }, select: { id: true, name: true } })).map(row => [row.id, row.name]))
  const reviewed = new Set((await db.sellerReview.findMany({ where: { sellerId: profile.sellerId!, orderId: { in: orders.map(order => order.id) } }, select: { orderId: true } })).map(row => row.orderId))
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const bucket of buckets) if (bucket.rating >= 1 && bucket.rating <= 5) distribution[bucket.rating - 1] = bucket._count
  return { profile: publicProfile, canReply, dimensions: [], page, pages: Math.ceil(total / 10), total, summary: summarizeDistribution(distribution), sort, stars: rating, mine: null, orders: orders.filter(order => !reviewed.has(order.id)), reviews: rows.map(row => ({ id: row.id, rating: row.rating, body: row.body, createdAt: row.createdAt.toISOString(), author: { name: names.get(row.userId) || 'خریدار موبوکام', color: '' }, mine: row.userId === viewerId, helpfulCount: 0, helpfulByMe: false, verified: 'PURCHASE', scores: {}, reply: row.reply, experiencedOn: null as string | null })) }
}

/**
 * Experiences waiting for a decision, for the staff moderation overview: oldest first, with the business they are
 * about. Seller experiences are SellerReview rows with ids of their own, so they are counted here and listed on
 * the owning page, never mixed into one id space.
 */
export async function waitingForModeration(take = 5) {
  const sellers = await db.businessProfile.findMany({ where: { sellerId: { not: null } }, select: { sellerId: true } })
  const sellerIds = sellers.flatMap(profile => profile.sellerId ? [profile.sellerId] : [])
  const where = { itemType: 'business', status: 'PENDING' }
  const [count, sellerCount, rows, requestCount] = await Promise.all([
    db.itemReview.count({ where }),
    sellerIds.length ? db.sellerReview.count({ where: { status: 'PENDING', sellerId: { in: sellerIds } } }) : 0,
    db.itemReview.findMany({ where, orderBy: { createdAt: 'asc' }, take, select: { id: true, itemId: true, body: true, createdAt: true, user: { select: { name: true } } } }),
    db.businessRequest.count({ where: { status: 'PENDING' } }),
  ])
  const names = new Map((await db.businessProfile.findMany({ where: { id: { in: rows.map(row => row.itemId) } }, select: { id: true, name: true } })).map(profile => [profile.id, profile.name]))
  const plain = (value: string, max: number) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  return { count: count + sellerCount + requestCount, items: rows.map(row => ({ id: row.id, text: plain(row.body, 160), full: plain(row.body, 2000), by: row.user.name || '', about: names.get(row.itemId) || '', at: row.createdAt })) }
}

export async function businessAdminData(input: { page?: unknown; q?: unknown; pendingPage?: unknown; requestPage?: unknown; edit?: unknown } = {}) {
  const q = String(input.q || '').trim().slice(0, 100), page = pageNumber(input.page), pendingPage = pageNumber(input.pendingPage), requestPage = pageNumber(input.requestPage)
  const where = q ? { OR: [{ name: { contains: q } }, { domain: { contains: q } }] } : {}
  const [profiles, total, editing, boundSellers] = await Promise.all([
    db.businessProfile.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 20, take: 20 }),
    db.businessProfile.count({ where }),
    Number.isSafeInteger(Number(input.edit)) && Number(input.edit) > 0 ? db.businessProfile.findUnique({ where: { id: Number(input.edit) } }) : null,
    db.businessProfile.findMany({ where: { sellerId: { not: null } }, select: { id: true, sellerId: true, name: true } }),
  ])
  const pendingWhere = { status: 'PENDING', sellerId: { in: boundSellers.flatMap(row => row.sellerId ? [row.sellerId] : []) } }
  const [sellers, itemReviews, sellerReviews, itemCount, sellerCount, requests, requestCount] = await Promise.all([
    db.seller.findMany({ where: { status: 'ACTIVE' }, select: { id: true, shopName: true }, take: 100 }),
    db.itemReview.findMany({ where: { itemType: 'business', status: 'PENDING' }, orderBy: { id: 'asc' }, skip: (pendingPage - 1) * 25, take: 25, select: { id: true, itemId: true, rating: true, body: true } }),
    db.sellerReview.findMany({ where: pendingWhere, orderBy: { id: 'asc' }, skip: (pendingPage - 1) * 25, take: 25, select: { id: true, sellerId: true, rating: true, body: true } }),
    db.itemReview.count({ where: { itemType: 'business', status: 'PENDING' } }), db.sellerReview.count({ where: pendingWhere }),
    db.businessRequest.findMany({ where: { status: 'PENDING' }, orderBy: { id: 'asc' }, skip: (requestPage - 1) * 25, take: 25, select: { id: true, kind: true, name: true, domain: true, category: true, note: true, createdAt: true, requester: { select: { name: true } } } }),
    db.businessRequest.count({ where: { status: 'PENDING' } }),
  ])
  const names = new Map((await db.businessProfile.findMany({ where: { id: { in: itemReviews.map(row => row.itemId) } }, select: { id: true, name: true } })).map(row => [row.id, row.name]))
  return { profiles, editing, sellers, q, page, pages: Math.ceil(total / 20), total, pendingPage, pendingPages: Math.max(Math.ceil(itemCount / 25), Math.ceil(sellerCount / 25)), pendingCount: itemCount + sellerCount, requests, requestPage, requestPages: Math.ceil(requestCount / 25), requestCount, pending: [...itemReviews.map(row => ({ ...row, businessId: row.itemId, business: names.get(row.itemId) || 'کسب‌وکار' })), ...sellerReviews.map(row => { const profile = boundSellers.find(profile => profile.sellerId === row.sellerId)!; return { ...row, businessId: profile.id, business: profile.name } })] }
}
