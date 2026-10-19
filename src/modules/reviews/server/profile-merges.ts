import type { Prisma } from '@prisma/client'

/** Preserve both subscriptions. A member's enabled notification on either profile survives deduplication. */
export async function mergeProfileFavorites(tx: Prisma.TransactionClient, itemType: 'artist' | 'person', sourceId: number, targetId: number) {
  const rows = await tx.itemFavorite.findMany({ where: { itemType, itemId: sourceId } })
  for (const row of rows) {
    const where = { userId_itemType_itemId: { userId: row.userId, itemType, itemId: targetId } }, existing = await tx.itemFavorite.findUnique({ where })
    await tx.itemFavorite.upsert({ where, create: { ...row, itemId: targetId }, update: { ...(row.notify ? { notify: true } : {}), ...(existing && row.createdAt < existing.createdAt ? { createdAt: row.createdAt } : {}) } })
  }
  await tx.itemFavorite.deleteMany({ where: { itemType, itemId: sourceId } })
  const favorites = await tx.itemFavorite.count({ where: { itemType, itemId: targetId } })
  await tx.itemStat.upsert({ where: { itemType_itemId: { itemType, itemId: targetId } }, create: { itemType, itemId: targetId, favorites }, update: { favorites } })
  await tx.itemStat.updateMany({ where: { itemType, itemId: sourceId }, data: { favorites: 0 } })
}
