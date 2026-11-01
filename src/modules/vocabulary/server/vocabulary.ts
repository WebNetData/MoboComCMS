import { promptUsage } from '@/modules/prompts/server/vocabulary'
import type { Prisma } from '@prisma/client'
import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { labelsOf, parseVocabularyInput, seedEntries, VocabularyError, type VocabularyEntry } from '@/modules/vocabulary/domain/vocabulary'
import { definitionOf, listsOf, type VocabularySection } from '@/modules/vocabulary/domain/registry'
import { gameUsage } from '@/modules/games/server/vocabulary'
import { softwareUsage } from '@/modules/software/server/vocabulary'
import { linkUsage } from '@/modules/media/server/vocabulary'
import { musicUsage } from '@/modules/music/server/vocabulary'
import { journalUsage } from '@/modules/journal/server/vocabulary'
import { cinemaUsage } from '@/modules/cinema/server/vocabulary'
import { businessUsage } from '@/modules/businesses/server/vocabulary'
import { membershipUsage } from '@/modules/membership/server/perks'
import { parseFacts } from '@/modules/celebrities/domain/fields'

type Tx = Prisma.TransactionClient
type Audit = (tx: Tx, id: number, action: 'created' | 'updated' | 'deleted', metadata: Record<string, unknown>) => Promise<unknown>
export type SectionLists = Record<string, VocabularyEntry[]>
const ORDER: Prisma.VocabularyOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { id: 'asc' }]
const SELECT = { id: true, section: true, list: true, code: true, name: true, nameEn: true, icon: true, family: true, sortOrder: true, active: true } as const

/** How many items use an entry, asked per entry after one read: each section counts its own items. */
const USAGE: Record<VocabularySection, (client: Pick<Tx, 'promptTemplate' | 'gameTitle' | 'softwareTitle' | 'mediaLink' | 'musicTrack' | 'musicAlbum' | 'musicCredit' | 'post' | 'cinemaTitle' | 'businessProfile' | 'businessRequest' | 'membershipPlan' | 'celebrity'>) => Promise<(list: string, code: string) => number>> = {
  // An artist profile field is in use while some artist has a value in it (switch it off instead of deleting it).
  prompts: promptUsage,
  celebrities: async (client) => {
    const counts = new Map<string, number>()
    for (const row of await client.celebrity.findMany({ where: { NOT: { facts: '{}' } }, select: { facts: true } })) for (const code of Object.keys(parseFacts(row.facts))) counts.set(code, (counts.get(code) || 0) + 1)
    return (list: string, code: string) => (list === 'PROFILE_FIELD' ? counts.get(code) || 0 : 0)
  }, games: gameUsage, software: softwareUsage, media: linkUsage, music: musicUsage, journal: journalUsage, cinema: cinemaUsage, businesses: businessUsage, membership: membershipUsage }

function bySection(section: VocabularySection, rows: VocabularyEntry[]): SectionLists {
  const lists: SectionLists = Object.fromEntries(listsOf(section).map((definition) => [definition.list, [] as VocabularyEntry[]]))
  for (const row of rows) lists[row.list]?.push(row)
  return lists
}
const seeded = (section: VocabularySection): SectionLists => Object.fromEntries(listsOf(section).map((definition) => [definition.list, seedEntries(definition)]))

/** Every list of a section with each entry's number of items, for the admin page. */
export async function adminLists(section: VocabularySection) {
  const [rows, uses] = await Promise.all([db.vocabulary.findMany({ where: { section }, orderBy: ORDER, select: SELECT }), USAGE[section](db)])
  return Object.fromEntries(Object.entries(bySection(section, rows)).map(([list, entries]) => [list, entries.map((entry) => ({ ...entry, uses: uses(list, entry.code) }))]))
}

/** Active entries of a section's lists in the owner's order (the old fixed values if the table is unreachable). */
export const activeLists = cache(async (section: VocabularySection): Promise<SectionLists> => {
  try { return bySection(section, await db.vocabulary.findMany({ where: { section, active: true }, orderBy: ORDER, select: SELECT })) } catch { return seeded(section) }
})

/** Every entry of a section's lists, active or not, in the owner's order: for showing what items already have. */
export const allLists = cache(async (section: VocabularySection): Promise<SectionLists> => {
  try { return bySection(section, await db.vocabulary.findMany({ where: { section }, orderBy: ORDER, select: SELECT })) } catch { return seeded(section) }
})

