import type { Prisma, ContentDemand } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { demandSection } from '@/modules/support/domain/demand'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'

type Client = Prisma.TransactionClient | typeof db
export const targetFields = ['productId', 'cinemaTitleId', 'gameId', 'softwareId', 'trackId', 'albumId', 'postId', 'threadId'] as const
export type DemandTarget = Partial<Record<typeof targetFields[number], number | null>>
const live = { status: 'PUBLISHED', access: 'PUBLIC', audienceGroups: '', publishedAt: { lte: new Date() } }
export function parseDemandTarget(section: string, raw: Record<string, unknown>): DemandTarget | null {
  const allowed: Record<string, readonly string[]> = { store: ['productId'], cinema: ['cinemaTitleId'], games: ['gameId'], software: ['softwareId'], music: ['trackId', 'albumId'], magazine: ['postId'], forum: ['threadId'] }
  const selected = targetFields.filter(key => raw[key] !== null && raw[key] !== undefined && raw[key] !== '')
  if (selected.length !== 1 || !allowed[section]?.includes(selected[0])) return null
  const value = Number(raw[selected[0]])
  return Number.isSafeInteger(value) && value > 0 ? { [selected[0]]: value } : null
}
/** Minimal current public projection; never use an arbitrary submitted href. */
export async function resolveDemandTarget(section: string, target: DemandTarget, client: Client = db): Promise<{ title: string; href: string } | null> {
  const owner = demandSection(section)
  if (!owner || !await isModuleEnabled(owner.module)) return null
  const publicWhere = { ...live, publishedAt: { lte: new Date() } }
  if (section === 'store' && target.productId) {
    const row = await client.product.findUnique({ where: { id: target.productId }, include: { variants: { where: { active: true }, select: { stock: true } } } })
    if (!row || !isPublicProduct(row) || row.access !== 'PUBLIC' || row.openAmount || row.sellerId || row.stock === 0 || (row.variants.length && row.variants.every(variant => variant.stock === 0))) return null
    return { title: row.name, href: `/products/${encodeURIComponent(row.slug)}` }
  }
  if (section === 'cinema' && target.cinemaTitleId) { const row = await client.cinemaTitle.findFirst({ where: { id: target.cinemaTitleId, ...publicWhere }, select: { title: true, slug: true } }); return row ? { title: row.title, href: `/cinema/${encodeURIComponent(row.slug)}` } : null }
  if (section === 'games' && target.gameId) { const row = await client.gameTitle.findFirst({ where: { id: target.gameId, ...publicWhere }, select: { title: true, slug: true } }); return row ? { title: row.title, href: `/games/${encodeURIComponent(row.slug)}` } : null }
  if (section === 'software' && target.softwareId) { const row = await client.softwareTitle.findFirst({ where: { id: target.softwareId, ...publicWhere }, select: { title: true, slug: true } }); return row ? { title: row.title, href: `/software/${encodeURIComponent(row.slug)}` } : null }
  if (section === 'music' && target.trackId) { const row = await client.musicTrack.findFirst({ where: { id: target.trackId, ...publicWhere, album: { isNot: { audienceGroups: { not: '' } } } }, select: { title: true, slug: true } }); return row ? { title: row.title, href: `/music/track/${encodeURIComponent(row.slug)}` } : null }
  if (section === 'music' && target.albumId) { const row = await client.musicAlbum.findFirst({ where: { id: target.albumId, ...publicWhere }, select: { title: true, slug: true } }); return row ? { title: row.title, href: `/music/album/${encodeURIComponent(row.slug)}` } : null }
  if (section === 'magazine' && target.postId) { const row = await client.post.findFirst({ where: { id: target.postId, ...publicWhere }, select: { title: true, slug: true } }); return row ? { title: row.title, href: `/blog/${encodeURIComponent(row.slug)}` } : null }
  if (section === 'forum' && target.threadId) {
    const { visibleCategories, viewerFor } = await import('@/modules/forum/server/forum')
    const ids = (await visibleCategories(await viewerFor(null))).map(row => row.id)
    const row = await client.forumThread.findFirst({ where: { id: target.threadId, status: 'VISIBLE', listed: true, categoryId: { in: ids } }, select: { id: true, title: true } })
    return row ? { title: row.title, href: `/forum/t/${row.id}` } : null
  }
  return null
}
export const storedDemandTarget = (row: ContentDemand): DemandTarget => Object.fromEntries(targetFields.map(key => [key, row[key]]))
