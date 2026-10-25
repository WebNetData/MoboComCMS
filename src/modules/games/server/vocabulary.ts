import type { Prisma } from '@prisma/client'
import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { codesOf } from '@/modules/games/domain/games'
import { defaultVocabulary, isVocabularyList, parseVocabularyInput, VOCABULARY_LISTS, VocabularyError, type Vocabulary, type VocabularyEntry, type VocabularyList } from '@/modules/games/domain/vocabulary'

type Tx = Prisma.TransactionClient
type Audit = (tx: Tx, id: number, action: 'created' | 'updated' | 'deleted', metadata: Record<string, unknown>) => Promise<unknown>
const ORDER: Prisma.GameVocabularyOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { id: 'asc' }]
const shape = (row: Omit<VocabularyEntry, 'list'> & { list: string }): VocabularyEntry => ({ id: row.id, list: row.list as VocabularyList, code: row.code, name: row.name, nameEn: row.nameEn, icon: row.icon, sortOrder: row.sortOrder, active: row.active })
const SELECT = { id: true, list: true, code: true, name: true, nameEn: true, icon: true, sortOrder: true, active: true } as const

function grouped(rows: VocabularyEntry[]): Vocabulary {
  const lists = Object.fromEntries(VOCABULARY_LISTS.map((list) => [list, [] as VocabularyEntry[]])) as Vocabulary
  for (const row of rows) lists[row.list]?.push(row)
  return lists
}

/** How many games use an entry: platforms and codes are comma lists on the game, stores are in its store links. */
export function usesOf(games: { platforms: string; modes: string; localization: string; storeLinks: string; releases: string }[], list: VocabularyList, code: string) {
  return games.filter((game) => {
    if (list === 'PLATFORM') return codesOf(game.platforms).includes(code) || readList(game.releases).some((row) => row.platform === code)
    if (list === 'STORE') return readList(game.storeLinks).some((row) => row.store === code)
    return codesOf(list === 'MODE' ? game.modes : game.localization).includes(code)
  }).length
}
const readList = (raw: string): Record<string, unknown>[] => { try { const value = JSON.parse(raw || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }
const gameUses = (client: Pick<Tx, 'gameTitle'>) => client.gameTitle.findMany({ select: { platforms: true, modes: true, localization: true, storeLinks: true, releases: true } })

/** Every list with each entry's number of games, for the admin page. */
export async function adminVocabulary() {
  const [rows, games] = await Promise.all([db.gameVocabulary.findMany({ orderBy: ORDER, select: SELECT }), gameUses(db)])
  const lists = grouped(rows.map(shape))
  return Object.fromEntries(VOCABULARY_LISTS.map((list) => [list, lists[list].map((entry) => ({ ...entry, games: usesOf(games, list, entry.code) }))])) as Record<VocabularyList, (VocabularyEntry & { games: number })[]>
}

/** Active entries of every list in the owner's order (the code's old fixed values if the table is unreachable). */
export const activeVocabulary = cache(async (): Promise<Vocabulary> => {
  try {
    return grouped((await db.gameVocabulary.findMany({ where: { active: true }, orderBy: ORDER, select: SELECT })).map(shape))
  } catch {
    return defaultVocabulary()
  }
})

/** Names of every entry, active or not, so a game keeps showing what it has. */
export const vocabularyLabels = cache(async (): Promise<Record<VocabularyList, Record<string, string>>> => {
  const fallback = defaultVocabulary()
  const rows = await db.gameVocabulary.findMany({ select: { list: true, code: true, name: true } }).catch(() => VOCABULARY_LISTS.flatMap((list) => fallback[list]))
  const labels = Object.fromEntries(VOCABULARY_LISTS.map((list) => [list, {} as Record<string, string>])) as Record<VocabularyList, Record<string, string>>
  for (const row of rows) if (isVocabularyList(row.list)) labels[row.list][row.code] = row.name
  return labels
})

export async function createVocabulary(input: Record<string, unknown>, audit: Audit) {
  const data = parseVocabularyInput(input, true) as Prisma.GameVocabularyCreateInput
  return db.$transaction(async (tx) => {
    if (await tx.gameVocabulary.findUnique({ where: { list_code: { list: data.list, code: data.code } }, select: { id: true } })) throw new VocabularyError('این مورد در همین فهرست هست', 409)
    const row = await tx.gameVocabulary.create({ data })
    await audit(tx, row.id, 'created', { list: row.list, code: row.code })
    return shape(row)
  })
}

export async function updateVocabulary(id: number, input: Record<string, unknown>, audit: Audit) {
  const data = parseVocabularyInput(input, false)
  return db.$transaction(async (tx) => {
    if (!await tx.gameVocabulary.findUnique({ where: { id }, select: { id: true } })) throw new VocabularyError('این مورد پیدا نشد', 404)
    const row = await tx.gameVocabulary.update({ where: { id }, data })
    await audit(tx, id, 'updated', { fields: Object.keys(data) })
    return shape(row)
  })
}

/** An entry a game uses is not deleted (deactivate it instead), so no game is left with a value nobody can manage. */
export async function deleteVocabulary(id: number, audit: Audit) {
  return db.$transaction(async (tx) => {
    const row = await tx.gameVocabulary.findUnique({ where: { id }, select: SELECT })
    if (!row) throw new VocabularyError('این مورد پیدا نشد', 404)
    const uses = usesOf(await gameUses(tx), row.list as VocabularyList, row.code)
    if (uses) throw new VocabularyError(`${uses.toLocaleString('fa-IR')} بازی «${row.name}» را دارند؛ به‌جای حذف، غیرفعالش کنید`, 409)
    await tx.gameVocabulary.delete({ where: { id } })
    await audit(tx, id, 'deleted', { list: row.list, code: row.code })
    return { id }
  }, { isolationLevel: 'Serializable' })
}

/**
 * The mode and localisation codes a game is saved with: codes the owner's list knows, keeping those the game
 * already had even when they are now inactive; anything else is dropped. List order, as the site shows them.
 */
export async function knownGameCodes(tx: Pick<Tx, 'gameVocabulary'>, list: 'MODE' | 'LOCALIZATION', value: string, before: string | null | undefined) {
  const wanted = new Set(codesOf(value))
  const had = new Set(codesOf(before))
  const rows = await tx.gameVocabulary.findMany({ where: { list }, orderBy: ORDER, select: { code: true, active: true } })
  return rows.filter((row) => wanted.has(row.code) && (row.active || had.has(row.code))).map((row) => row.code).join(', ')
}
