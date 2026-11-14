import { db } from '@/platform/database/prisma'
import { recordRevision, type RestoreCommit } from '@/modules/content/server/revisions'
import { contentChanged } from '@/modules/content/server/events'
import { productInput, saveVariants } from './product-input'
import { parseProductRelationships } from '../domain/product-relationships'
import { replaceProductRelationships } from './product-relationships'
import { replaceExtraCategories, validateExtraCategories } from './product-categories'
import { capturePublicProductPrices } from './price-history'
import { productRevisionState } from './revision-state'
import { adoptEditorStock } from './locations'
import { replaceDeviceCompatibility } from './device-compatibility'
import { assertCanonicalSourceSlugAvailable } from '@/modules/content/server/canonical-alias'
import { catalogPublicationIssuesById } from './quality'

/** Validate an inactive draft before a browser-driven producer spends account usage. */
export async function validateCatalogDraft(body: Record<string, unknown>) { await productInput(body) }

/** One creation path, including variants/categories/prices/history and atomic caller receipt. */
export async function createCatalogProduct(body: Record<string, unknown>, actor: { id: number; email: string }, commit?: RestoreCommit) {
  const input = await productInput(body), relationships = body.relationships === undefined ? null : parseProductRelationships(body.relationships)
  if (body.bundles !== undefined && (!Array.isArray(body.bundles) || body.bundles.length)) throw Error('Save the product before composing bundles')
  const row = await db.$transaction(async tx => {
    if (typeof body.slug === 'string') await assertCanonicalSourceSlugAvailable('product', body.slug, 0, tx)
    const created = await tx.product.create({ data: input.data as any })
    if (body.categoryIds !== undefined) await replaceExtraCategories(tx, created.id, await validateExtraCategories(tx, body.categoryIds, created.categoryId, created.kind))
    if (input.variants) await saveVariants(tx, created.id, input.variants)
    await adoptEditorStock(tx, created.id, actor.id)
    if (relationships) await replaceProductRelationships(tx, created.id, relationships)
    if (body.deviceCompatibility !== undefined) await replaceDeviceCompatibility(tx, created.id, body.deviceCompatibility)
    if (created.active) {
      const issues = await catalogPublicationIssuesById(tx, created.id)
      if (issues.length) throw new Error(`پیش از انتشار کالا این موارد را تکمیل کنید: ${issues.join('، ')}`)
    }
    await capturePublicProductPrices(tx, created.id, new Map())
    const after = (await productRevisionState(created.id, tx))!
    await recordRevision({ entityType: 'products', entityId: created.id, before: null, after, actor, client: tx, strict: true })
    await commit?.(tx, {}, after)
    return created
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
  contentChanged({ type: 'product', id: row.id }, null, row)
  return row
}
