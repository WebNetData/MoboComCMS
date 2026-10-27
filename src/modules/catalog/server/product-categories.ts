import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export class ProductCategoryError extends Error { status = 400 }

/**
 * The further categories a product is listed under (WordPress-like ticks beside its main one). Each must exist and be
 * in the product's half of the shop (or in none); the main category is not repeated; at most twenty.
 */
export async function validateExtraCategories(tx: Tx, input: unknown, main: number | null, kind: string): Promise<number[]> {
  if (!Array.isArray(input)) throw new ProductCategoryError('فهرست دسته‌ها نامعتبر است')
  const ids = [...new Set(input.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0))].filter((id) => id !== main)
  if (ids.length > 20) throw new ProductCategoryError('حداکثر ۲۰ دستهٔ دیگر برای یک محصول')
  if (!ids.length) return []
  const rows = await tx.productCategory.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true, name: true } })
  if (rows.length !== ids.length) throw new ProductCategoryError('یک یا چند دسته‌بندی دیگر وجود ندارند؛ فهرست را تازه‌سازی کنید')
  const outside = rows.find((row) => row.kind && kind && row.kind !== kind)
  if (outside) throw new ProductCategoryError(`دستهٔ «${outside.name}» در بخش دیگر فروشگاه است`)
  return ids
}

/** Writes exactly these further categories for the product. */
export async function replaceExtraCategories(tx: Tx, productId: number, ids: number[]) {
  await tx.productCategoryAssignment.deleteMany({ where: { productId, ...(ids.length ? { categoryId: { notIn: ids } } : {}) } })
  if (ids.length) await tx.productCategoryAssignment.createMany({ data: ids.map((categoryId) => ({ productId, categoryId })), skipDuplicates: true })
}

/** Products listed under any of these categories, as main or further category. */
export const inCategories = (ids: number[]): Prisma.ProductWhereInput => ({ OR: [{ categoryId: { in: ids } }, { extraCategories: { some: { categoryId: { in: ids } } } }] })
