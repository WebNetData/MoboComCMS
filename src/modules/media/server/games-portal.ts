import { db } from '@/platform/database/prisma'
import { termTree, ownerIdsForTermSlug } from '@/modules/taxonomy/server/taxonomy'
import { flatten } from '@/modules/taxonomy/domain/taxonomy'

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' })

/**
 * Genre tiles for the games home and the genre options of the browser: the
 * games taxonomy (top level first) with artwork — the term's own image, else
 * the key art of its newest game.
 */
export async function gameGenres() {
  const tree = await termTree('games').catch(() => [])
  const terms = flatten(tree).filter((term) => term.count > 0)
  const tiles = await Promise.all(terms.filter((term) => term.depth === 1).slice(0, 12).map(async (term) => {
    let image = term.image
    if (!image) {
      const ids = await ownerIdsForTermSlug('games', term.slug) || []
      const game = ids.length ? await db.gameTitle.findFirst({ where: { ...live(), id: { in: ids }, OR: [{ backdrop: { not: '' } }, { cover: { not: '' } }] }, orderBy: { publishedAt: 'desc' }, select: { backdrop: true, cover: true } }).catch(() => null) : null
      image = game?.backdrop || game?.cover || ''
    }
    return { key: String(term.id), name: term.name, href: term.path, image, count: term.count }
  }))
  return { tiles, options: terms.map((term) => ({ value: term.slug, label: `${'— '.repeat(term.depth - 1)}${term.name}` })) }
}
