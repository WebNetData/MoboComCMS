import { db } from '@/platform/database/prisma'
import { createReadStream } from 'node:fs'
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { logEvent } from '@/platform/observability/logger'
import { isModuleEnabled } from '@/extensions/server/modules'
import { normalizePersian, relevance, searchTokens, searchableText } from '@/shared/text/persian'
import { ITEM_TYPES, itemKey, type ItemRef, type ItemType } from '@/modules/content/domain/items'
import { searchIndexPage, enabledItemTypes, searchIndexCard, itemCards, type ItemCard } from '@/modules/content/server/registry'
import { recordSearch } from '@/modules/analytics/server/collect'
import { RankedWindow } from '@/modules/search/domain/ranked-window'
import { compareSearchBoundary, decodeSearchCursor, encodeSearchCursor, searchCursorScope } from './cursor'
import { NO_FACETS, facetKey, meetsRating, normalizeFacets, sinceDate, type SearchFacets } from '@/modules/search/domain/facets'
import { ratingsOfItems, type ItemRating } from '@/modules/reviews/server/ratings'

/**
 * Site-wide search over one denormalized table (SearchDocument). Documents hold
 * Persian-normalized text so a plain `contains` works on SQLite and PostgreSQL;
 * ranking happens in bounded memory as matching rows are paged. The index rebuilds
 * itself when it is older than STALE_MS and is patched on content saves.
 */

const STALE_MS = 10 * 60_000
const INDEXED_AT = 'search.indexedAt'
const SUGGESTION_CANDIDATES = 400
const INDEX_PAGE_SIZE = 500
export const PAGE_SIZE = 20
const MAX_PAGE = 50
const MAX_TOP_HITS = PAGE_SIZE * MAX_PAGE

const toDocument = (item: ItemCard) => ({
  itemType: item.type, itemId: item.id, title: item.title.slice(0, 300), subtitle: item.subtitle.slice(0, 300),
  text: searchableText(item.title, item.subtitle, item.keywords, item.summary),
  url: item.url, image: item.image.slice(0, 1000), access: item.access,
  boost: Math.min(1_000_000, Math.max(0, Math.round(item.popularity))), publishedAt: item.publishedAt,
})

let rebuilding: Promise<number> | null = null

