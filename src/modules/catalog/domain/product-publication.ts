/** A product is public only after both activation and seller approval. */
export const publicProductWhere = { active: true, approval: 'APPROVED' as const }
export const isPublicProduct = (product: { active: boolean; approval: string }) => product.active && product.approval === 'APPROVED'
