import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { TERM_FACETS, termProjectionChange } from '@/modules/taxonomy/domain/projection'
import {
  LEGACY_SOURCES, MAX_TERMS, TaxonomyError, assertParent, buildTree, descendants, flatten, normalizeAssignment, slugify, termBySlugs, termPath, validateTerm,
  type Taxonomy,
} from '@/modules/taxonomy/domain/taxonomy'

type Tx = Prisma.TransactionClient
type Client = Tx | typeof db

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' })
const split = (value: string) => value.split(/[,،|/]/).map((part) => part.trim()).filter(Boolean)

/** Published owner ids of a taxonomy (what public counts and listings see). */
async function liveOwnerIds(client: Client, taxonomy: Taxonomy, ids?: number[]): Promise<number[]> {
  const where = { ...live(), ...(ids ? { id: { in: ids } } : {}) }
  const select = { id: true } as const
  const rows = taxonomy === 'software' ? await client.softwareTitle.findMany({ where, select })
    : taxonomy === 'games' ? await client.gameTitle.findMany({ where, select })
      : taxonomy === 'music' ? await client.musicAlbum.findMany({ where, select })
        // The language of music is filed on songs, not albums.
        : taxonomy === 'music-language' ? await client.musicTrack.findMany({ where: { ...where, album: { isNot: { audienceGroups: { not: '' } } } }, select })
          : await client.cinemaTitle.findMany({ where, select })
  return rows.map((row) => row.id)
}

export type Term = Awaited<ReturnType<typeof listTerms>>[number]

export const listTerms = (taxonomy: Taxonomy, client: Client = db) =>
  client.taxonomyTerm.findMany({ where: { taxonomy }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })

/** Tree with public paths (admin screens, menus, sidebars). */
export async function termTree(taxonomy: Taxonomy) {
  const terms = await listTerms(taxonomy)
  return buildTree(terms.map((term) => ({ ...term, path: termPath(taxonomy, terms, term.id) })))
}

