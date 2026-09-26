import { categoryFilter, categoryMembership } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { getViewer } from '@/modules/membership/server/membership'
import { teaserHtml } from '@/modules/membership/domain/membership'

/** Members-only article bodies are reduced to a teaser for everyone else. */
async function gatePosts<T extends { access?: string; content?: string; contentEn?: string }>(posts: T[]): Promise<(T & { locked?: boolean })[]> {
  if (!posts.some((post) => post.access === 'MEMBERS')) return posts
  const viewer = await getViewer()
  if (viewer.member) return posts
  return posts.map((post) => (post.access === 'MEMBERS' ? { ...post, content: teaserHtml(post.content || ''), contentEn: teaserHtml(post.contentEn || ''), locked: true } : post))
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') || ''

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
      where: { status: 'PUBLISHED', ...await categoryFilter(category || '') },
      include: { categories: { include: { category: true } }, category: true, author: { select: { name: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })
    return ok(await gatePosts(posts))
  }

  if (type === 'post') {
    const slug = sp.get('slug') || ''
    const post = await db.post.findUnique({ where: { slug }, include: { categories: { include: { category: true } }, category: true, author: { select: { name: true } } } })
    if (!post || post.status !== 'PUBLISHED') return err('not found', 404)
    await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } })
    const related = await db.post.findMany({
      where: { status: 'PUBLISHED', ...categoryMembership(postCategories(post).map(c => c.id)), id: { not: post.id } },
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
      where: { active: true, ...(category ? { category: { slug: category } } : {}) },
      include: { category: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    })
    return ok(products)
  }

  return err('unknown type', 404)
}
