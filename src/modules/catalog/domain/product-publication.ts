/** A product is public only after both activation and seller approval. */
export const publishedProductWhere = { active: true, approval: 'APPROVED' as const }
/** Open to everyone. A product limited to groups is left out of every list that uses this. */
export const publicProductWhere = { ...publishedProductWhere, audienceGroups: '' }
export const isPublishedProduct = (product: { active: boolean; approval: string }) => product.active && product.approval === 'APPROVED'
export const isPublicProduct = (product: { active: boolean; approval: string; audienceGroups: string }) => isPublishedProduct(product) && !product.audienceGroups
