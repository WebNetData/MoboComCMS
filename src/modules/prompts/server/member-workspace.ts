import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { favoritePreview } from '@/modules/reviews/server/reviews'

/** Current-member projection only. Private outputs stay in the history owner's authenticated API. */
export async function memberPromptWorkspace(userId: number) {
  if (!await isModuleEnabled('prompt-master')) return null
  const favoritesTask = isModuleEnabled('reviews').then(on => on ? favoritePreview(userId, 6, 'prompt') : null)
  const [total, pinned, recent, favorites] = await Promise.all([
    db.promptGeneration.count({ where: { userId } }),
    db.promptGeneration.count({ where: { userId, pinned: true } }),
    db.promptGeneration.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 4, select: { id: true, title: true, kind: true, pinned: true, createdAt: true } }),
    favoritesTask,
  ])
  return { total, pinned, recent: recent.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), favorites }
}

export type MemberPromptWorkspace = NonNullable<Awaited<ReturnType<typeof memberPromptWorkspace>>>
