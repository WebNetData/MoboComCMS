import { db } from '@/platform/database/prisma'
import { TAXONOMIES } from '@/modules/taxonomy/domain/taxonomy'
import { publicCelebrities } from '@/modules/celebrities/server/celebrities'

// The entities of the site beyond its documents: forums a visitor may read, studios, film people, public
// collections and the category pages of every section. Each list is asked of the module that owns the
// entity, with that module's own rule for what a visitor may see, so nothing private is ever advertised.

export type SitemapEntry = { path: string; lastModified?: Date; changeFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly'; priority: number }

const safe = async <T>(load: () => Promise<T[]>): Promise<T[]> => { try { return await load() } catch { return [] } }

/** Forums and topics a visitor without an account can open: the forum's own visibility rule, not a column read. */
export async function forumSitemap(): Promise<SitemapEntry[]> {
  const [{ visibleCategories }, { GUEST }] = await Promise.all([import('@/modules/forum/server/forum'), import('@/modules/forum/domain/community')])
  // What a visitor is shown already leaves out members-only forums and forums of a group.
  const open = await visibleCategories(GUEST)
  if (!open.length) return []
  const threads = await db.forumThread.findMany({ where: { status: 'VISIBLE', listed: true, categoryId: { in: open.map((forum) => forum.id) } }, select: { id: true, lastPostAt: true }, orderBy: { lastPostAt: 'desc' }, take: 5000 })
  return [
    ...open.map((forum) => ({ path: `/forum/c/${forum.slug}`, changeFrequency: 'daily' as const, priority: 0.5 })),
    ...threads.map((thread) => ({ path: `/forum/t/${thread.id}`, lastModified: thread.lastPostAt, changeFrequency: 'weekly' as const, priority: 0.4 })),
  ]
}

/** Studios, film people, public collections and category pages: only those with something public behind them. */
export async function entitySitemap(now = new Date()): Promise<SitemapEntry[]> {
  const live = { status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' }
  const [studios, people, collections, terms] = await Promise.all([
    safe(() => db.studio.findMany({ where: { OR: [{ gamesDeveloped: { some: live } }, { gamesPublished: { some: live } }, { softwareDeveloped: { some: live } }, { softwarePublished: { some: live } }] }, select: { id: true, updatedAt: true }, take: 5000 })),
    safe(() => db.cinemaPerson.findMany({ where: { credits: { some: { title: live } } }, select: { id: true }, take: 5000 })),
    safe(() => db.userCollection.findMany({ where: { visibility: { in: ['PUBLIC', 'EDITORIAL'] }, items: { some: {} } }, select: { id: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 5000 })),
    safe(async () => {
      const { termTree } = await import('@/modules/taxonomy/server/taxonomy')
      const trees = await Promise.all(TAXONOMIES.map((taxonomy) => termTree(taxonomy).catch(() => [])))
      // A category page with nothing in it is not worth a crawl.
      return trees.flat().flatMap((term) => [term, ...term.children]).filter((term) => term.count > 0).map((term) => ({ path: term.path }))
    }),
  ])
  const listed = new Set((await publicCelebrities(now).catch(() => [])).map((row) => row.cinemaPersonId))
  return [
    ...(studios.length ? [{ path: '/studios', changeFrequency: 'weekly' as const, priority: 0.5 }] : []),
    ...studios.map((row) => ({ path: `/studios/${row.id}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
    // A person with a public page redirects there, so only the others are listed under cinema.
    ...people.filter((row) => !listed.has(row.id)).map((row) => ({ path: `/cinema/people/${row.id}`, changeFrequency: 'monthly' as const, priority: 0.4 })),
    ...(collections.length ? [{ path: '/collections', changeFrequency: 'daily' as const, priority: 0.5 }] : []),
    ...collections.map((row) => ({ path: `/collections/${row.id}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...terms.map((row) => ({ path: row.path, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ]
}
