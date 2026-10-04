export const PRODUCT_RELATIONSHIP_KINDS = ['RELATED', 'COMPLEMENTARY', 'COMPATIBLE'] as const
export type ProductRelationshipKind = typeof PRODUCT_RELATIONSHIP_KINDS[number]
export type ProductRelationshipInput = { kind: ProductRelationshipKind; targetId: number }
export function isProductRelationshipKind(value: unknown): value is ProductRelationshipKind {
  return PRODUCT_RELATIONSHIP_KINDS.includes(value as ProductRelationshipKind)
}
export function parseProductRelationships(value: unknown, sourceId?: number): ProductRelationshipInput[] {
  if (!Array.isArray(value) || value.length > 36) throw Error('Invalid product relationships')
  const seen = new Set<string>(), counts = new Map<string, number>()
  return value.map(row => {
    if (!row || typeof row !== 'object' || !isProductRelationshipKind(row.kind) || !Number.isSafeInteger(row.targetId) || row.targetId <= 0 || row.targetId === sourceId) throw Error('Invalid product relationships')
    const key = `${row.kind}:${row.targetId}`, count = (counts.get(row.kind) || 0) + 1
    if (seen.has(key) || count > 12) throw Error('Invalid product relationships')
    seen.add(key); counts.set(row.kind, count)
    return { kind: row.kind, targetId: row.targetId }
  })
}
