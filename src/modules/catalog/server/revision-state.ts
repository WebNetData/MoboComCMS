import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { restoreValues, type Snapshot } from '@/modules/content/domain/revisions'
import { RevisionError } from '@/modules/content/server/revisions'
import { replaceProductRelationships } from '@/modules/catalog/server/product-relationships'
import { parseProductRelationships } from '@/modules/catalog/domain/product-relationships'
import { productInput } from '@/modules/catalog/server/product-input'

// Catalogue content only. Restoring a description must never rewind stock, money, orders or seller ownership.
const FIELDS = ['id', 'updatedAt', 'slug', 'name', 'nameEn', 'description', 'shortDescription', 'image', 'gallery', 'categoryId', 'brandId', 'warranty', 'faqs', 'specifications', 'seoTitle', 'seoDescription', 'weightGrams', 'featured', 'active'] as const
export async function productRevisionState(id: number, tx: Prisma.TransactionClient = db): Promise<Record<string, unknown> | null> {
  const row = await tx.product.findUnique({ where: { id } })
  if (!row) return null
  const relationships = await tx.productRelationship.findMany({ where: { productId: id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { kind: true, targetId: true } })
  return { ...Object.fromEntries(FIELDS.map(key => [key, row[key]])), __relations: JSON.stringify({ version: 1, relationships }) }
}

export async function restoreProductRevision(id: number, snapshot: Snapshot) {
  return db.$transaction(async tx => {
    const before = await productRevisionState(id, tx)
    if (!before) throw new RevisionError('محصول پیدا نشد', 404)
    const data = restoreValues(snapshot, before), raw = data.__relations
    delete data.__relations
    const claimed = await tx.product.updateMany({ where: { id, updatedAt: before.updatedAt as Date }, data: { updatedAt: new Date() } })
    if (!claimed.count) throw new RevisionError('محصول هم‌زمان تغییر کرده است', 409)
    if (raw !== undefined) {
      const relations = JSON.parse(String(raw))
      if (relations.version !== 1) throw new RevisionError('نسخهٔ روابط محصول معتبر نیست', 422)
      await replaceProductRelationships(tx, id, parseProductRelationships(relations.relationships, id))
    }
    const current = await tx.product.findUniqueOrThrow({ where: { id } }), validated = await productInput(data, current)
    const allowed = new Set<string>(FIELDS.filter(key => key !== 'id' && key !== 'updatedAt'))
    await tx.product.update({ where: { id }, data: Object.fromEntries(Object.entries(validated.data).filter(([key]) => allowed.has(key))) })
    return { before, after: (await productRevisionState(id, tx))! }
  })
}
