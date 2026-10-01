import { db } from '@/platform/database/prisma'
import { contentChanged } from '@/modules/content/server/events'
import { recount, removeOwner } from '@/modules/taxonomy/server/taxonomy'
import { validateCover } from '@/shared/content/cover'
import { cleanLinks, slugOf, splitList } from '@/modules/media/domain/media'
import { GameError, HEALTH_CHECKS, LIBRARY_STATUSES, healthIssues, normalizeUpdateKind, parseDay, releaseState, type HealthCheck } from '@/modules/games/domain/games'

// Games admin: dashboard, catalogue list with health checks and bulk actions,
// franchises, updates/DLC with their download links, release planning.

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
const DAY = 86_400_000
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const positive = (value: unknown) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

async function linkCounts(ids: number[]) {
  if (!ids.length) return new Map<number, { links: number; clicks: number; disabled: number }>()
  const rows = await db.mediaLink.groupBy({ by: ['ownerId', 'disabled'], where: { ownerType: 'game', ownerId: { in: ids } }, _count: { _all: true }, _sum: { clicks: true } })
  const map = new Map<number, { links: number; clicks: number; disabled: number }>()
  for (const row of rows) {
    const current = map.get(row.ownerId) || { links: 0, clicks: 0, disabled: 0 }
    if (row.disabled) current.disabled += row._count._all
    else current.links += row._count._all
    current.clicks += row._sum.clicks || 0
    map.set(row.ownerId, current)
  }
  return map
}

// ------------------------------------------------------------------ dashboard

