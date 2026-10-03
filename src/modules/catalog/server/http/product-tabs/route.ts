import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { attributeFieldsForCategory, parseJson } from '@/modules/catalog/server/product-config'
import { cleanRichText } from '@/shared/content/sanitize'
import { livePostWhere } from '@/modules/journal/domain/journal'
import { isModuleEnabled } from '@/extensions/server/modules'

type Context = { params: Promise<{ slug: string }> }
const criteriaKeys = ['quality', 'value', 'usability'] as const

function criteriaAverages(rows: { criteria: string }[]) {
  const totals: Record<string, { sum: number; count: number }> = {}
  for (const row of rows.slice(0, 500)) {
    const parsed = parseJson<Record<string, unknown>>(row.criteria, {})
    for (const key of criteriaKeys) {
      const value = Number(parsed[key])
      if (!Number.isFinite(value) || value < 1 || value > 5) continue
      const slot = totals[key] || { sum: 0, count: 0 }
      slot.sum += value
      slot.count += 1
      totals[key] = slot
    }
  }
  return Object.fromEntries(criteriaKeys.map(key => [key, totals[key]?.count ? Math.round((totals[key].sum / totals[key].count) * 10) / 10 : 0]))
}

export async function GET(req: NextRequest, { params }: Context) {
  if (!await isStoreEnabled()) return err('not found', 404)
  const { slug } = await params
  const product = await db.product.findUnique({ where: { slug }, include: { category: { include: { attributeGroup: true } } } })
  if (!product?.active || product.approval !== 'APPROVED') return err('not found', 404)
  const tab = req.nextUrl.searchParams.get('tab') || 'description'
  const pageRaw = Number(req.nextUrl.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(pageRaw) ? Math.min(1000, Math.max(1, pageRaw)) : 1
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
    const [total, aggregate, breakdown, rows, criteriaRows, purchased, existing] = await Promise.all([
      db.productReview.count({ where }),
      db.productReview.aggregate({ where, _avg: { rating: true } }),
      db.productReview.groupBy({ by: ['rating'], where, _count: { rating: true } }),
      db.productReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 10, take: 10, select: { id: true, rating: true, criteria: true, title: true, body: true, createdAt: true, user: { select: { name: true } } } }),
      db.productReview.findMany({ where, select: { criteria: true }, take: 500 }),
      user ? db.order.count({ where: { userId: user.id, productId: product.id, status: 'PAID', invoice: { status: 'PAID' } } }) : 0,
      user ? db.productReview.findUnique({ where: { productId_userId: { productId: product.id, userId: user.id } } }) : null,
    ])
    return ok({
      total,
      average: aggregate._avg.rating || 0,
      breakdown: Object.fromEntries(breakdown.map(row => [row.rating, row._count.rating])),
      criteria: criteriaAverages(criteriaRows),
      canReview: Boolean(user) && purchased > 0 && !existing,
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
    const rows = await db.product.findMany({ where: { id: { not: product.id }, active: true, approval: 'APPROVED', categoryId: product.categoryId || undefined }, orderBy: [{ featured: 'desc' }, { id: 'desc' }], take: 8, select: { id: true, slug: true, name: true, nameEn: true, image: true, price: true, currency: true, kind: true } })
    return ok({ items: rows })
  }
  if (tab === 'related-posts') {
    if (!await isModuleEnabled('journal')) return ok({ items: [] })
    const token = product.name.split(/\s+/).find(word => word.length >= 4)
    const rows = await db.post.findMany({ where: { ...livePostWhere(), ...(token ? { OR: [{ title: { contains: token } }, { titleEn: { contains: token } }] } : {}) }, orderBy: { publishedAt: 'desc' }, take: 6, select: { id: true, slug: true, title: true, titleEn: true, cover: true, excerpt: true, excerptEn: true } })
    return ok({ items: rows.length ? rows : await db.post.findMany({ where: livePostWhere(), orderBy: { publishedAt: 'desc' }, take: 6, select: { id: true, slug: true, title: true, titleEn: true, cover: true, excerpt: true, excerptEn: true } }) })
  }
  return err('unknown tab', 404)
}
