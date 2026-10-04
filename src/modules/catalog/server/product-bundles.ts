import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'
import type { ProductBundleInput } from '@/modules/catalog/domain/product-bundles'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'

/** Called only inside the existing product authoring transaction/lock. */
export async function replaceProductBundles(tx: Prisma.TransactionClient, productId: number, definitions: ProductBundleInput[]) {
  const existing = await tx.productBundle.findMany({ where: { productId }, include: { components: true } })
  const owned = new Map(existing.map(bundle => [bundle.id, bundle]))
  if (definitions.some(bundle => bundle.id !== undefined && !owned.has(bundle.id))) throw Error('Bundle does not belong to this product')
  const known = new Set(existing.flatMap(bundle => bundle.components.map(component => `${bundle.id}:${component.productId}:${component.variantKey}`)))
  const fresh = definitions.flatMap(bundle => bundle.components.filter(component => !known.has(`${bundle.id}:${component.productId}:${component.variantId || 0}`)))
  if (fresh.length) {
    if (!await isStoreEnabled()) throw Error('Store is unavailable')
    const ids = [...new Set(fresh.map(component => component.productId))]
    const products = await tx.product.findMany({ where: { id: { in: ids } }, include: { variants: { where: { active: true }, select: { id: true } } } })
    const byId = new Map(products.map(product => [product.id, product]))
    for (const component of fresh) {
      const product = byId.get(component.productId)
      // Editors may compose their own unpublished anchor without exposing it.
      if (!product || (product.id !== productId && !isPublicProduct(product))) throw Error('Bundle public product not found')
      if (component.variantId ? !product.variants.some(variant => variant.id === component.variantId) : product.variants.length > 0) throw Error('Select an active bundle product variant')
    }
  }
  const kept = definitions.flatMap(bundle => bundle.id === undefined ? [] : [bundle.id])
  await tx.productBundle.deleteMany({ where: { productId, id: { notIn: kept } } })
  for (const [position, definition] of definitions.entries()) {
    const data = { name: definition.name, nameEn: definition.nameEn, active: definition.active, position }
    const bundle = definition.id === undefined
      ? await tx.productBundle.create({ data: { ...data, productId } })
      : await tx.productBundle.update({ where: { id: definition.id }, data })
    await tx.productBundleComponent.deleteMany({ where: { bundleId: bundle.id } })
    await tx.productBundleComponent.createMany({ data: definition.components.map((component, position) => ({ bundleId: bundle.id, productId: component.productId, variantKey: component.variantId || 0, quantity: component.quantity, position })) })
  }
}

const bundleInclude = {
  product: { select: { id: true, active: true, approval: true } },
  components: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }], include: { product: { include: { variants: true } } } },
}

/** Internal definitions; Store owns rollout, membership, pricing and public DTOs. */
export function productBundleDefinition(id: number) {
  return db.productBundle.findUnique({ where: { id }, include: bundleInclude })
}
export function productBundleDefinitions(productId: number) {
  return db.productBundle.findMany({ where: { productId, active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 8, include: bundleInclude })
}