export async function gamesDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [games, links, reports, libraryAll, libraryRecent, downloads, franchises, updates30] = await Promise.all([
    db.gameTitle.findMany({ select: { id: true, slug: true, title: true, cover: true, backdrop: true, summary: true, content: true, score: true, requirements: true, screenshots: true, trailerUrl: true, platforms: true, releaseDate: true, status: true, publishedAt: true, views: true, editorsChoice: true, featured: true } }),
    db.mediaLink.findMany({ where: { ownerType: 'game' }, select: { ownerId: true, clicks: true, disabled: true } }),
    db.linkReport.count({ where: { status: 'OPEN', link: { ownerType: { in: ['game', 'gameupdate'] } } } }).catch(() => 0),
    db.gameLibrary.groupBy({ by: ['status'], _count: { _all: true } }),
    db.gameLibrary.findMany({ where: { updatedAt: { gte: since } }, select: { updatedAt: true } }),
    db.downloadLog.findMany({ where: { ownerType: { in: ['game', 'gameupdate'] }, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.gameFranchise.count(),
    db.gameUpdate.count({ where: { createdAt: { gte: since } } }),
  ])
  const linkMap = new Map<number, number>()
  for (const link of links) if (!link.disabled) linkMap.set(link.ownerId, (linkMap.get(link.ownerId) || 0) + 1)
  const published = games.filter((game) => game.status === 'PUBLISHED')
  const live = published.filter((game) => game.publishedAt <= now)
  const health = Object.fromEntries(Object.keys(HEALTH_CHECKS).map((key) => [key, 0])) as Record<HealthCheck, number>
  const worst: { id: number; title: string; cover: string; issues: HealthCheck[] }[] = []
  for (const game of live) {
    const issues = healthIssues({ ...game, links: linkMap.get(game.id) || 0 }, now)
    for (const issue of issues) health[issue]++
    if (issues.length) worst.push({ id: game.id, title: game.title, cover: game.cover, issues })
  }
  worst.sort((a, b) => b.issues.length - a.issues.length)
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const bucket = (rows: Date[]) => {
    const counts = new Map(days.map((day) => [day, 0]))
    for (const at of rows) { const key = tehranDay(at); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }
    return days.map((day) => counts.get(day)!)
  }
  const library = Object.fromEntries(LIBRARY_STATUSES.map((status) => [status, 0])) as Record<string, number>
  for (const row of libraryAll) library[row.status] = row._count._all
  const upcoming = live.filter((game) => releaseState(game.releaseDate, now).state === 'upcoming').sort((a, b) => +a.releaseDate! - +b.releaseDate!)
  return {
    kpis: {
      published: live.length, drafts: games.filter((game) => game.status !== 'PUBLISHED').length, scheduled: published.filter((game) => game.publishedAt > now).length,
      upcoming30: upcoming.filter((game) => +game.releaseDate! - +now <= 30 * DAY).length, editors: live.filter((game) => game.editorsChoice).length,
      views: live.reduce((sum, game) => sum + game.views, 0), clicks: links.reduce((sum, link) => sum + link.clicks, 0), downloads30: downloads.length,
      openReports: reports, disabledLinks: links.filter((link) => link.disabled).length, franchises, updates30,
      library, libraryTotal: Object.values(library).reduce((a, b) => a + b, 0), libraryRecent: libraryRecent.length,
    },
    series: ((d, l) => days.map((day, i) => ({ day, downloads: d[i], library: l[i] })))(bucket(downloads.map((row) => row.createdAt)), bucket(libraryRecent.map((row) => row.updatedAt))),
    health: Object.entries(health).map(([key, count]) => ({ key, label: HEALTH_CHECKS[key as HealthCheck], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst: worst.slice(0, 8),
    topViewed: [...live].sort((a, b) => b.views - a.views).slice(0, 8).map((game) => ({ id: game.id, slug: game.slug, title: game.title, cover: game.cover, views: game.views, score: game.score })),
    upcoming: upcoming.slice(0, 8).map((game) => ({ id: game.id, slug: game.slug, title: game.title, cover: game.cover, releaseDate: game.releaseDate!.toISOString(), days: releaseState(game.releaseDate, now).days, platforms: splitList(game.platforms, 6) })),
  }
}

// ------------------------------------------------------------------ list + bulk

export async function adminGames(input: { q?: string; status?: string; platform?: string; franchise?: string; issue?: string; sort?: string; page?: string; size?: string }, now = new Date()) {
  const where: Record<string, unknown> = {}
  const q = text(input.q, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }, { developer: { contains: q } }]
  if (input.status === 'published') Object.assign(where, { status: 'PUBLISHED', publishedAt: { lte: now } })
  if (input.status === 'draft') where.status = 'DRAFT'
  if (input.status === 'scheduled') Object.assign(where, { status: 'PUBLISHED', publishedAt: { gt: now } })
  if (input.status === 'upcoming') where.releaseDate = { gt: now }
  if (input.status === 'featured') where.featured = true
  if (input.status === 'editors') where.editorsChoice = true
  if (input.status === 'vip') where.access = 'MEMBERS'
  if (input.platform) where.platforms = { contains: text(input.platform, 40) }
  if (input.franchise === 'none') where.franchiseId = null
  else if (positive(input.franchise)) where.franchiseId = positive(input.franchise)
  const orderBy = input.sort === 'views' ? [{ views: 'desc' as const }] : input.sort === 'score' ? [{ score: 'desc' as const }] : input.sort === 'release' ? [{ releaseDate: 'desc' as const }] : input.sort === 'title' ? [{ title: 'asc' as const }] : input.sort === 'updated' ? [{ updatedAt: 'desc' as const }] : [{ publishedAt: 'desc' as const }]
  const size = input.size === 'all' ? 'all' : [20, 50, 100, 500].includes(Number(input.size)) ? Number(input.size) : 20
  const requestedPage = Math.max(1, Math.min(100_000, Number(input.page) || 1))
  const matchedTotal = await db.gameTitle.count({ where })
  const initialPages = size === 'all' ? 1 : Math.max(1, Math.ceil(matchedTotal / size))
  const initialPage = size === 'all' ? 1 : Math.min(requestedPage, initialPages)
  const filterIssues = input.issue === 'any' || !!(input.issue && input.issue in HEALTH_CHECKS)
  const rows = await db.gameTitle.findMany({ where, orderBy: [...orderBy, { id: 'desc' as const }], ...(!filterIssues && size !== 'all' ? { skip: (initialPage - 1) * size, take: size } : {}), include: { franchise: { select: { title: true } } } })
  const [linkMap, libraryRows, updateRows, counts] = await Promise.all([
    linkCounts(rows.map((row) => row.id)),
    db.gameLibrary.groupBy({ by: ['gameId'], where: { gameId: { in: rows.map((row) => row.id) } }, _count: { _all: true } }),
    db.gameUpdate.groupBy({ by: ['gameId'], where: { gameId: { in: rows.map((row) => row.id) } }, _count: { _all: true } }),
    Promise.all([
      db.gameTitle.count(), db.gameTitle.count({ where: { status: 'PUBLISHED', publishedAt: { lte: now } } }), db.gameTitle.count({ where: { status: 'DRAFT' } }),
      db.gameTitle.count({ where: { status: 'PUBLISHED', publishedAt: { gt: now } } }), db.gameTitle.count({ where: { releaseDate: { gt: now } } }),
    ]),
  ])
  const library = new Map(libraryRows.map((row) => [row.gameId, row._count._all]))
  const updates = new Map(updateRows.map((row) => [row.gameId, row._count._all]))
  let list = rows.map((row) => {
    const links = linkMap.get(row.id) || { links: 0, clicks: 0, disabled: 0 }
    return {
      id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover, platforms: splitList(row.platforms, 8), status: row.status,
      scheduled: row.status === 'PUBLISHED' && row.publishedAt > now, publishedAt: row.publishedAt.toISOString(), releaseDate: row.releaseDate?.toISOString() || null,
      release: releaseState(row.releaseDate, now), score: row.score, views: row.views, access: row.access, featured: row.featured, editorsChoice: row.editorsChoice,
      franchise: row.franchise?.title || '', links: links.links, disabledLinks: links.disabled, clicks: links.clicks, library: library.get(row.id) || 0, updates: updates.get(row.id) || 0,
      issues: healthIssues({ ...row, links: links.links }, now),
    }
  })
  if (input.issue && input.issue in HEALTH_CHECKS) list = list.filter((row) => row.issues.includes(input.issue as HealthCheck))
  if (input.issue === 'any') list = list.filter((row) => row.issues.length > 0)
  const total = filterIssues ? list.length : matchedTotal
  const pages = size === 'all' ? 1 : Math.max(1, Math.ceil(total / size))
  const page = size === 'all' ? 1 : Math.min(requestedPage, pages)
  const facets = await db.gameTitle.findMany({ select: { platforms: true }, take: 5000 })
  const platforms = [...new Set(facets.flatMap((row) => splitList(row.platforms, 12)))].sort()
  const franchises = await db.gameFranchise.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } })
  return {
    total, page, pages, games: filterIssues && size !== 'all' ? list.slice((page - 1) * size, page * size) : list,
    counts: { all: counts[0], published: counts[1], draft: counts[2], scheduled: counts[3], upcoming: counts[4] },
    platforms, franchises, checks: HEALTH_CHECKS,
  }
}

const BULK = ['publish', 'draft', 'feature', 'unfeature', 'editors', 'uneditors', 'members', 'public', 'franchise', 'delete'] as const

export async function bulkGames(input: { ids?: unknown; action?: unknown; value?: unknown }) {
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(positive).filter(Boolean))].slice(0, 500)
  const action = String(input.action || '') as typeof BULK[number]
  if (!ids.length) throw new GameError('هیچ بازی‌ای انتخاب نشده است')
  if (!BULK.includes(action)) throw new GameError('عملیات نامعتبر است')
  const before = await db.gameTitle.findMany({ where: { id: { in: ids } } })
  if (action === 'delete') {
    await db.$transaction(async (tx) => {
      const updates = (await tx.gameUpdate.findMany({ where: { gameId: { in: ids } }, select: { id: true } })).map((row) => row.id)
      await tx.mediaLink.deleteMany({ where: { OR: [{ ownerType: 'game', ownerId: { in: ids } }, ...(updates.length ? [{ ownerType: 'gameupdate', ownerId: { in: updates } }] : [])] } })
      for (const id of ids) await removeOwner(tx, 'games', id)
      await tx.gameTitle.deleteMany({ where: { id: { in: ids } } })
    }, { timeout: 60_000 })
    await recount('games').catch(() => undefined)
    for (const row of before) contentChanged({ type: 'game', id: row.id }, row, null)
    return { changed: before.length }
  }
  let data: Record<string, unknown>
  switch (action) {
    case 'publish': data = { status: 'PUBLISHED' }; break
    case 'draft': data = { status: 'DRAFT' }; break
    case 'feature': data = { featured: true }; break
    case 'unfeature': data = { featured: false }; break
    case 'editors': data = { editorsChoice: true }; break
    case 'uneditors': data = { editorsChoice: false }; break
    case 'members': data = { access: 'MEMBERS' }; break
    case 'public': data = { access: 'PUBLIC' }; break
    default: {
      const franchiseId = positive(input.value)
      if (franchiseId && !await db.gameFranchise.findUnique({ where: { id: franchiseId }, select: { id: true } })) throw new GameError('مجموعه پیدا نشد', 404)
      data = { franchiseId: franchiseId || null }
    }
  }
  const result = await db.gameTitle.updateMany({ where: { id: { in: ids } }, data })
  const after = await db.gameTitle.findMany({ where: { id: { in: ids } } })
  const old = new Map(before.map((row) => [row.id, row]))
  for (const row of after) contentChanged({ type: 'game', id: row.id }, old.get(row.id) || null, row)
  return { changed: result.count }
}

