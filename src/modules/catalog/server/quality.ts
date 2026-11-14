import { db } from '@/platform/database/prisma'
import { parseJson } from '@/modules/catalog/server/product-config'

export type CatalogQualityIssue = 'photo' | 'specifications' | 'price' | 'variants' | 'health' | 'warranty'
export type CatalogQualityRow = { id: number; slug: string; name: string; active: boolean; kind: string; issues: CatalogQualityIssue[]; editHref: string }
export type CatalogQualityPage = { rows: CatalogQualityRow[]; total: number; throughId: number; nextAfter: number | null; limit: number }

export const CATALOG_QUALITY_PAGE_SIZE = 50

/** A bounded ID-cursor scan; `throughId` fixes the upper edge for subsequent pages. */
export async function readCatalogQuality(afterId = 0, throughId?: number): Promise<CatalogQualityPage> {
  const upper: number = throughId !== undefined ? throughId : (await db.product.aggregate({ _max: { id: true } }))._max.id || 0
  const where = { id: { gt: afterId, lte: upper } }
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { id: 'asc' },
      take: CATALOG_QUALITY_PAGE_SIZE + 1,
      select: { id: true, slug: true, name: true, active: true, kind: true, image: true, gallery: true, warranty: true, healthReport: true, condition: true, priceMinor: true, specifications: true, category: { select: { attributeGroup: { select: { fields: true } } } }, variants: { where: { active: true }, select: { id: true } } },
    }),
    db.product.count({ where: { id: { lte: upper } } }),
  ])
  const hasMore = rows.length > CATALOG_QUALITY_PAGE_SIZE
  const pageRows = rows.slice(0, CATALOG_QUALITY_PAGE_SIZE)
  const qualityRows = pageRows.map(row => {
    const rawFields = parseJson<unknown>(row.category?.attributeGroup?.fields, [])
    const fields = (Array.isArray(rawFields) ? rawFields : []).filter((field): field is { key?: string; required?: boolean; variant?: boolean } => !!field && typeof field === 'object')
    const rawSpecs = parseJson<unknown>(row.specifications, {})
    const specs: Record<string, unknown> = rawSpecs && typeof rawSpecs === 'object' && !Array.isArray(rawSpecs) ? rawSpecs as Record<string, unknown> : {}
    const filledSpecs = fields.filter(field => !field.variant && field.key && String(specs[field.key] ?? '').trim())
    const requiredSpecsMissing = fields.some(field => !field.variant && field.required && field.key && !String(specs[field.key] ?? '').trim())
    const requiredVariantsMissing = fields.some(field => field.variant && field.required) && row.variants.length === 0
    const rawGallery = parseJson<unknown>(row.gallery, [])
    const gallery = Array.isArray(rawGallery) ? rawGallery.filter((image): image is string => typeof image === 'string') : []
    const needsConditionDisclosure = row.condition !== 'NEW'
    const issues: CatalogQualityIssue[] = [
      !row.image?.trim() && !gallery.some(image => image.trim()) ? 'photo' : null,
      requiredSpecsMissing || (fields.some(field => !field.variant) && !filledSpecs.length) ? 'specifications' : null,
      row.priceMinor <= 0n ? 'price' : null,
      requiredVariantsMissing ? 'variants' : null,
      needsConditionDisclosure && !row.healthReport.trim() ? 'health' : null,
      needsConditionDisclosure && !row.warranty.trim() ? 'warranty' : null,
    ].filter((issue): issue is CatalogQualityIssue => issue !== null)
    return { id: row.id, slug: row.slug, name: row.name, active: row.active, kind: row.kind, issues, editHref: `/admin/store/products/${row.id}` }
  })
  return { rows: qualityRows, total, throughId: upper, nextAfter: hasMore ? pageRows.at(-1)?.id ?? null : null, limit: CATALOG_QUALITY_PAGE_SIZE }
}
