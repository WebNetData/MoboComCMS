import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { GameError } from '@/modules/games/domain/games'
import { libraryCounts, libraryEntry, myLibrary, setLibrary } from '@/modules/games/server/library'
import { getGamesSettings, saveGamesSettings } from '@/modules/games/server/portal'
import { adminGames, bulkGames, deleteFranchise, deleteGameUpdate, gameUpdates, gamesDashboard, listFranchises, releasePlan, saveFranchise, saveGameUpdate, setReleaseDate } from '@/modules/games/server/admin'

function failure(error: unknown) {
  if (error instanceof GameError) return err(error.message, error.status, { code: error.code })
  console.error('[games]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

const positive = (value: unknown) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}
const body = async (req: NextRequest) => ((await req.json().catch(() => null)) || {}) as Record<string, unknown>

// ------------------------------------------------------------------ library (members)

/** GET /api/games/library?gameId= → { mine, counts } · GET /api/games/library?status=&page= → the member's shelf */
export async function GET_library(req: NextRequest) {
  const off = await moduleGuard('games')
  if (off) return off
  const params = req.nextUrl.searchParams
  const user = await requireUser(req)
  const gameId = positive(params.get('gameId'))
  if (gameId) return ok({ mine: await libraryEntry(user?.id ?? null, gameId), counts: await libraryCounts(gameId) })
  if (!user) return err('LOGIN_REQUIRED', 401)
  return ok(await myLibrary(user.id, params.get('status'), Number(params.get('page')) || 1))
}

/** POST /api/games/library { gameId, status | null, hours? } */
export async function POST_library(req: NextRequest) {
  const off = await moduleGuard('games')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('برای ساختن کتابخانهٔ بازی وارد شوید', 401, { code: 'LOGIN_REQUIRED' })
  if (!(await getGamesSettings()).libraryEnabled) return err('کتابخانهٔ بازی غیرفعال است', 403)
  const input = await body(req)
  try { return ok(await setLibrary(user.id, { gameId: input.gameId, status: input.status ?? null, hours: input.hours })) } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ admin

const gamesAdmin = (req: NextRequest) => adminGuard(req, 'games', ['games.manage', 'cms.posts'])

/** GET /api/admin/games/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  return ok(await gamesDashboard())
}

/** GET /api/admin/games/list?q=&status=&platform=&franchise=&issue=&sort=&page= */
export async function GET_list(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const params = Object.fromEntries(['q', 'status', 'platform', 'franchise', 'issue', 'sort', 'page', 'size'].map((key) => [key, req.nextUrl.searchParams.get(key) || '']))
  return ok(await adminGames(params))
}

/** POST /api/admin/games/list { ids, action, value } — bulk actions. */
export async function POST_list(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const input = await body(req)
  try {
    const result = await bulkGames(input)
    await auditAdmin({ req, actor: g.admin, action: 'games.bulk', targetType: 'game', targetId: 0, metadata: { action: String(input.action), count: Array.isArray(input.ids) ? input.ids.length : 0, value: String(input.value ?? '') } })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/games/franchises */
export async function GET_franchises(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  return ok({ franchises: await listFranchises() })
}

/** POST /api/admin/games/franchises { id?, title, titleEn, slug, description, image } */
export async function POST_franchises(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const input = await body(req)
  try {
    const result = await saveFranchise(input)
    await auditAdmin({ req, actor: g.admin, action: result.created ? 'games.franchise.create' : 'games.franchise.update', targetType: 'game_franchise', targetId: result.id, metadata: { title: String(input.title || '').slice(0, 120) } })
    return ok(result, result.created ? 201 : 200)
  } catch (error) { return failure(error) }
}

/** DELETE /api/admin/games/franchises?id= */
export async function DELETE_franchises(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const id = positive(req.nextUrl.searchParams.get('id'))
  if (!id) return err('شناسه نامعتبر است')
  try {
    const row = await deleteFranchise(id)
    await auditAdmin({ req, actor: g.admin, action: 'games.franchise.delete', targetType: 'game_franchise', targetId: id, metadata: { title: row.title } })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

/** GET /api/admin/games/updates?gameId= */
export async function GET_updates(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const gameId = positive(req.nextUrl.searchParams.get('gameId'))
  if (!gameId) return err('بازی نامعتبر است')
  try { return ok(await gameUpdates(gameId)) } catch (error) { return failure(error) }
}

/** POST /api/admin/games/updates { gameId, id?, kind, title, version, size, notes, releasedAt, links } */
export async function POST_updates(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const input = await body(req)
  const gameId = positive(input.gameId)
  if (!gameId) return err('بازی نامعتبر است')
  try {
    const result = await saveGameUpdate(gameId, input)
    await auditAdmin({ req, actor: g.admin, action: result.created ? 'games.update.create' : 'games.update.update', targetType: 'game_update', targetId: result.id, metadata: { gameId, title: String(input.title || '').slice(0, 160) } })
    return ok(result, result.created ? 201 : 200)
  } catch (error) { return failure(error) }
}

/** DELETE /api/admin/games/updates?gameId=&id= */
export async function DELETE_updates(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const gameId = positive(req.nextUrl.searchParams.get('gameId'))
  const id = positive(req.nextUrl.searchParams.get('id'))
  if (!gameId || !id) return err('شناسه نامعتبر است')
  try {
    const row = await deleteGameUpdate(gameId, id)
    await auditAdmin({ req, actor: g.admin, action: 'games.update.delete', targetType: 'game_update', targetId: id, metadata: { gameId, title: row.title } })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

/** GET /api/admin/games/releases */
export async function GET_releases(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  return ok(await releasePlan())
}

/** POST /api/admin/games/releases { id, releaseDate } */
export async function POST_releases(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  const input = await body(req)
  const id = positive(input.id)
  if (!id) return err('بازی نامعتبر است')
  try {
    const result = await setReleaseDate(id, input.releaseDate)
    await auditAdmin({ req, actor: g.admin, action: 'games.release.update', targetType: 'game', targetId: id, metadata: { releaseDate: result.releaseDate } })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/games/settings */
export async function GET_settings(req: NextRequest) {
  const g = await gamesAdmin(req)
  if ('response' in g) return g.response
  return ok({ settings: await getGamesSettings() })
}

/** POST /api/admin/games/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'games', ['games.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const settings = await saveGamesSettings(await body(req))
  await auditAdmin({ req, actor: g.admin, action: 'games.settings.update', targetType: 'setting', targetId: 0, metadata: { hero: settings.heroIds.length, rails: settings.rails.filter((rail) => rail.enabled).length } })
  return ok({ settings })
}
