import { db } from '@/platform/database/prisma'
import { GameError, LIBRARY_STATUSES, cleanHours, normalizeLibraryStatus, type LibraryStatus } from '@/modules/games/domain/games'
import { toGame } from '@/modules/media/server/queries'

// Members' game libraries (played / playing / want to play / dropped).

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })
export type LibraryCounts = Record<LibraryStatus, number>

const emptyCounts = (): LibraryCounts => Object.fromEntries(LIBRARY_STATUSES.map((status) => [status, 0])) as LibraryCounts

export async function libraryCounts(gameId: number): Promise<LibraryCounts> {
  const rows = await db.gameLibrary.groupBy({ by: ['status'], where: { gameId }, _count: { _all: true } }).catch(() => [])
  const counts = emptyCounts()
  for (const row of rows) if (row.status in counts) counts[row.status as LibraryStatus] = row._count._all
  return counts
}

export async function libraryEntry(userId: number | null, gameId: number) {
  if (!userId) return null
  const row = await db.gameLibrary.findUnique({ where: { userId_gameId: { userId, gameId } }, select: { status: true, hours: true, updatedAt: true } }).catch(() => null)
  return row ? { status: row.status as LibraryStatus, hours: row.hours, updatedAt: row.updatedAt.toISOString() } : null
}

/** Puts a published game on a shelf; status null removes it. Returns the new state and counts. */
export async function setLibrary(userId: number, input: { gameId: unknown; status: unknown; hours?: unknown }) {
  const gameId = Number(input.gameId)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) throw new GameError('بازی نامعتبر است')
  const game = await db.gameTitle.findFirst({ where: { id: gameId, ...live() }, select: { id: true } })
  if (!game) throw new GameError('بازی پیدا نشد', 404, 'NOT_FOUND')
  if (input.status === null || input.status === '' || input.status === 'NONE') {
    await db.gameLibrary.deleteMany({ where: { userId, gameId } })
  } else {
    const status = normalizeLibraryStatus(input.status)
    if (!status) throw new GameError('وضعیت نامعتبر است')
    const hours = input.hours === undefined ? undefined : cleanHours(input.hours)
    await db.gameLibrary.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId, status, hours: hours ?? 0 },
      update: { status, ...(hours === undefined ? {} : { hours }) },
    })
  }
  const [mine, counts] = await Promise.all([libraryEntry(userId, gameId), libraryCounts(gameId)])
  return { mine, counts }
}

/** A member's shelf, newest change first. */
export async function myLibrary(userId: number, status: string | null, page = 1) {
  const shelf = normalizeLibraryStatus(status)
  const size = 24
  const where = { userId, ...(shelf ? { status: shelf } : {}), game: live() }
  const [rows, total, grouped] = await Promise.all([
    db.gameLibrary.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (Math.max(1, page) - 1) * size, take: size, include: { game: true } }),
    db.gameLibrary.count({ where }),
    db.gameLibrary.groupBy({ by: ['status'], where: { userId, game: live() }, _count: { _all: true } }),
  ])
  const counts = emptyCounts()
  for (const row of grouped) if (row.status in counts) counts[row.status as LibraryStatus] = row._count._all
  const hours = await db.gameLibrary.aggregate({ where: { userId }, _sum: { hours: true } })
  return {
    status: shelf, counts, total, page, pages: Math.max(1, Math.ceil(total / size)), hours: hours._sum.hours || 0,
    items: rows.map((row) => ({ status: row.status as LibraryStatus, hours: row.hours, updatedAt: row.updatedAt.toISOString(), game: toGame(row.game) })),
  }
}

/** Games members most want to play (not released yet first). */
export async function mostWanted(take = 10) {
  const rows = await db.gameLibrary.groupBy({ by: ['gameId'], where: { status: 'WANT', game: live() }, _count: { _all: true }, orderBy: { _count: { gameId: 'desc' } }, take }).catch(() => [])
  if (!rows.length) return []
  const games = await db.gameTitle.findMany({ where: { id: { in: rows.map((row) => row.gameId) } } })
  const byId = new Map(games.map((game) => [game.id, game]))
  return rows.flatMap((row) => (byId.has(row.gameId) ? [{ wants: row._count._all, game: toGame(byId.get(row.gameId)) }] : []))
}
