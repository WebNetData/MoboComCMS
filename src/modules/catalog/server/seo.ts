import { db } from '@/platform/database/prisma'

/** A shop category's name for its listing's title and description; null when no category has this address. */
export async function productCategoryName(slug: string): Promise<string | null> {
  if (!slug || slug.length > 200) return null
  return (await db.productCategory.findUnique({ where: { slug }, select: { name: true } }))?.name ?? null
}
