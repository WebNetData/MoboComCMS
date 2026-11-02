import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { LINKABLE, itemKey, type ItemRef, type ItemType } from '@/modules/content/domain/items'
import { enabledItemTypes, itemCards, searchItemCards, type ItemCard } from '@/modules/content/server/registry'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'

export type PostItemLinkInput = ItemRef
export type PostLinkCard = { type: ItemType; id: number; title: string; titleEn: string; url: string; image: string }
const MAX_LINKS = 12

/** Articles reference content entities through the shared registry vocabulary — never other articles or threads. */
export const LINKABLE_TYPES: readonly ItemType[] = LINKABLE
const isLinkableType = (value: unknown): value is ItemType => (LINKABLE_TYPES as readonly string[]).includes(String(value))
const toCard = (card: ItemCard): PostLinkCard => ({ type: card.type, id: card.id, title: card.title, titleEn: card.titleEn || '', url: card.url, image: card.image })

/** Ordered, unique, bounded `{ type, id }` pairs. Unknown types, duplicates and oversize payloads are rejected. */
export function parsePostItemLinks(value: unknown): PostItemLinkInput[] {
  if (!Array.isArray(value) || value.length > MAX_LINKS) throw new Error('Invalid article links')
  const seen = new Set<string>()
  return value.map((entry): PostItemLinkInput => {
    const type = entry && typeof entry === 'object' ? (entry as { type?: unknown }).type : undefined
    const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined
    if (!isLinkableType(type) || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid article links')
    const key = itemKey({ type, id })
    if (seen.has(key)) throw new Error('Invalid article links')
    seen.add(key)
    return { type, id }
  })
}

/** Parses `refs=product:5,game:3`; `null` marks an invalid list. */
export function parsePostLinkRefs(value: unknown): PostItemLinkInput[] | null {
  const raw = String(value || '')
  const parts = raw ? raw.split(',') : []
  if (parts.length > MAX_LINKS) return null
  const refs: PostItemLinkInput[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    if (!/^[a-z]+:[1-9]\d*$/.test(part)) return null
    const [type, rawId] = part.split(':')
    const id = Number(rawId)
    if (!isLinkableType(type) || !Number.isSafeInteger(id) || id <= 0) return null
    const key = itemKey({ type, id })
    if (seen.has(key)) return null
    seen.add(key)
    refs.push({ type, id })
  }
  return refs
}

/**
 * New selections must name currently public items of enabled modules; links that already exist stay
 * editable after their target is withdrawn. Registry cards own per-type visibility, Store keeps its
 * extra storefront gate. Validation runs before any write, so a rejected payload changes nothing.
 */
export async function validatePostItemLinks(tx: Prisma.TransactionClient, links: PostItemLinkInput[], postId?: number) {
  const existing = postId ? await tx.postItemLink.findMany({ where: { postId }, select: { itemType: true, itemId: true } }) : []
  const known = new Set(existing.map((link) => itemKey({ type: link.itemType as ItemType, id: link.itemId })))
  const fresh = links.filter((link) => !known.has(itemKey(link)))
  if (!fresh.length) return
  if (fresh.some((link) => link.type === 'product') && (!await isModuleEnabled('store') || !await isStoreEnabled())) throw new Error('Store is unavailable')
  const cards = await itemCards(fresh, tx)
  if (fresh.some((link) => !cards.has(itemKey(link)))) throw new Error('Linked public item not found')
}

export async function replacePostItemLinks(tx: Prisma.TransactionClient, postId: number, links: PostItemLinkInput[]) {
  await tx.postItemLink.deleteMany({ where: { postId } })
  if (links.length) await tx.postItemLink.createMany({ data: links.map((link, position) => ({ postId, itemType: link.type, itemId: link.id, position })) })
}

/** Bounded picker search for one linkable type plus resolution of the already selected refs. */
export async function searchPostLinkItems(type: unknown, query: unknown, selected: PostItemLinkInput[] = []) {
  const refs = selected.slice(0, MAX_LINKS)
  const enabled = await enabledItemTypes()
  const storeOpen = await isStoreEnabled()
  const shown = refs.filter((ref) => isLinkableType(ref.type) && enabled.includes(ref.type) && (ref.type !== 'product' || storeOpen))
  const [matches, cards] = await Promise.all([
    isLinkableType(type) && enabled.includes(type) && (type !== 'product' || storeOpen) ? searchItemCards(query, [type], 25) : Promise.resolve([]),
    shown.length ? itemCards(shown) : Promise.resolve(new Map<string, ItemCard>()),
  ])
  return {
    matches: matches.map(toCard),
    selected: shown.flatMap((ref) => { const card = cards.get(itemKey(ref)); return card ? [toCard(card)] : [] }),
  }
}

/** Keep the product-only picker response compatible with older admin clients. */
export async function searchPostLinkProducts(query: string | null, selectedIds: number[]) {
  if (!await isModuleEnabled('store') || !await isStoreEnabled()) return { matches: [], selected: [] }
  const q = String(query || '').trim().slice(0, 100)
  const insensitive = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '') ? { mode: 'insensitive' as const } : {}
  const select = { id: true, name: true, nameEn: true, slug: true, active: true, approval: true, audienceGroups: true }
  const [matches, selected] = await Promise.all([
    q.length >= 2 ? db.product.findMany({ where: { ...publicProductWhere, OR: [{ name: { contains: q, ...insensitive } }, { nameEn: { contains: q, ...insensitive } }, { slug: { contains: q, ...insensitive } }] }, orderBy: { id: 'desc' }, take: 25, select }) : [],
    selectedIds.length ? db.product.findMany({ where: { id: { in: selectedIds }, ...publicProductWhere }, select }) : [],
  ])
  return { matches, selected }
}

/** Saved article links resolved against current visibility, retaining editor order. */
export async function publicPostLinkItems(postId: number): Promise<PostLinkCard[]> {
  const links = await db.postItemLink.findMany({
    where: { postId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    take: MAX_LINKS,
    select: { itemType: true, itemId: true },
  })
  if (!links.length) return []
  const storeOpen = await isStoreEnabled()
  const refs = links.flatMap((link) => isLinkableType(link.itemType) && (link.itemType !== 'product' || storeOpen)
    ? [{ type: link.itemType, id: link.itemId }]
    : [])
  if (!refs.length) return []
  const cards = await itemCards(refs)
  return refs.flatMap((ref) => { const card = cards.get(itemKey(ref)); return card ? [toCard(card)] : [] })
}
