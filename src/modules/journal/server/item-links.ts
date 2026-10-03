import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { isModuleEnabled } from '@/extensions/server/modules'

export type PostItemLinkInput = { type: 'product'; id: number }
const MAX_LINKS = 12

/** The first editor slice supports products; storage keeps the shared item vocabulary. */
export function parsePostItemLinks(value: unknown): PostItemLinkInput[] {
  if (!Array.isArray(value) || value.length > MAX_LINKS) throw new Error('Invalid article links')
  const seen = new Set<number>()
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || entry.type !== 'product' || !Number.isSafeInteger(entry.id) || entry.id <= 0 || seen.has(entry.id)) throw new Error('Invalid article links')
    seen.add(entry.id)
    return { type: 'product', id: entry.id }
  })
}

export async function validatePostItemLinks(tx: Prisma.TransactionClient, links: PostItemLinkInput[], postId?: number) {
  const existing = postId ? await tx.postItemLink.findMany({ where: { postId, itemType: 'product' }, select: { itemId: true } }) : []
  const known = new Set(existing.map((link) => link.itemId))
  const newIds = links.map((link) => link.id).filter((id) => !known.has(id))
  if (!newIds.length) return
  if (!await isModuleEnabled('store')) throw new Error('Store module is disabled')
  const products = await tx.product.findMany({ where: { id: { in: newIds }, ...publicProductWhere }, select: { id: true } })
  if (products.length !== newIds.length) throw new Error('Linked public product not found')
}

export async function replacePostItemLinks(tx: Prisma.TransactionClient, postId: number, links: PostItemLinkInput[]) {
  await tx.postItemLink.deleteMany({ where: { postId } })
  if (links.length) await tx.postItemLink.createMany({ data: links.map((link, position) => ({ postId, itemType: link.type, itemId: link.id, position })) })
}

export async function searchPostLinkProducts(query: string | null, selectedIds: number[]) {
  if (!await isModuleEnabled('store')) return { matches: [], selected: [] }
  const q = String(query || '').trim().slice(0, 100)
  const [matches, selected] = await Promise.all([
    q.length >= 2 ? db.product.findMany({ where: { ...publicProductWhere, OR: [{ name: { contains: q, mode: 'insensitive' } }, { nameEn: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }, orderBy: { id: 'desc' }, take: 25, select: { id: true, name: true, nameEn: true, slug: true, active: true, approval: true } }) : [],
    selectedIds.length ? db.product.findMany({ where: { id: { in: selectedIds }, ...publicProductWhere }, select: { id: true, name: true, nameEn: true, slug: true, active: true, approval: true } }) : [],
  ])
  return { matches, selected }
}
