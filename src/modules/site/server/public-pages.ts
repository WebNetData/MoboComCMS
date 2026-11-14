import { db } from '@/platform/database/prisma'

export type PublicPageLink = { id: number; title: string; href: string }
const select = { id: true, title: true, slug: true } as const
const link = (page: { id: number; title: string; slug: string }): PublicPageLink => ({ id: page.id, title: page.title, href: `/p/${page.slug}` })

/** Public titles/addresses only. Admin consumers do not gain access to private Page content. */
export async function publishedPageOptions(): Promise<PublicPageLink[]> {
  return (await db.page.findMany({ where: { status: 'PUBLISHED' }, select, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map(link)
}

/** Re-resolve publication and slug on every read; drafts/deleted pages never become links. */
export async function publishedPageLinks(ids: readonly number[]): Promise<PublicPageLink[]> {
  const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))]
  if (!unique.length) return []
  const rows = await db.page.findMany({ where: { id: { in: unique }, status: 'PUBLISHED' }, select }).catch(() => [])
  const pages = new Map(rows.map(page => [page.id, link(page)]))
  return unique.flatMap(id => pages.has(id) ? [pages.get(id)!] : [])
}