/** code → name of every entry, active or not, so an item keeps showing what it has. */
export const listLabels = cache(async (section: VocabularySection): Promise<Record<string, Record<string, string>>> => {
  const rows = await db.vocabulary.findMany({ where: { section }, select: { list: true, code: true, name: true } }).catch(() => null)
  const lists = rows ? bySection(section, rows as VocabularyEntry[]) : seeded(section)
  return Object.fromEntries(Object.entries(lists).map(([list, entries]) => [list, labelsOf(entries)]))
})

export async function createEntry(section: VocabularySection, input: Record<string, unknown>, audit: Audit) {
  const data = parseVocabularyInput(definitionOf(section, input.list), input, true) as Prisma.VocabularyCreateInput
  return db.$transaction(async (tx) => {
    if (await tx.vocabulary.findUnique({ where: { section_list_code: { section: data.section, list: data.list, code: data.code } }, select: { id: true } })) throw new VocabularyError('این مورد در همین فهرست هست', 409)
    const row = await tx.vocabulary.create({ data, select: SELECT })
    await audit(tx, row.id, 'created', { section, list: row.list, code: row.code })
    return row
  })
}

/** A change to an entry of this section only: another section's entry is not found here. */
export async function updateEntry(section: VocabularySection, id: number, input: Record<string, unknown>, audit: Audit) {
  return db.$transaction(async (tx) => {
    const current = await tx.vocabulary.findFirst({ where: { id, section }, select: { list: true } })
    if (!current) throw new VocabularyError('این مورد پیدا نشد', 404)
    // The entry's own list decides which families it may take.
    const data = parseVocabularyInput(definitionOf(section, current.list), input, false)
    const row = await tx.vocabulary.update({ where: { id }, data, select: SELECT })
    await audit(tx, id, 'updated', { section, fields: Object.keys(data) })
    return row
  })
}

/** An entry an item uses is not deleted (deactivate it instead), so no item is left with a value nobody manages. */
export async function deleteEntry(section: VocabularySection, id: number, audit: Audit) {
  return db.$transaction(async (tx) => {
    const row = await tx.vocabulary.findFirst({ where: { id, section }, select: SELECT })
    if (!row) throw new VocabularyError('این مورد پیدا نشد', 404)
    const uses = (await USAGE[section](tx))(row.list, row.code)
    if (uses) throw new VocabularyError(`${uses.toLocaleString('fa-IR')} مورد «${row.name}» را دارند؛ به‌جای حذف، غیرفعالش کنید`, 409)
    await tx.vocabulary.delete({ where: { id } })
    await audit(tx, id, 'deleted', { section, list: row.list, code: row.code })
    return { id }
  }, { isolationLevel: 'Serializable' })
}

/**
 * The audio of each link as a code of the shared AUDIO list (active or not, so a link keeps a dub the owner later
 * deactivated); an unknown code becomes "no audio side". Every writer of links passes its cleaned links through this.
 */
export async function knownLinkAudio<T extends { audio: string }>(tx: Pick<Tx, 'vocabulary'>, links: T[]): Promise<T[]> {
  if (!links.some((link) => link.audio)) return links
  const codes = new Set((await tx.vocabulary.findMany({ where: { section: 'media', list: 'AUDIO' }, select: { code: true } })).map((row) => row.code))
  return links.map((link) => (link.audio && !codes.has(link.audio) ? { ...link, audio: '' } : link))
}

/**
 * Names an item is saved with, for name lists that also take what imports bring in English: a wanted name matches an
 * entry by its code or its English name (case-insensitive), and is saved as the code ("Drama" → "درام"). Otherwise as
 * knownCodes: inactive entries only where the item already had them, unknown names dropped, in the list's order.
 */
export async function knownNames(tx: Pick<Tx, 'vocabulary'>, section: VocabularySection, list: string, wanted: string[], had: string[]) {
  const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  const want = new Set(wanted.map(key)), kept = new Set(had)
  const rows = await tx.vocabulary.findMany({ where: { section, list }, orderBy: ORDER, select: { code: true, nameEn: true, active: true } })
  return [...new Set(rows.filter((row) => (want.has(key(row.code)) || (row.nameEn && want.has(key(row.nameEn)))) && (row.active || kept.has(row.code))).map((row) => row.code))]
}

/**
 * The codes an item is saved with: those its list knows, keeping ones the item already had even when they are now
 * inactive; anything else is dropped. In the list's order, as the site shows them.
 */
export async function knownCodes(tx: Pick<Tx, 'vocabulary'>, section: VocabularySection, list: string, wanted: string[], had: string[]) {
  const want = new Set(wanted), kept = new Set(had)
  const rows = await tx.vocabulary.findMany({ where: { section, list }, orderBy: ORDER, select: { code: true, active: true } })
  return rows.filter((row) => want.has(row.code) && (row.active || kept.has(row.code))).map((row) => row.code)
}
