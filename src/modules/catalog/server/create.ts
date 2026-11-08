import { db } from '@/platform/database/prisma'
import { recordRevision, type RestoreCommit } from '@/modules/content/server/revisions'
import { contentChanged } from '@/modules/content/server/events'
import { productInput, saveVariants } from './product-input'
import { parseProductRelationships } from '../domain/product-relationships'
import { replaceProductRelationships } from './product-relationships'
import { replaceExtraCategories, validateExtraCategories } from './product-categories'
import { capturePublicProductPrices } from './price-history'
import { productRevisionState } from './revision-state'

/** Validate an inactive draft before a browser-driven producer spends account usage. */
export async function validateCatalogDraft(body: Record<string, unknown>) { await productInput(body) }

/** One creation path, including variants/categories/prices/history and atomic caller receipt. */
export async function createCatalogProduct(body: Record<string, unknown>, actor: { id: number; email: string }, commit?: RestoreCommit) {
  const input = await productInput(body), relationships = body.relationships === undefined ? null : parseProductRelationships(body.relationships)
  if (body.bundles !== undefined && (!Array.isArray(body.bundles) || body.bundles.length)) throw Error('Save the product before composing bundles')
  const row = await db.$transaction(async tx => {
    const created = await tx.product.create({ data: input.data as any })
    if (body.categoryIds !== undefined) await replaceExtraCategories(tx, created.id, await validateExtraCategories(tx, body.categoryIds, created.categoryId, created.kind))
    if (input.variants) await saveVariants(tx, created.id, input.variants)
    if (relationships) await replaceProductRelationships(tx, created.id, relationships)
    await capturePublicProductPrices(tx, created.id, new Map())
    const after = (await productRevisionState(created.id, tx))!
    await recordRevision({ entityType: 'products', entityId: created.id, before: null, after, actor, client: tx, strict: true })
    await commit?.(tx, {}, after)
    return created
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
  contentChanged({ type: 'product', id: row.id }, null, row)
  return row
}
