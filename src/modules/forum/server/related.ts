import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import type { ItemRef } from '@/modules/content/domain/items'
import { itemCard } from '@/modules/content/server/registry'
import { GUEST } from '@/modules/forum/domain/community'
import { visibleCategories } from '@/modules/forum/server/forum'

export const ENTITY_TOPIC_TYPES = ['game', 'software', 'studio'] as const
export type EntityTopicType = typeof ENTITY_TOPIC_TYPES[number]
export type EntityTopicKind = 'QUESTION' | 'DISCUSSION'

/** Product hubs may only surface topics visible to an anonymous visitor. */
export async function publicEntityCategoryIds() {
  const everyone = await db.forumGroup.findUnique({ where: { automatic: 'everyone' }, select: { id: true } })
  const categories = await visibleCategories({ ...GUEST, groupIds: everyone ? [everyone.id] : [] })
  return categories.map((category) => category.id)
}

export async function entityTopics(ref: ItemRef, kind: EntityTopicKind, page = 1, size = 6) {
  if (!ENTITY_TOPIC_TYPES.includes(ref.type as EntityTopicType) || !Number.isSafeInteger(ref.id) || ref.id < 1 || !await isModuleEnabled('forum')) return null
  const item = await itemCard(ref)
  if (!item) return null
  const categories = await publicEntityCategoryIds()
  const safeSize = Math.max(1, Math.min(20, size))
  const safePage = Math.max(1, Math.min(500, Math.trunc(page) || 1))
  const where = { itemType: ref.type, itemId: ref.id, kind, status: 'VISIBLE', listed: true, categoryId: { in: categories } }
  const total = await db.forumThread.count({ where })
  const pages = Math.max(1, Math.ceil(total / safeSize))
  const current = Math.min(safePage, pages)
  const topics = await db.forumThread.findMany({ where, orderBy: [{ lastPostAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * safeSize, take: safeSize, select: { id: true, title: true, replyCount: true, solvedPostId: true, lastPostAt: true } })
  return { item, topics, total, page: current, pages }
}
