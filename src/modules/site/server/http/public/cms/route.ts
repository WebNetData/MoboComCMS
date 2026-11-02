import { categoryFilter, categoryMembership } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { getViewer } from '@/modules/membership/server/membership'
import { teaserHtml } from '@/modules/membership/domain/membership'
import { accessFor, paywallEnabled } from '@/modules/paywall/server/paywall'
import { isLivePost, livePostWhere } from '@/modules/journal/domain/journal'
import { incrementPostViews } from '@/modules/journal/server/views'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { closedSectionPlugins } from '@/modules/site/server/maintenance'

/** Members-only and paid article bodies are reduced to a teaser for everyone who may not read them. */
async function gatePosts<T extends { id?: number; access?: string; content?: string; contentEn?: string }>(posts: T[]): Promise<(T & { locked?: boolean })[]> {
  const paid = await paywallEnabled() ? new Set((await db.paidItem.findMany({ where: { ownerType: 'post', active: true, ownerId: { in: posts.map((post) => post.id || 0) } }, select: { ownerId: true } })).map((row) => row.ownerId)) : new Set<number>()
  if (!paid.size && !posts.some((post) => post.access === 'MEMBERS')) return posts
  const viewer = await getViewer()
  const teaser = (post: T) => ({ ...post, content: teaserHtml(post.content || ''), contentEn: teaserHtml(post.contentEn || ''), locked: true })
  return Promise.all(posts.map(async (post) => {
    if (post.id && paid.has(post.id)) return (await accessFor(viewer, [{ ownerType: 'post', ownerId: post.id }])).decision.open ? post : teaser(post)
    return post.access === 'MEMBERS' && !viewer.opens ? teaser(post) : post
  }))
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') || ''
  const section = type === 'post' || type === 'posts' ? 'journal' : type === 'products' ? 'store' : null
  if (section && (await closedSectionPlugins()).has(section)) return err('not found', 404)

  if (type === 'navpages') {
    const pages = await db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    return ok(pages)
  }

  if (type === 'page') {
    const slug = sp.get('slug') || ''
    const page = await db.page.findFirst({ where: { OR: [{ slug, status: 'PUBLISHED' }, { slug: slug + '.draft' }] } })
    if (!page || page.status !== 'PUBLISHED') return err('not found', 404)
    return ok(page)
  }

  if (type === 'posts') {
    const category = sp.get('category')
    const posts = await db.post.findMany({
      where: { ...livePostWhere(), ...await categoryFilter(category || '') },
      include: { categories: { include: { category: true } }, category: true, author: { select: { name: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })
    return ok(await gatePosts(posts))
  }

  if (type === 'post') {
    const slug = sp.get('slug') || ''
    const post = await db.post.findUnique({ where: { slug }, include: { categories: { include: { category: true } }, category: true, author: { select: { name: true } } } })
    if (!post || !isLivePost(post)) return err('not found', 404)
    await incrementPostViews({ id: post.id })
    const related = await db.post.findMany({
      where: { ...livePostWhere(), ...categoryMembership(postCategories(post).map(c => c.id)), id: { not: post.id } },
      take: 3,
      orderBy: { publishedAt: 'desc' },
    })
    const [gated] = await gatePosts([post])
    return ok({ ...gated, related: await gatePosts(related) })
  }

  if (type === 'products') {
    if (!await isStoreEnabled()) return err('فروشگاه در حال حاضر غیرفعال است', 404)
    const category = sp.get('category')
    const products = await db.product.findMany({
      where: { ...publicProductWhere, ...(category ? { category: { slug: category } } : {}) },
      include: { category: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    })
    return ok(products)
  }

  return err('unknown type', 404)
}
