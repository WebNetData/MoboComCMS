import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { categoryDescendants } from '@/modules/site/domain/categories'
import { categoryMembership } from '@/modules/site/server/categories'
import type { LandingPost, LandingProduct } from '@/modules/site/domain/homepage'
import { livePostWhere } from '@/modules/journal/domain/journal'

/** Post query of a builder "posts" block. `categoryId` wins over `category` (slug). */
export type PostQuery = { category: string; categoryId: number | null; limit: number; exclude: number | null }
export type ProductQuery = { category: string; categoryId: number | null; kind: '' | 'VIRTUAL' | 'PHYSICAL'; limit: number; exclude: number | null }

export const postQueryKey = (q: PostQuery) => `p|${q.categoryId ?? ''}|${q.category}|${q.limit}|${q.exclude ?? ''}`
export const productQueryKey = (q: ProductQuery) => `s|${q.categoryId ?? ''}|${q.category}|${q.kind}|${q.limit}|${q.exclude ?? ''}`

const clampLimit = (n: number) => Math.min(12, Math.max(1, Math.round(n) || 3))

export async function getBuilderPosts(q: PostQuery): Promise<LandingPost[]> {
  let where: Record<string, unknown> = livePostWhere()
  if (q.categoryId || q.category) {
    const nodes = await db.postCategory.findMany({ select: { id: true, parentId: true, slug: true, name: true } }).catch(() => [])
    const selected = q.categoryId ? nodes.find((node) => node.id === q.categoryId) : nodes.find((node) => node.slug === q.category)
    if (!selected) return []
    where = { ...where, ...categoryMembership(categoryDescendants(nodes, selected.id)) }
  }
  if (q.exclude) where = { ...where, id: { not: q.exclude } }
  const posts = await db.post.findMany({ where, include: { category: true }, orderBy: { publishedAt: 'desc' }, take: clampLimit(q.limit) }).catch(() => [])
  return posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    titleEn: post.titleEn,
    excerpt: post.excerpt,
    excerptEn: post.excerptEn,
    cover: post.cover,
    publishedAt: post.publishedAt,
    category: post.category ? { name: post.category.name, nameEn: post.category.nameEn } : null,
  }))
}

export async function getBuilderProducts(q: ProductQuery): Promise<LandingProduct[]> {
  const settings = await getSettings().catch(() => null)
  if (settings?.storeEnabled !== 'true') return []
  let where: Record<string, unknown> = { active: true }
  if (q.kind) where = { ...where, kind: q.kind }
  if (q.categoryId || q.category) {
    const nodes = await db.productCategory.findMany({ select: { id: true, parentId: true, slug: true, name: true } }).catch(() => [])
    const selected = q.categoryId ? nodes.find((node) => node.id === q.categoryId) : nodes.find((node) => node.slug === q.category)
    if (!selected) return []
    where = { ...where, categoryId: { in: categoryDescendants(nodes, selected.id) } }
  }
  if (q.exclude) where = { ...where, id: { not: q.exclude } }
  const products = await db.product.findMany({ where, include: { category: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }], take: clampLimit(q.limit) }).catch(() => [])
  return products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    price: product.price,
    currency: product.currency,
    image: product.image,
    category: product.category ? { name: product.category.name, nameEn: product.category.nameEn } : null,
  }))
}
