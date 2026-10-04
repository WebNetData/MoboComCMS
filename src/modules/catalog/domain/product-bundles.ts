export type ProductBundleComponentInput = { productId: number; variantId: number | null; quantity: number }
export type ProductBundleInput = { id?: number; name: string; nameEn: string; active: boolean; components: ProductBundleComponentInput[] }

/** Strict bounded fixed selections; prices are always owned by Store pricing. */
export function parseProductBundles(value: unknown, sourceId: number): ProductBundleInput[] {
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !Array.isArray(value) || value.length > 8) throw Error('Invalid product bundles')
  const ids = new Set<number>()
  return value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.name !== 'string' || typeof row.active !== 'boolean' || !Array.isArray(row.components) || row.components.length < 2 || row.components.length > 12) throw Error('Invalid product bundle')
    const name = row.name.trim(), nameEn = typeof row.nameEn === 'string' ? row.nameEn.trim() : ''
    if (!name || name.length > 120 || nameEn.length > 120 || /[<>\u0000-\u001f]/.test(name + nameEn)) throw Error('Invalid bundle name')
    if (row.id !== undefined) {
      if (!Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id)) throw Error('Invalid bundle identity')
      ids.add(row.id)
    }
    const refs = new Set<string>()
    const components = row.components.map((component: any): ProductBundleComponentInput => {
      if (!component || !Number.isSafeInteger(component.productId) || component.productId <= 0 || !Number.isSafeInteger(component.quantity) || component.quantity < 1 || component.quantity > 30) throw Error('Invalid bundle component')
      const variantId = component.variantId === undefined || component.variantId === null ? null : component.variantId
      if (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) throw Error('Invalid bundle variant')
      const key = `${component.productId}:${variantId || 0}`
      if (refs.has(key)) throw Error('Duplicate bundle component')
      refs.add(key)
      return { productId: component.productId, variantId, quantity: component.quantity }
    })
    if (!components.some((component: ProductBundleComponentInput) => component.productId === sourceId)) throw Error('Bundle must include its source product')
    return { ...(row.id === undefined ? {} : { id: row.id }), name, nameEn, active: row.active, components }
  })
}
