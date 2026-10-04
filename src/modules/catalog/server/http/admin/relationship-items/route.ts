import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { err, ok } from '@/platform/http/response'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { itemCards, searchItemCards } from '@/modules/content/server/registry'
import { db } from '@/platform/database/prisma'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'

/** Catalog editor lookup reuses the public Content registry; never relaxes CMS permissions. */
export async function GET(req: NextRequest) {
  const g = await adminGuard(req, null, ['cms.products'])
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams, parts = params.get('refs')?.split(',').filter(Boolean) || []
  if (parts.length > 12 || parts.some(ref => !/^product:[1-9]\d*$/.test(ref) || !Number.isSafeInteger(Number(ref.slice(8)))) || new Set(parts).size !== parts.length) return err('invalid refs', 400)
  const rawSource = params.get('sourceId') || '0', sourceId = Number(rawSource)
  if (!/^\d+$/.test(rawSource) || !Number.isSafeInteger(sourceId)) return err('invalid source', 400)
  if (!await isStoreEnabled()) return ok({ matches: [], selected: [] })
  const refs = parts.map(ref => ({ type: 'product' as const, id: Number(ref.slice(8)) }))
  const query = String(params.get('q') || '').trim().slice(0, 100)
  const [found, selected] = await Promise.all([searchItemCards(query.length >= 2 ? query : '', ['product'], 20), itemCards(refs)])
  const card = (row: { type: string; id: number; title: string; titleEn?: string; url: string; image: string }) => ({ type: row.type, id: row.id, title: row.title, titleEn: row.titleEn || '', url: row.url, image: row.image })
  const choices = params.get('variants') === '1' ? await db.product.findMany({ where: { ...publicProductWhere, id: { in: refs.map(ref => ref.id) } }, select: { id: true, variants: { where: { active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true } } } }) : undefined
  return ok({ matches: found.filter(row => row.id !== sourceId).map(card), selected: [...selected.values()].filter(row => row.id !== sourceId).map(card), ...(choices ? { variantChoices: choices } : {}) })
}