/** Rebuilds the whole index (single flight). Returns the number of documents. */
export function rebuildSearchIndex(): Promise<number> {
  rebuilding ??= (async () => {
    let directory = ''
    try {
      const types = await enabledItemTypes()
      directory = await mkdtemp(join(tmpdir(), 'mobocom-search-'))
      const file = join(directory, 'documents.ndjson')
      await writeFile(file, '')
      let count = 0
      for (const type of types) {
        let cursor = 0
        for (;;) {
          const page = await searchIndexPage(type, cursor, INDEX_PAGE_SIZE)
          if (!page.length) break
          if (page.some((item, index) => item.id <= (index ? page[index - 1].id : cursor))) throw new Error(`Search index page is not ordered: ${type}`)
          await appendFile(file, `${page.map((item) => JSON.stringify(toDocument(item))).join('\n')}\n`)
          count += page.length
          cursor = page[page.length - 1].id
          if (page.length < INDEX_PAGE_SIZE) break
        }
      }
      await db.$transaction(async (tx) => {
        await tx.searchDocument.deleteMany({})
        let batch: ReturnType<typeof toDocument>[] = []
        const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
        try {
          for await (const line of lines) {
            const row = JSON.parse(line) as Omit<ReturnType<typeof toDocument>, 'publishedAt'> & { publishedAt: string }
            batch.push({ ...row, publishedAt: new Date(row.publishedAt) })
            if (batch.length === INDEX_PAGE_SIZE) {
              await tx.searchDocument.createMany({ data: batch })
              batch = []
            }
          }
        } finally { lines.close() }
        if (batch.length) await tx.searchDocument.createMany({ data: batch })
        await tx.setting.upsert({ where: { key: INDEXED_AT }, create: { key: INDEXED_AT, value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
      }, { timeout: Math.min(300_000, Math.max(60_000, Math.ceil(count / 500) * 500)) })
      return count
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch((error) => logEvent('warn', 'search.temp_cleanup_failed', { error }))
      rebuilding = null
    }
  })()
  return rebuilding
}

/** Rebuilds in the background when the index is stale; waits only when it is empty. */
async function ensureFreshIndex() {
  const row = await db.setting.findUnique({ where: { key: INDEXED_AT } }).catch(() => null)
  const age = row ? Date.now() - new Date(row.value).getTime() : Infinity
  if (age < STALE_MS) return row!.value
  const task = rebuildSearchIndex().catch((error) => { logEvent('error', 'search.rebuild_failed', { error }); return 0 })
  if (!row) {
    await task
    return (await db.setting.findUnique({ where: { key: INDEXED_AT } }).catch(() => null))?.value || ''
  }
  return row.value
}

/** Updates (or removes) one item right after it is saved, published or deleted. */
export async function reindexItem(ref: ItemRef) {
  try {
    const item = await searchIndexCard(ref)
    if (!item) await db.searchDocument.deleteMany({ where: { itemType: ref.type, itemId: ref.id } })
    else {
      const data = toDocument(item)
      await db.searchDocument.upsert({ where: { itemType_itemId: { itemType: ref.type, itemId: ref.id } }, create: data, update: data })
    }
  } catch (error) {
    logEvent('error', 'search.reindex_failed', { ref: itemKey(ref), error })
  }
}

export type SearchHit = { type: ItemType; id: number; title: string; subtitle: string; url: string; image: string; access: string; score: number; snippet: string; rating: ItemRating | null }
export type SearchResult = { facets: SearchFacets; query: string; tokens: string[]; type: ItemType | 'all'; hits: SearchHit[]; total: number; page: number; pages: number; counts: Partial<Record<ItemType, number>>; totalPages: number; nextCursor: string | null; previousCursor: string | null; cursorReset: boolean }
type RankedCandidate = { row: { id: number; itemType: string; itemId: number; title: string; text: string; boost: number; publishedAt: Date }; card: ItemCard; score: number }

const boundary = (candidate: RankedCandidate) => ({ score: candidate.score, publishedAt: candidate.row.publishedAt.getTime(), boost: candidate.row.boost, id: candidate.row.id })
const byRank = (a: RankedCandidate, b: RankedCandidate) => b.score - a.score || b.row.publishedAt.getTime() - a.row.publishedAt.getTime() || b.row.boost - a.row.boost || a.row.id - b.row.id

/** A short piece of the indexed text around the first matching token. */
function snippet(text: string, tokens: string[]): string {
  const words = text.split(' ')
  const at = words.findIndex((word) => tokens.some((token) => word.includes(token)))
  if (at < 0) return ''
  return words.slice(Math.max(0, at - 8), at + 18).join(' ')
}

export async function searchSite(input: { q: unknown; type?: unknown; page?: unknown; cursor?: unknown; log?: boolean; suggestion?: boolean; facets?: { access?: unknown; rated?: unknown; since?: unknown } | null }): Promise<SearchResult> {
  const query = String(input.q ?? '').trim().slice(0, 100)
  const tokens = searchTokens(query)
  const types = await enabledItemTypes()
  const type = types.includes(input.type as ItemType) ? input.type as ItemType : 'all'
  const page = Math.max(1, Math.min(MAX_PAGE, Math.floor(Number(input.page) || 1)))
  // Autocomplete is never narrowed: it answers what is typed.
  const facets = input.suggestion ? NO_FACETS : normalizeFacets(input.facets)
  const empty: SearchResult = { facets, query, tokens, type, hits: [], total: 0, page: 1, pages: 0, counts: {}, totalPages: 0, nextCursor: null, previousCursor: null, cursorReset: false }
  if (!tokens.length || !await isModuleEnabled('search')) return empty
  const epoch = await ensureFreshIndex()
  // A page cursor belongs to the facets it was made under: with other facets it is another list.
  const narrowed = facetKey(facets)
  const scope = searchCursorScope(normalizePersian(query), narrowed ? `${type}|${narrowed}` : type, epoch)
  const cursorRequested = !input.suggestion && input.cursor != null
  const cursor = cursorRequested ? decodeSearchCursor(input.cursor, scope) : null
  const cursorReset = cursorRequested && !cursor

  const queryTypes = input.suggestion && type !== 'all' ? [type] : types
  const now = new Date()
  const since = sinceDate(facets, now)
  const where = {
    itemType: { in: queryTypes }, publishedAt: { lte: now, ...(since ? { gte: since } : {}) }, AND: tokens.map((token) => ({ text: { contains: token } })),
    ...(facets.access ? { access: facets.access === 'members' ? 'MEMBERS' : { not: 'MEMBERS' } } : {}),
  }
  const phrase = normalizePersian(query)
  const counts: Partial<Record<ItemType, number>> = {}
  const top = new RankedWindow<RankedCandidate>(cursor ? PAGE_SIZE : MAX_TOP_HITS, cursor?.direction === 'before' ? (a, b) => -byRank(a, b) : byRank)
  let eligible = 0
  let matchedTotal = 0
  let afterId = 0
  while (true) {
    // Autocomplete retains a small popularity sample to stay responsive on each keystroke.
    const rows = input.suggestion
      ? await db.searchDocument.findMany({ where, orderBy: { boost: 'desc' }, take: SUGGESTION_CANDIDATES })
      : await db.searchDocument.findMany({ where: { ...where, id: { gt: afterId } }, orderBy: { id: 'asc' }, take: INDEX_PAGE_SIZE })
    if (!rows.length) break
    // Recheck current source visibility because SearchDocument can lag a publication change.
    const publicCards = await itemCards(rows.map((row) => ({ type: row.itemType as ItemType, id: row.itemId })))
    // Ratings are asked of their owners for this batch only, and only when the search is narrowed by them.
    const rated = facets.rated ? await ratingsOfItems([...publicCards.values()].map((card) => ({ type: card.type, id: card.id }))) : null
    for (const row of rows) {
      const card = publicCards.get(`${row.itemType}:${row.itemId}`)
      if (!card) continue
      // The source decides who may open an item; the index can lag behind a change of it.
      if (facets.access && (card.access === 'MEMBERS') !== (facets.access === 'members')) continue
      if (rated && !meetsRating(rated.get(`${row.itemType}:${row.itemId}`), facets.rated)) continue
      const relevanceScore = relevance(tokens, row.title, row.text, phrase)
      if (relevanceScore <= 0) continue
      matchedTotal++
      counts[row.itemType as ItemType] = (counts[row.itemType as ItemType] || 0) + 1
      if (type !== 'all' && row.itemType !== type) continue
      // Popularity breaks ties without drowning relevance (log scale, ≤ ~6 points).
      const candidate = { row, card, score: relevanceScore + Math.log10(1 + row.boost) }
      const order = cursor ? compareSearchBoundary(boundary(candidate), cursor) : 0
      if (cursor && (cursor.direction === 'after' ? order <= 0 : order >= 0)) continue
      eligible++
      top.add(candidate)
    }
    if (input.suggestion || rows.length < INDEX_PAGE_SIZE) break
    afterId = rows[rows.length - 1].id
  }
  const total = type === 'all' ? matchedTotal : (counts[type] || 0)
  // The API has always accepted at most 50 pages; report the reachable window.
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pages = cursor ? totalPages : Math.min(MAX_PAGE, totalPages)
  const current = cursor ? cursor.page : Math.min(cursorReset ? 1 : page, Math.max(1, pages))
  const ranked = top.sorted()
  if (cursor?.direction === 'before') ranked.reverse()
  const selected = cursor ? ranked : ranked.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  // Content can disappear between requests. Do not present a stale boundary as "no matches".
  if (cursor && !selected.length) {
    const refreshed = total > 0 ? await searchSite({ ...input, cursor: undefined, page: 1, log: false }) : { ...empty, counts }
    return { ...refreshed, cursorReset: true }
  }
  const canNext = cursor ? (cursor.direction === 'after' ? eligible > selected.length : true) : total > current * PAGE_SIZE
  const canPrevious = cursor ? (cursor.direction === 'before' ? eligible > selected.length : true) : current > 1
  const nextCursor = selected.length && canNext && !input.suggestion ? encodeSearchCursor({ ...boundary(selected[selected.length - 1]), direction: 'after', page: current + 1 }, scope) : null
  const previousCursor = selected.length && canPrevious && !input.suggestion ? encodeSearchCursor({ ...boundary(selected[0]), direction: 'before', page: Math.max(1, current - 1) }, scope) : null
  // What members think of what is shown: one question for the page, to both owners of ratings.
  const ratings = input.suggestion || !selected.length ? null : await ratingsOfItems(selected.map(({ card }) => ({ type: card.type, id: card.id }))).catch(() => null)
  const hits = selected.map(({ row, card, score }) => {
    const rating = ratings?.get(`${card.type}:${card.id}`)
    return {
      type: card.type, id: card.id, title: card.title, subtitle: card.subtitle, url: card.url, image: card.image, access: card.access,
      score: Math.round(score), snippet: snippet(row.text, tokens), rating: rating && rating.count > 0 ? rating : null,
    }
  })
  if (input.log !== false && current === 1 && !cursor) void recordSearch(phrase, matchedTotal)
  return { facets, query, tokens, type, hits, total, page: current, pages, counts, totalPages, nextCursor, previousCursor, cursorReset }
}

/** Autocomplete: the best few hits across all types. */
export async function suggest(q: unknown, only: readonly ItemType[] = []) {
  // Section search boxes ask for their own item types only (e.g. the cinema box → titles):
  // one ranked query per type, merged by score.
  const hits = only.length
    ? (await Promise.all(only.map((type) => searchSite({ q, type, log: false, suggestion: true })))).flatMap((result) => (result.type === 'all' ? [] : result.hits)).sort((a, b) => b.score - a.score)
    : (await searchSite({ q, log: false, suggestion: true })).hits
  return hits.slice(0, 8).map((hit) => ({ type: hit.type, title: hit.title, subtitle: hit.subtitle, url: hit.url, image: hit.image }))
}

/** `types=title,album` → the known item types in it. */
export function parseTypes(value: unknown): ItemType[] {
  return String(value ?? '').split(',').map((part) => part.trim()).filter((part): part is ItemType => (ITEM_TYPES as readonly string[]).includes(part)).slice(0, ITEM_TYPES.length)
}

export const SEARCH_TYPES: readonly ItemType[] = ITEM_TYPES
