import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { attributeFieldsForCategory, parseJson } from '@/modules/catalog/server/product-config'
import { cleanRichText } from '@/shared/content/sanitize'
import { livePostWhere } from '@/modules/journal/domain/journal'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isPublicProduct, publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { hasVerifiedProductPurchase } from '@/modules/catalog/server/purchase-eligibility'
import { productReviewCriteria } from '@/modules/catalog/server/review-criteria'
import { readProductPriceHistory } from '@/modules/catalog/server/price-history-read'
import { readFrequentlyBoughtProducts } from '@/modules/catalog/server/frequently-bought'

type Context = { params: Promise<{ slug: string }> }

export async function GET(req: NextRequest, { params }: Context) {
  if (!await isStoreEnabled()) return err('not found', 404)
  const { slug } = await params
  const product = await db.product.findUnique({ where: { slug }, include: { category: { include: { attributeGroup: true } } } })
  if (!product || !isPublicProduct(product)) return err('not found', 404)
  const tab = req.nextUrl.searchParams.get('tab') || 'description'
  const pageRaw = Number(req.nextUrl.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(pageRaw) ? Math.min(1000, Math.max(1, pageRaw)) : 1
  if (tab === 'price-history') {
    const rawVariant = req.nextUrl.searchParams.get('variantId')
    if (rawVariant !== null && !/^\d+$/.test(rawVariant)) return err('not found', 404)
    const history = await readProductPriceHistory(product.id, Number(rawVariant || 0))
    return history ? ok(history) : err('not found', 404)
  }
  if (tab === 'frequently-bought') {
    const recommendations = await readFrequentlyBoughtProducts(product.id)
    return recommendations ? ok(recommendations) : err('not found', 404)
  }
  if (tab === 'description') return ok({ htmlFa: cleanRichText(product.description), htmlEn: cleanRichText(product.descriptionEn || product.description) })
  if (tab === 'specifications') {
    const fields = await attributeFieldsForCategory(product.categoryId)
    const values = parseJson<Record<string, string>>(product.specifications, {})
    return ok({ groupName: product.category?.attributeGroup?.name || '', fields: fields.filter(field => !field.variant && values[field.key]).map(field => ({ ...field, value: values[field.key] })), kind: product.kind })
  }
  if (tab === 'faq') return ok({ items: parseJson(product.faqs, []) })
  if (tab === 'reviews') {
    const where = { productId: product.id, status: 'APPROVED' }
    const user = await requireUser(req)
    const [total, aggregate, breakdown, rows, criteria, purchased, existing] = await Promise.all([
      db.productReview.count({ where }),
      db.productReview.aggregate({ where, _avg: { rating: true } }),
      db.productReview.groupBy({ by: ['rating'], where, _count: { rating: true } }),
      db.productReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 10, take: 10, select: { id: true, rating: true, criteria: true, title: true, body: true, createdAt: true, user: { select: { name: true } } } }),
      productReviewCriteria(product.id),
      user ? hasVerifiedProductPurchase(user.id, product.id) : false,
      user ? db.productReview.findUnique({ where: { productId_userId: { productId: product.id, userId: user.id } } }) : null,
    ])
    return ok({
      total,
      average: aggregate._avg.rating || 0,
      breakdown: Object.fromEntries(breakdown.map(row => [row.rating, row._count.rating])),
      criteria,
      canReview: Boolean(user) && purchased && !existing,
      signedIn: Boolean(user),
      hasReviewed: Boolean(existing),
      page,
      pages: Math.max(1, Math.ceil(total / 10)),
      items: rows.map(row => ({ ...row, criteria: parseJson(row.criteria, {}), user: { name: row.user.name || 'Customer' } })),
    })
  }
  if (tab === 'questions') {
    const where = { productId: product.id, status: 'APPROVED' }
    const [total, rows] = await Promise.all([
      db.productQuestion.count({ where }),
      db.productQuestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 10, take: 10, select: { id: true, body: true, answer: true, guestName: true, createdAt: true, user: { select: { name: true } } } }),
    ])
    return ok({ total, page, pages: Math.max(1, Math.ceil(total / 10)), items: rows.map(row => ({ ...row, user: { name: row.user?.name || row.guestName || 'Guest' } })) })
  }
  if (tab === 'related-products') {
    const rows = await db.product.findMany({ where: { id: { not: product.id }, ...publicProductWhere, categoryId: product.categoryId || undefined }, orderBy: [{ featured: 'desc' }, { id: 'desc' }], take: 8, select: { id: true, slug: true, name: true, nameEn: true, image: true, price: true, currency: true, kind: true } })
    return ok({ items: rows })
  }
  if (tab === 'related-posts') {
    if (!await isModuleEnabled('journal')) return ok({ items: [] })
    const linked = await db.postItemLink.findMany({
      where: { itemType: 'product', itemId: product.id, post: livePostWhere() },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: 6,
      select: { post: { select: { id: true, slug: true, title: true, titleEn: true, cover: true, excerpt: true, excerptEn: true } } },
    })
    const explicit = linked.map((link) => link.post)
    if (explicit.length === 6) return ok({ items: explicit })
    const excluded = explicit.map((post) => post.id)
    const token = product.name.split(/\s+/).find(word => word.length >= 4)
    const where = { ...livePostWhere(), id: { notIn: excluded }, ...(token ? { OR: [{ title: { contains: token } }, { titleEn: { contains: token } }] } : {}) }
    const select = { id: true, slug: true, title: true, titleEn: true, cover: true, excerpt: true, excerptEn: true }
    const rows = await db.post.findMany({ where, orderBy: { publishedAt: 'desc' }, take: 6 - explicit.length, select })
    const contextual = rows.length === 6 - explicit.length ? rows : [...rows, ...await db.post.findMany({ where: { ...livePostWhere(), id: { notIn: [...excluded, ...rows.map((post) => post.id)] } }, orderBy: { publishedAt: 'desc' }, take: 6 - explicit.length - rows.length, select })]
    return ok({ items: [...explicit, ...contextual] })
  }
  return err('unknown tab', 404)
}