async function uniqueSlug(tx: Tx, taxonomy: Taxonomy, slug: string, exceptId: number | null) {
  let candidate = slug
  for (let n = 2; await tx.taxonomyTerm.findFirst({ where: { taxonomy, slug: candidate, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }); n++) candidate = `${slug}-${n}`
  return candidate
}

export async function saveTerm(taxonomy: Taxonomy, input: Record<string, unknown>, id: number | null = null) {
  const data = validateTerm(input)
  const facet = String(input.facet ?? '')
  if (facet && facet !== 'none' && !Object.hasOwn(TERM_FACETS[taxonomy], facet)) throw new TaxonomyError('فیلد مرتبط با این دسته معتبر نیست')
  const mapping = Object.hasOwn(input, 'facet') ? { facet } : {}
  return db.$transaction(async (tx) => {
    const nodes = await tx.taxonomyTerm.findMany({ where: { taxonomy }, select: { id: true, parentId: true } })
    if (id !== null && !nodes.some((node) => node.id === id)) throw new TaxonomyError('دسته پیدا نشد', 404)
    if (id === null && nodes.length >= MAX_TERMS) throw new TaxonomyError('به سقف تعداد دسته‌ها رسیده‌اید')
    assertParent(nodes, id, data.parentId)
    const slug = await uniqueSlug(tx, taxonomy, data.slug, id)
    const sortOrder = id === null && !input.sortOrder ? (await tx.taxonomyTerm.count({ where: { taxonomy, parentId: data.parentId } })) * 10 : data.sortOrder
    return id === null
      ? tx.taxonomyTerm.create({ data: { ...data, ...mapping, slug, sortOrder, taxonomy } })
      : tx.taxonomyTerm.update({ where: { id }, data: { ...data, ...mapping, slug, sortOrder } })
  })
}

/** Deletes a term; its children move up to the deleted term's parent. */
export async function deleteTerm(taxonomy: Taxonomy, id: number) {
  await db.$transaction(async (tx) => {
    const term = await tx.taxonomyTerm.findFirst({ where: { id, taxonomy } })
    if (!term) throw new TaxonomyError('دسته پیدا نشد', 404)
    await tx.taxonomyTerm.updateMany({ where: { taxonomy, parentId: id }, data: { parentId: term.parentId } })
    await tx.taxonomyTerm.delete({ where: { id } })
  })
  await recount(taxonomy)
}

/** Bulk order/parent change from the tree editor: [{ id, parentId, sortOrder }]. */
export async function reorderTerms(taxonomy: Taxonomy, moves: unknown) {
  if (!Array.isArray(moves) || moves.length > MAX_TERMS) throw new TaxonomyError('ترتیب ارسالی معتبر نیست')
  await db.$transaction(async (tx) => {
    const nodes = await tx.taxonomyTerm.findMany({ where: { taxonomy }, select: { id: true, parentId: true } })
    const next = nodes.map((node) => ({ ...node }))
    const updates: { id: number; parentId: number | null; sortOrder: number }[] = []
    for (const raw of moves) {
      const row = (raw || {}) as Record<string, unknown>
      const id = Number(row.id)
      const parentId = row.parentId === null || row.parentId === undefined ? null : Number(row.parentId)
      const node = next.find((entry) => entry.id === id)
      if (!node) throw new TaxonomyError('دسته پیدا نشد', 404)
      assertParent(next, id, parentId)
      node.parentId = parentId
      updates.push({ id, parentId, sortOrder: Math.max(0, Math.min(100_000, Math.round(Number(row.sortOrder) || 0))) })
    }
    for (const update of updates) await tx.taxonomyTerm.update({ where: { id: update.id }, data: { parentId: update.parentId, sortOrder: update.sortOrder } })
  })
}

/** Replaces an item's terms (called inside the item's save transaction). */
export async function assignTerms(tx: Tx, taxonomy: Taxonomy, ownerId: number, input: unknown) {
  const valid = new Set((await tx.taxonomyTerm.findMany({ where: { taxonomy }, select: { id: true } })).map((term) => term.id))
  const { ids, primary } = normalizeAssignment(input, valid)
  await tx.taxonomyAssignment.deleteMany({ where: { taxonomy, ownerId } })
  if (ids.length) await tx.taxonomyAssignment.createMany({ data: ids.map((termId) => ({ termId, ownerId, taxonomy, primary: termId === primary })) })
}

/** The content owner writes these fields in the same transaction as its assignments. */
export async function projectedTermFields(tx: Tx, taxonomy: Taxonomy, ownerId: number | null, input: unknown) {
  const terms = await listTerms(taxonomy, tx)
  const old = ownerId ? await tx.taxonomyAssignment.findMany({ where: { taxonomy, ownerId } }) : []
  return termProjectionChange(taxonomy, terms, { ids: old.map(t => t.termId), primary: old.find(t => t.primary)?.termId }, input)
}

export async function removeOwner(tx: Tx, taxonomy: Taxonomy, ownerId: number) {
  await tx.taxonomyAssignment.deleteMany({ where: { taxonomy, ownerId } })
}

/** ownerId → { ids, primary } for the admin form. */
export async function assignmentsFor(taxonomy: Taxonomy, ownerIds: number[]) {
  const rows = ownerIds.length ? await db.taxonomyAssignment.findMany({ where: { taxonomy, ownerId: { in: ownerIds } } }) : []
  const map = new Map<number, { ids: number[]; primary: number | null }>()
  for (const row of rows) {
    const entry = map.get(row.ownerId) || { ids: [], primary: null }
    entry.ids.push(row.termId)
    if (row.primary) entry.primary = row.termId
    map.set(row.ownerId, entry)
  }
  return map
}

/** ownerId → its primary term with the root-first chain (for cards and breadcrumbs). */
export async function primaryTerms(taxonomy: Taxonomy, ownerIds: number[]) {
  if (!ownerIds.length) return new Map<number, { name: string; path: string; chain: { name: string; path: string }[] }>()
  const [terms, rows] = await Promise.all([listTerms(taxonomy), db.taxonomyAssignment.findMany({ where: { taxonomy, ownerId: { in: ownerIds } }, orderBy: { primary: 'desc' } })])
  const out = new Map<number, { name: string; path: string; chain: { name: string; path: string }[] }>()
  for (const row of rows) {
    if (out.has(row.ownerId)) continue
    const term = terms.find((t) => t.id === row.termId)
    if (!term) continue
    const chainIds: number[] = []
    for (let current: typeof term | undefined = term; current && chainIds.length < 6; current = current.parentId ? terms.find((t) => t.id === current!.parentId) : undefined) chainIds.unshift(current.id)
    out.set(row.ownerId, {
      name: term.name, path: termPath(taxonomy, terms, term.id),
      chain: chainIds.map((id) => ({ name: terms.find((t) => t.id === id)!.name, path: termPath(taxonomy, terms, id) })),
    })
  }
  return out
}

/** Stores the number of published items per term (a term counts its sub-terms' items too). */
export async function recount(taxonomy: Taxonomy) {
  const [terms, rows] = await Promise.all([listTerms(taxonomy), db.taxonomyAssignment.findMany({ where: { taxonomy }, select: { termId: true, ownerId: true } })])
  const liveIds = new Set(await liveOwnerIds(db, taxonomy, [...new Set(rows.map((row) => row.ownerId))]))
  const owners = new Map<number, Set<number>>()
  for (const row of rows) if (liveIds.has(row.ownerId)) owners.set(row.termId, (owners.get(row.termId) || new Set<number>()).add(row.ownerId))
  for (const term of terms) {
    const all = new Set<number>()
    for (const id of descendants(terms, term.id)) for (const owner of owners.get(id) || []) all.add(owner)
    if (term.count !== all.size) await db.taxonomyTerm.update({ where: { id: term.id }, data: { count: all.size } })
  }
}

/** The term at /a/b/c plus its children, chain and the owner ids it covers. */
export async function resolveTermPath(taxonomy: Taxonomy, slugs: string[]) {
  const terms = await listTerms(taxonomy)
  const term = termBySlugs(terms, slugs)
  if (!term) return null
  const withPath = (t: (typeof terms)[number]) => ({ ...t, path: termPath(taxonomy, terms, t.id) })
  const chain: (typeof terms)[number][] = []
  for (let current: typeof term | undefined = term; current && chain.length < 6; current = current.parentId ? terms.find((t) => t.id === current!.parentId) : undefined) chain.unshift(current)
  const ids = descendants(terms, term.id)
  const ownerIds = [...new Set((await db.taxonomyAssignment.findMany({ where: { taxonomy, termId: { in: ids } }, select: { ownerId: true } })).map((row) => row.ownerId))]
  return {
    term: withPath(term),
    chain: chain.map(withPath),
    children: terms.filter((t) => t.parentId === term.id).map(withPath),
    siblings: terms.filter((t) => t.parentId === term.parentId && t.id !== term.id).map(withPath),
    ownerIds,
  }
}

/** Owner ids under a term slug (any depth) — for `?term=` filters. */
export async function ownerIdsForTermSlug(taxonomy: Taxonomy, slug: string): Promise<number[] | null> {
  const terms = await listTerms(taxonomy)
  const term = terms.find((t) => t.slug === slug)
  if (!term) return null
  return [...new Set((await db.taxonomyAssignment.findMany({ where: { taxonomy, termId: { in: descendants(terms, term.id) } }, select: { ownerId: true } })).map((row) => row.ownerId))]
}

// ------------------------------------------------------------------ import from the old free-text fields

async function ensureTerm(tx: Tx, taxonomy: Taxonomy, name: string, parentId: number | null) {
  const existing = await tx.taxonomyTerm.findFirst({ where: { taxonomy, name, parentId } })
  if (existing) return existing.id
  const base = slugify(name) || 'term'
  const slug = await uniqueSlug(tx, taxonomy, base, null)
  const sortOrder = (await tx.taxonomyTerm.count({ where: { taxonomy, parentId } })) * 10
  return (await tx.taxonomyTerm.create({ data: { taxonomy, name: name.slice(0, 80), slug, parentId, sortOrder } })).id
}

/**
 * Builds the tree from the old free-text fields and assigns every item —
 * software: platform › category; games: genres; music: album genre;
 * cinema: movies/series › genre. Existing terms and assignments are kept.
 * A taxonomy with no old field behind it (the language of music) has nothing to import.
 */
export async function importLegacy(taxonomy: Taxonomy) {
  if (!LEGACY_SOURCES.includes(taxonomy)) throw new TaxonomyError('این دسته‌بندی فیلد قدیمی‌ای ندارد که از آن ساخته شود')
  let assigned = 0
  await db.$transaction(async (tx) => {
    const add = async (ownerId: number, termIds: number[]) => {
      const existing = await tx.taxonomyAssignment.findMany({ where: { taxonomy, ownerId } })
      const hasPrimary = existing.some((row) => row.primary)
      for (const [index, termId] of termIds.entries()) {
        if (existing.some((row) => row.termId === termId)) continue
        await tx.taxonomyAssignment.create({ data: { taxonomy, ownerId, termId, primary: !hasPrimary && index === 0 } })
        assigned++
      }
    }
    if (taxonomy === 'software') {
      for (const row of await tx.softwareTitle.findMany({ select: { id: true, platforms: true, category: true } })) {
        const ids: number[] = []
        for (const platform of split(row.platforms).slice(0, 6)) {
          const parent = await ensureTerm(tx, taxonomy, platform, null)
          ids.push(row.category.trim() ? await ensureTerm(tx, taxonomy, row.category.trim(), parent) : parent)
        }
        if (!ids.length && row.category.trim()) ids.push(await ensureTerm(tx, taxonomy, row.category.trim(), null))
        await add(row.id, ids)
      }
    } else if (taxonomy === 'games') {
      for (const row of await tx.gameTitle.findMany({ select: { id: true, genres: true } })) {
        const ids: number[] = []
        for (const genre of split(row.genres).slice(0, 6)) ids.push(await ensureTerm(tx, taxonomy, genre, null))
        await add(row.id, ids)
      }
    } else if (taxonomy === 'music') {
      for (const row of await tx.musicAlbum.findMany({ select: { id: true, genre: true } })) {
        const ids: number[] = []
        for (const genre of split(row.genre).slice(0, 4)) ids.push(await ensureTerm(tx, taxonomy, genre, null))
        await add(row.id, ids)
      }
    } else if (taxonomy === 'cinema') {
      const roots = { MOVIE: await ensureTerm(tx, taxonomy, 'فیلم', null), SERIES: await ensureTerm(tx, taxonomy, 'سریال', null) }
      for (const row of await tx.cinemaTitle.findMany({ select: { id: true, kind: true, genres: true } })) {
        const parent = row.kind === 'SERIES' ? roots.SERIES : roots.MOVIE
        const ids: number[] = []
        for (const genre of split(row.genres).slice(0, 5)) ids.push(await ensureTerm(tx, taxonomy, genre, parent))
        await add(row.id, ids.length ? ids : [parent])
      }
    }
  }, { timeout: 60_000 })
  await recount(taxonomy)
  return { assigned, terms: await db.taxonomyTerm.count({ where: { taxonomy } }) }
}

/** Flat indented options for pickers. */
export async function termOptions(taxonomy: Taxonomy) {
  return flatten(buildTree(await listTerms(taxonomy))).map((term) => ({ id: term.id, name: term.name, slug: term.slug, facet: term.facet, depth: term.depth, parentId: term.parentId, count: term.count }))
}
