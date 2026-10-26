import { db } from '@/platform/database/prisma'

/** Metrics do not edit an article. Atomic increments keep its revision clock
 * intact, including when a real edit or another visit races this write. */
export async function incrementPostViews(target: { id: number } | { slug: string }, count = 1) {
  if (!Number.isSafeInteger(count) || count <= 0) return 0
  if ('id' in target) {
    if (!Number.isSafeInteger(target.id) || target.id <= 0) return 0
    return db.$executeRaw`UPDATE "Post" SET "views" = "views" + ${count} WHERE "id" = ${target.id}`
  }
  if (!target.slug) return 0
  return db.$executeRaw`UPDATE "Post" SET "views" = "views" + ${count} WHERE "slug" = ${target.slug}`
}
