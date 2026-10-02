import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { isModuleEnabled } from '@/extensions/server/modules'
import { normalizePersian, relevance, searchTokens, searchableText } from '@/shared/text/persian'
import { ITEM_TYPES, itemKey, type ItemRef, type ItemType } from '@/modules/content/domain/items'
import { allItems, enabledItemTypes, itemCard, itemCards, type ItemCard } from '@/modules/content/server/registry'
import { recordSearch } from '@/modules/analytics/server/collect'

/**
 * Site-wide search over one denormalized table (SearchDocument). Documents hold
 * Persian-normalized text so a plain `contains` works on SQLite and PostgreSQL;
 * ranking happens in memory on the matching candidates. The index rebuilds
 * itself when it is older than STALE_MS and is patched on content saves.
 */

const STALE_MS = 10 * 60_000
const INDEXED_AT = 'search.indexedAt'
const CANDIDATES = 400
export const PAGE_SIZE = 20

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
    try {
      const types = await enabledItemTypes()
      const documents = (await Promise.all(types.map((type) => allItems(type)))).flat().map(toDocument)
      await db.$transaction(async (tx) => {
        await tx.searchDocument.deleteMany({})
        for (let i = 0; i < documents.length; i += 500) await tx.searchDocument.createMany({ data: documents.slice(i, i + 500) })
        await tx.setting.upsert({ where: { key: INDEXED_AT }, create: { key: INDEXED_AT, value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
      }, { timeout: 60_000 })
      return documents.length
    } finally { rebuilding = null }
  })()
  return rebuilding
}

/** Rebuilds in the background when the index is stale; waits only when it is empty. */
async function ensureFreshIndex() {
  const row = await db.setting.findUnique({ where: { key: INDEXED_AT } }).catch(() => null)
  const age = row ? Date.now() - new Date(row.value).getTime() : Infinity
  if (age < STALE_MS) return
  const task = rebuildSearchIndex().catch((error) => { logEvent('error', 'search.rebuild_failed', { error }); return 0 })
  if (!row) await task
}

/** Updates (or removes) one item right after it is saved, published or deleted. */
export async function reindexItem(ref: ItemRef) {
  try {
    const item = await itemCard(ref)
    if (!item) await db.searchDocument.deleteMany({ where: { itemType: ref.type, itemId: ref.id } })
    else {
      const data = toDocument(item)
      await db.searchDocument.upsert({ where: { itemType_itemId: { itemType: ref.type, itemId: ref.id } }, create: data, update: data })
    }
  } catch (error) {
    logEvent('error', 'search.reindex_failed', { ref: itemKey(ref), error })
  }
}

export type SearchHit = { type: ItemType; id: number; title: string; subtitle: string; url: string; image: string; access: string; score: number; snippet: string }
export type SearchResult = { query: string; tokens: string[]; type: ItemType | 'all'; hits: SearchHit[]; total: number; page: number; pages: number; counts: Partial<Record<ItemType, number>> }

/** A short piece of the indexed text around the first matching token. */
function snippet(text: string, tokens: string[]): string {
  const words = text.split(' ')
  const at = words.findIndex((word) => tokens.some((token) => word.includes(token)))
  if (at < 0) return ''
  return words.slice(Math.max(0, at - 8), at + 18).join(' ')
}

export async function searchSite(input: { q: unknown; type?: unknown; page?: unknown; log?: boolean }): Promise<SearchResult> {
  const query = String(input.q ?? '').trim().slice(0, 100)
  const tokens = searchTokens(query)
  const types = await enabledItemTypes()
  const type = types.includes(input.type as ItemType) ? input.type as ItemType : 'all'
  const page = Math.max(1, Math.min(50, Math.floor(Number(input.page) || 1)))
  const empty: SearchResult = { query, tokens, type, hits: [], total: 0, page: 1, pages: 0, counts: {} }
  if (!tokens.length || !await isModuleEnabled('search')) return empty
  await ensureFreshIndex()

  const rows = await db.searchDocument.findMany({
    where: { itemType: { in: types }, AND: tokens.map((token) => ({ text: { contains: token } })) },
    orderBy: { boost: 'desc' }, take: CANDIDATES,
  })
  // The index may lag a publication change; verify bounded candidates now.
  const publicCards = await itemCards(rows.map((row) => ({ type: row.itemType as ItemType, id: row.itemId })))
  const phrase = normalizePersian(query)
  const scored = rows.flatMap((row) => {
    const card = publicCards.get(`${row.itemType}:${row.itemId}`)
    if (!card) return []
    const score = relevance(tokens, row.title, row.text, phrase)
    // Popularity breaks ties without drowning relevance (log scale, ≤ ~6 points).
    return [{ row, card, score: score ? score + Math.log10(1 + row.boost) : 0 }]
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || b.row.publishedAt.getTime() - a.row.publishedAt.getTime())

  const counts: Partial<Record<ItemType, number>> = {}
  for (const { row } of scored) counts[row.itemType as ItemType] = (counts[row.itemType as ItemType] || 0) + 1
  const filtered = type === 'all' ? scored : scored.filter(({ row }) => row.itemType === type)
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const current = Math.min(page, Math.max(1, pages))
  const hits = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map(({ row, card, score }) => ({
    type: card.type, id: card.id, title: card.title, subtitle: card.subtitle, url: card.url, image: card.image, access: card.access,
    score: Math.round(score), snippet: snippet(row.text, tokens),
  }))
  if (input.log !== false && current === 1) void recordSearch(phrase, scored.length)
  return { query, tokens, type, hits, total: filtered.length, page: current, pages, counts }
}

/** Autocomplete: the best few hits across all types. */
export async function suggest(q: unknown, only: readonly ItemType[] = []) {
  // Section search boxes ask for their own item types only (e.g. the cinema box → titles):
  // one ranked query per type, merged by score.
  const hits = only.length
    ? (await Promise.all(only.map((type) => searchSite({ q, type, log: false })))).flatMap((result) => (result.type === 'all' ? [] : result.hits)).sort((a, b) => b.score - a.score)
    : (await searchSite({ q, log: false })).hits
  return hits.slice(0, 8).map((hit) => ({ type: hit.type, title: hit.title, subtitle: hit.subtitle, url: hit.url, image: hit.image }))
}

/** `types=title,album` → the known item types in it. */
export function parseTypes(value: unknown): ItemType[] {
  return String(value ?? '').split(',').map((part) => part.trim()).filter((part): part is ItemType => (ITEM_TYPES as readonly string[]).includes(part)).slice(0, ITEM_TYPES.length)
}

export const SEARCH_TYPES: readonly ItemType[] = ITEM_TYPES
