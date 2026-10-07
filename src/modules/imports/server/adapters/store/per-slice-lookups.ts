import { db } from '@/platform/database/prisma'
import type { SourceItem } from '@/modules/imports/domain/types'
import { toText } from '@/modules/imports/domain/values'
import { identityOf, loadIdentities } from '@/modules/imports/server/adapters/common'
import { type ImportContext } from '@/modules/imports/server/registry'
import { caches } from '@/modules/imports/server/adapters/store/run-caches'
import { E } from '@/modules/imports/server/adapters/store/core'

export type Existing = {
  id: number; slug: string; name: string; nameEn: string; sku: string; description: string; shortDescription: string; image: string; gallery: string
  priceMinor: bigint; compareAtMinor: bigint; currency: string; stock: number; kind: string; categoryId: number | null; brandId: number | null
  specifications: string; pricingMode: string; active: boolean; updatedAt: Date
  variants: { id: number; sku: string; name: string; attributes: string; priceMinor: bigint; compareAtMinor: bigint; stock: number; active: boolean; image: string }[]
}

export const PRODUCT_SELECT = {
  id: true, slug: true, name: true, nameEn: true, sku: true, description: true, shortDescription: true, image: true, gallery: true, priceMinor: true, compareAtMinor: true,
  currency: true, stock: true, kind: true, categoryId: true, brandId: true, specifications: true, pricingMode: true, active: true, updatedAt: true,
  variants: { select: { id: true, sku: true, name: true, attributes: true, priceMinor: true, compareAtMinor: true, stock: true, active: true, image: true } },
} as const

export async function prepare(items: SourceItem[], values: Record<string, unknown>[], ctx: ImportContext) {
  await caches(ctx)
  const externalIds = values.map((v) => toText(v.externalId, 190)).filter(Boolean)
  const variantIds = values.flatMap((_v, i) => items[i].variants.map((variant) => toText(variant.externalId, 190))).filter(Boolean)
  await loadIdentities(ctx, E.product, externalIds)
  await loadIdentities(ctx, E.variant, variantIds)
  const skus = [...new Set(values.map((v) => toText(v.sku, 80)).filter(Boolean))]
  const slugs = [...new Set(values.map((v) => toText(v.slug, 120)).filter(Boolean))]
  const idsFromIdentity = externalIds.map((id) => identityOf(ctx, E.product, id)).filter((id): id is number => !!id)
  const products = await db.product.findMany({ where: { OR: [{ id: { in: idsFromIdentity } }, ...(skus.length ? [{ sku: { in: skus } }] : []), ...(slugs.length ? [{ slug: { in: slugs } }] : [])] }, select: PRODUCT_SELECT })
  const byId = (ctx.cache.get('products') as Map<number, Existing> | undefined) || new Map<number, Existing>()
  for (const p of products) byId.set(p.id, p)
  ctx.cache.set('products', byId)
  const variantSkus = [...new Set(items.flatMap((item) => item.variants.map((v) => toText(v.sku, 80))).filter(Boolean))]
  const owners = variantSkus.length ? await db.productVariant.findMany({ where: { sku: { in: variantSkus } }, select: { sku: true, productId: true } }) : []
  const skuOwner = (ctx.cache.get('variantSkus') as Map<string, number> | undefined) || new Map<string, number>()
  for (const o of owners) skuOwner.set(o.sku, o.productId)
  ctx.cache.set('variantSkus', skuOwner)
}

export function findExisting(ctx: ImportContext, values: Record<string, unknown>): Existing | null {
  const byId = (ctx.cache.get('products') as Map<number, Existing> | undefined) || new Map<number, Existing>()
  const externalId = toText(values.externalId, 190)
  const viaIdentity = externalId ? identityOf(ctx, E.product, externalId) : undefined
  if (viaIdentity && byId.get(viaIdentity)) return byId.get(viaIdentity)!
  const sku = toText(values.sku, 80)
  if (sku) { const hit = [...byId.values()].find((p) => p.sku === sku); if (hit) return hit }
  const slug = toText(values.slug, 120)
  if (slug) { const hit = [...byId.values()].find((p) => p.slug === slug); if (hit) return hit }
  return null
}
