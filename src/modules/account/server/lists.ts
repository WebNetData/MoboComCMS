import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { isModuleEnabled } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { FAVORITABLE, parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { GAME_SHELVES, listAccepts, listKey, parseListKey, type ListKey, type MemberList } from '@/modules/account/domain/lists'

// One reading and one writing of everything a member keeps a list of. Each list stays with its owner
// module and is changed through that owner's own function, so its rules (published items only, limits,
// notices, counters) apply exactly as they do on the owner's own screens. Nothing is copied.

const SHELF_TITLE: Record<string, string> = { PLAYING: 'در حال بازی', PLAYED: 'بازی‌کرده‌ها', WANT: 'می‌خواهم بازی کنم', DROPPED: 'رهاشده‌ها' }

export class ListError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

async function switches() {
  const [reviews, games, music] = await Promise.all([isModuleEnabled('reviews'), isModuleEnabled('games'), isModuleEnabled('music')])
  const shelves = games && (await (await import('@/modules/games/server/portal')).getGamesSettings()).libraryEnabled
  return { reviews, shelves, music }
}

/** The lists a member has, in a fixed order: favourites, game shelves, playlists, collections. Only those whose module is on. */
export async function memberLists(userId: number): Promise<MemberList[]> {
  const on = await switches()
  const [favorites, shelves, playlists, collections] = await Promise.all([
    on.reviews ? db.itemFavorite.count({ where: { userId } }) : null,
    on.shelves ? db.gameLibrary.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }) : null,
    on.music ? db.userMusicPlaylist.findMany({ where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, title: true, _count: { select: { tracks: true } } } }) : null,
    db.userCollection.findMany({ where: { staffAuthored: false, OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, title: true, _count: { select: { items: true } } } }),
  ])
  return [
    ...(favorites === null ? [] : [{ key: 'favorites', kind: 'favorites' as const, title: 'علاقه‌مندی‌ها', count: favorites, href: '/favorites', accepts: 'any' as const }]),
    ...(shelves === null ? [] : GAME_SHELVES.map((shelf) => ({ key: `games:${shelf}`, kind: 'games' as const, title: SHELF_TITLE[shelf], count: shelves.find((row) => row.status === shelf)?._count._all || 0, href: `/dashboard/games?status=${shelf}`, accepts: 'game' as const }))),
    ...(playlists || []).map((row) => ({ key: `playlist:${row.id}`, kind: 'playlist' as const, title: row.title, count: row._count.tracks, href: `/music/my-playlists/${row.id}`, accepts: 'track' as const })),
    ...collections.map((row) => ({ key: `collection:${row.id}`, kind: 'collection' as const, title: row.title, count: row._count.items, href: `/collections/${row.id}`, accepts: 'any' as const })),
  ]
}

/** The keys of the member's lists that hold this item. */
export async function listsHolding(userId: number, ref: ItemRef): Promise<string[]> {
  const on = await switches()
  const [favorite, shelf, playlists, collections] = await Promise.all([
    on.reviews ? db.itemFavorite.findUnique({ where: { userId_itemType_itemId: { userId, itemType: ref.type, itemId: ref.id } }, select: { userId: true } }) : null,
    on.shelves && ref.type === 'game' ? db.gameLibrary.findUnique({ where: { userId_gameId: { userId, gameId: ref.id } }, select: { status: true } }) : null,
    on.music && ref.type === 'track' ? db.userMusicPlaylistTrack.findMany({ where: { trackId: ref.id, playlist: { userId } }, orderBy: { playlistId: 'asc' }, select: { playlistId: true } }) : [],
    db.userCollectionItem.findMany({ where: { itemType: ref.type, itemId: ref.id, collection: { staffAuthored: false, OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] } }, orderBy: { collectionId: 'asc' }, select: { collectionId: true } }),
  ])
  return [
    ...(favorite ? ['favorites'] : []),
    ...(shelf ? [`games:${shelf.status}`] : []),
    ...playlists.map((row) => `playlist:${row.playlistId}`),
    ...collections.map((row) => `collection:${row.collectionId}`),
  ]
}

/** Puts an item in a list of the member's, or takes it out, through the list's owner. A game is on one shelf at a time. */
export async function setInList(userId: number, ref: ItemRef, key: ListKey, on: boolean): Promise<{ list: string; on: boolean }> {
  if (!listAccepts(key, ref.type)) throw new ListError('این مورد در این فهرست جا نمی‌گیرد')
  const state = await switches()
  try {
    if (key.kind === 'favorites') {
      if (!state.reviews) throw new ListError('این فهرست در دسترس نیست', 404)
      await (await import('@/modules/reviews/server/reviews')).setFavorite(userId, ref, { on })
    } else if (key.kind === 'games') {
      if (!state.shelves) throw new ListError('این فهرست در دسترس نیست', 404)
      const games = await import('@/modules/games/server/library')
      // Taking a game off a shelf it is not on changes nothing: it stays on the shelf it is on.
      if (!on && (await games.libraryEntry(userId, ref.id))?.status !== key.shelf) return { list: listKey(key), on: false }
      await games.setLibrary(userId, { gameId: ref.id, status: on ? key.shelf : null })
    } else if (key.kind === 'playlist') {
      if (!state.music) throw new ListError('این فهرست در دسترس نیست', 404)
      const playlists = await import('@/modules/music/server/personal-playlists')
      if (on) await playlists.addPersonalTrack(userId, key.id, ref.id); else await playlists.removePersonalTrack(userId, key.id, ref.id)
    } else {
      const collections = await import('@/modules/content/server/collections')
      if (on) await collections.addCollectionItem(userId, key.id, `${ref.type}:${ref.id}`); else await collections.removeCollectionItem(userId, key.id, `${ref.type}:${ref.id}`)
    }
  } catch (error) {
    if (error instanceof ListError) throw error
    // The owner's own refusal (not found, not published, full, too fast) in the owner's own words.
    const status = Number((error as { status?: unknown }).status)
    if (error instanceof Error && Number.isInteger(status) && status >= 400 && status < 500) throw new ListError(error.message, status)
    throw error
  }
  return { list: listKey(key), on }
}

/** GET /api/me/lists[?item=type:id] — the member's lists, and with `item` the keys of those that hold it. */
export async function GET_lists(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const raw = req.nextUrl.searchParams.get('item')
  const ref = raw === null ? null : parseItemKey(raw)
  if (raw !== null && !ref) return err('invalid item', 400)
  const [lists, holding] = await Promise.all([memberLists(user.id), ref ? listsHolding(user.id, ref) : null])
  const response = ok({ version: 1, lists: ref ? lists.filter((list) => (list.accepts === 'any' || list.accepts === ref.type) && (list.kind !== 'favorites' || FAVORITABLE.includes(ref.type))) : lists, ...(holding ? { item: `${ref!.type}:${ref!.id}`, holding } : {}) })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** PUT /api/me/lists { item: 'type:id', list: '<key>', on: boolean } */
export async function PUT_lists(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const origin = req.headers.get('origin')
  if (!origin || !originIsThisSite(origin, req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 8192) } catch (error) { return error instanceof JsonBodyError ? err(error.message, error.status) : err('invalid request', 400) }
  const ref = parseItemKey(body.item), key = parseListKey(body.list)
  if (!ref || !key || typeof body.on !== 'boolean') return err('invalid request', 400)
  try {
    const result = await setInList(user.id, ref, key, body.on)
    return ok({ version: 1, ...result, holding: await listsHolding(user.id, ref) })
  } catch (error) {
    if (error instanceof ListError) return err(error.message, error.status)
    console.error('[account.lists]', error)
    return err('internal error', 500)
  }
}