// ------------------------------------------------------------------ franchises

export async function listFranchises() {
  const rows = await db.gameFranchise.findMany({ orderBy: { title: 'asc' }, include: { _count: { select: { games: true } }, games: { select: { cover: true }, where: { cover: { not: '' } }, take: 3 } } })
  return rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, description: row.description, image: row.image, games: row._count.games, covers: row.games.map((game) => game.cover) }))
}

export async function saveFranchise(input: Record<string, unknown>) {
  const id = positive(input.id)
  const title = text(input.title, 120)
  if (title.length < 2) throw new GameError('نام مجموعه را بنویسید')
  const data = {
    title, titleEn: text(input.titleEn, 120), description: text(input.description, 2000), image: validateCover(input.image),
    slug: (() => { try { return slugOf(input.slug || input.titleEn || '') } catch { throw new GameError('نامک (slug) را با حروف انگلیسی بنویسید') } })(),
  }
  try {
    const row = id ? await db.gameFranchise.update({ where: { id }, data }) : await db.gameFranchise.create({ data })
    return { id: row.id, created: !id }
  } catch (error) {
    if (/Unique constraint/i.test(String(error))) throw new GameError('این نامک قبلاً استفاده شده است', 409)
    if (/Record to update not found/i.test(String(error))) throw new GameError('مجموعه پیدا نشد', 404)
    throw error
  }
}

