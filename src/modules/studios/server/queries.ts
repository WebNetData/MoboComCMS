import { db } from '@/platform/database/prisma'

type Enabled = { games: boolean; software: boolean }
const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' })

/** Public directory, with counts computed only from currently visible titles. */
export async function studioDirectory(input: { q?: string; page?: number }, enabled: Enabled) {
  const now = new Date()
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const q = String(input.q || '').trim().slice(0, 80)
  const visible = [
    ...(enabled.games ? [{ gamesDeveloped: { some: live(now) } }, { gamesPublished: { some: live(now) } }] : []),
    ...(enabled.software ? [{ softwareDeveloped: { some: live(now) } }, { softwarePublished: { some: live(now) } }] : []),
  ]
  if (!visible.length) return { items: [], total: 0, page, pages: 1 }
  const where = { AND: [{ OR: visible }, ...(q ? [{ name: { contains: q } }] : [])] }
  const total = await db.studio.count({ where })
  const pages = Math.max(1, Math.ceil(total / 24))
  const currentPage = Math.min(page, pages)
  const rows = await db.studio.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (currentPage - 1) * 24, take: 24, select: { id: true, name: true, logo: true, summary: true } })
  const ids = rows.map((row) => row.id)
  if (!ids.length) return { items: [], total, page: currentPage, pages }
  const groups = await Promise.all([
    enabled.games ? db.gameTitle.groupBy({ by: ['developerStudioId'], where: { ...live(now), developerStudioId: { in: ids } }, _count: { _all: true } }) : [],
    enabled.games ? db.gameTitle.groupBy({ by: ['publisherStudioId'], where: { ...live(now), publisherStudioId: { in: ids } }, _count: { _all: true } }) : [],
    enabled.software ? db.softwareTitle.groupBy({ by: ['developerStudioId'], where: { ...live(now), developerStudioId: { in: ids } }, _count: { _all: true } }) : [],
    enabled.software ? db.softwareTitle.groupBy({ by: ['publisherStudioId'], where: { ...live(now), publisherStudioId: { in: ids } }, _count: { _all: true } }) : [],
  ])
  const counts = new Map<number, { games: number; software: number }>()
  for (let index = 0; index < groups.length; index++) for (const group of groups[index]) {
    const id = Number('developerStudioId' in group ? group.developerStudioId : group.publisherStudioId)
    const current = counts.get(id) || { games: 0, software: 0 }
    current[index < 2 ? 'games' : 'software'] += group._count._all
    counts.set(id, current)
  }
  return { items: rows.map((row) => ({ ...row, counts: counts.get(row.id) || { games: 0, software: 0 } })), total, page: currentPage, pages }
}

/** Bounded public product ids for a shared developer/publisher profile. */
export async function studioProfile(id: number, enabled: Enabled) {
  if (!Number.isSafeInteger(id) || id < 1 || (!enabled.games && !enabled.software)) return null
  const studio = await db.studio.findUnique({ where: { id }, select: { id: true, name: true, summary: true, logo: true, website: true } })
  if (!studio) return null
  const now = new Date()
  const [gameDeveloper, gamePublisher, softwareDeveloper, softwarePublisher] = await Promise.all([
    enabled.games ? db.gameTitle.findMany({ where: { ...live(now), developerStudioId: id }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }) : [],
    enabled.games ? db.gameTitle.findMany({ where: { ...live(now), publisherStudioId: id }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }) : [],
    enabled.software ? db.softwareTitle.findMany({ where: { ...live(now), developerStudioId: id }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }) : [],
    enabled.software ? db.softwareTitle.findMany({ where: { ...live(now), publisherStudioId: id }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }) : [],
  ])
  const ids = { gameDeveloper: gameDeveloper.map((row) => row.id), gamePublisher: gamePublisher.map((row) => row.id), softwareDeveloper: softwareDeveloper.map((row) => row.id), softwarePublisher: softwarePublisher.map((row) => row.id) }
  if (!Object.values(ids).some((list) => list.length)) return null
  const [gamesDeveloped, gamesPublished, softwareDeveloped, softwarePublished] = await Promise.all([
    enabled.games ? db.gameTitle.count({ where: { ...live(now), developerStudioId: id } }) : 0,
    enabled.games ? db.gameTitle.count({ where: { ...live(now), publisherStudioId: id } }) : 0,
    enabled.software ? db.softwareTitle.count({ where: { ...live(now), developerStudioId: id } }) : 0,
    enabled.software ? db.softwareTitle.count({ where: { ...live(now), publisherStudioId: id } }) : 0,
  ])
  return { studio, ids, counts: { gamesDeveloped, gamesPublished, softwareDeveloped, softwarePublished } }
}