export async function deleteFranchise(id: number) {
  const row = await db.gameFranchise.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!row) throw new GameError('مجموعه پیدا نشد', 404)
  await db.gameFranchise.delete({ where: { id } }) // games keep existing (franchiseId → null)
  return row
}

// ------------------------------------------------------------------ updates / DLC

export async function gameUpdates(gameId: number) {
  const [game, rows] = await Promise.all([
    db.gameTitle.findUnique({ where: { id: gameId }, select: { id: true, title: true, slug: true } }),
    db.gameUpdate.findMany({ where: { gameId }, orderBy: { releasedAt: 'desc' } }),
  ])
  if (!game) throw new GameError('بازی پیدا نشد', 404)
  const links = await db.mediaLink.findMany({ where: { ownerType: 'gameupdate', ownerId: { in: rows.map((row) => row.id) } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  return {
    game,
    updates: rows.map((row) => ({ ...row, releasedAt: row.releasedAt.toISOString().slice(0, 10), links: links.filter((link) => link.ownerId === row.id).map(({ id, label, kind, quality, size, url, access, clicks, disabled, sortOrder }) => ({ id, label, kind, quality, size, url, access, clicks, disabled, sortOrder })) })),
  }
}

async function reconcileLinks(tx: Tx, ownerId: number, input: unknown) {
  const links = cleanLinks(input, 20)
  const existing = await tx.mediaLink.findMany({ where: { ownerType: 'gameupdate', ownerId } })
  const unused = [...existing]
  for (const link of links) {
    const index = unused.findIndex((row) => row.url === link.url)
    if (index >= 0) await tx.mediaLink.update({ where: { id: unused.splice(index, 1)[0].id }, data: link })
    else await tx.mediaLink.create({ data: { ...link, ownerType: 'gameupdate', ownerId } })
  }
  if (unused.length) await tx.mediaLink.deleteMany({ where: { id: { in: unused.map((row) => row.id) } } })
}

export async function saveGameUpdate(gameId: number, input: Record<string, unknown>) {
  const game = await db.gameTitle.findUnique({ where: { id: gameId }, select: { id: true } })
  if (!game) throw new GameError('بازی پیدا نشد', 404)
  const id = positive(input.id)
  const title = text(input.title, 160)
  if (title.length < 2) throw new GameError('عنوان آپدیت را بنویسید')
  try { cleanLinks(input.links, 20) } catch (error) { throw new GameError(error instanceof Error ? error.message : 'لینک نامعتبر است') }
  const data = { kind: normalizeUpdateKind(input.kind), title, version: text(input.version, 60), size: text(input.size, 40), notes: text(input.notes, 8000), releasedAt: input.releasedAt ? parseDay(input.releasedAt) : new Date() }
  const saved = await db.$transaction(async (tx) => {
    if (id) {
      const current = await tx.gameUpdate.findFirst({ where: { id, gameId }, select: { id: true } })
      if (!current) throw new GameError('آپدیت پیدا نشد', 404)
    }
    const row = id ? await tx.gameUpdate.update({ where: { id }, data }) : await tx.gameUpdate.create({ data: { ...data, gameId } })
    if (input.links !== undefined) await reconcileLinks(tx, row.id, input.links)
    return row
  })
  // The newest non-DLC version becomes the game's current version.
  if (data.version && data.kind !== 'DLC') {
    const newest = await db.gameUpdate.findFirst({ where: { gameId, kind: { not: 'DLC' }, version: { not: '' } }, orderBy: { releasedAt: 'desc' }, select: { version: true } })
    if (newest) await db.gameTitle.update({ where: { id: gameId }, data: { version: newest.version } })
  }
  return { id: saved.id, created: !id }
}

export async function deleteGameUpdate(gameId: number, id: number) {
  const row = await db.gameUpdate.findFirst({ where: { id, gameId } })
  if (!row) throw new GameError('آپدیت پیدا نشد', 404)
  await db.$transaction([db.mediaLink.deleteMany({ where: { ownerType: 'gameupdate', ownerId: id } }), db.gameUpdate.delete({ where: { id } })])
  return row
}

// ------------------------------------------------------------------ release planning

export async function releasePlan(now = new Date()) {
  const rows = await db.gameTitle.findMany({ where: { OR: [{ releaseDate: { gte: new Date(now.getTime() - 30 * DAY) } }, { releaseDate: null }] }, orderBy: [{ releaseDate: 'asc' }], take: 500, select: { id: true, slug: true, title: true, cover: true, platforms: true, releaseDate: true, releases: true, status: true, featured: true } })
  const map = (row: typeof rows[number]) => ({ id: row.id, slug: row.slug, title: row.title, cover: row.cover, platforms: splitList(row.platforms, 8), releaseDate: row.releaseDate?.toISOString().slice(0, 10) || '', status: row.status, featured: row.featured, perPlatform: row.releases !== '[]', release: releaseState(row.releaseDate, now) })
  return {
    upcoming: rows.filter((row) => row.releaseDate && row.releaseDate > now).map(map),
    recent: rows.filter((row) => row.releaseDate && row.releaseDate <= now).reverse().map(map),
    tba: rows.filter((row) => !row.releaseDate).map(map),
  }
}

/** Quick release-date change from the planning board. */
export async function setReleaseDate(id: number, value: unknown) {
  const row = await db.gameTitle.findUnique({ where: { id } })
  if (!row) throw new GameError('بازی پیدا نشد', 404)
  const releaseDate = value ? parseDay(value) : null
  const saved = await db.gameTitle.update({ where: { id }, data: { releaseDate } })
  contentChanged({ type: 'game', id }, row, saved)
  return { id, releaseDate: saved.releaseDate?.toISOString().slice(0, 10) || '' }
}
