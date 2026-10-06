import { db } from '@/platform/database/prisma'
import type { Viewer } from '@/modules/forum/domain/community'
import { authorsFor, fallbackAuthor, forumStats, visibleCategories, type AuthorView, type CategoryView } from '@/modules/forum/server/forum'

// The board index: the forum's front page. Sections (top-level categories) hold forums (their
// subcategories, or the section itself when it has none); every forum shows its size and its last
// post. Beside them: what is new, who contributes most, who is here, and the totals.
//
// Everything is limited to the categories this viewer may see, so a private forum leaks neither a
// topic title in "last post" nor a name in "recent topics".

const ONLINE_MINUTES = 10
const CONTRIBUTOR_DAYS = 30

export type BoardLastPost = { topicId: number; title: string; at: Date; author: AuthorView }
export type BoardForum = CategoryView & { last: BoardLastPost | null; quiet: boolean }
export type BoardSection = { id: number; slug: string; title: string; description: string; color: string; icon: string; vip: boolean; own: boolean; forums: BoardForum[] }
export type BoardTopic = { id: number; title: string; replies: number; at: Date; author: AuthorView; forum: { slug: string; title: string; color: string } }
export type BoardContributor = { author: AuthorView; posts: number }

/** A forum is "quiet" when nothing was posted in it for a month: its icon is dimmed, as unread markers are elsewhere. */
export const isQuiet = (lastPostAt: Date | null, now: Date) => !lastPostAt || now.getTime() - lastPostAt.getTime() > 30 * 86_400_000

export async function boardIndex(viewer: Viewer, now = new Date()) {
  const categories = await visibleCategories(viewer)
  const ids = categories.map((category) => category.id)
  const visible = new Set(ids)
  const scope = { status: 'VISIBLE', listed: true, categoryId: { in: ids } }
  const [threads, contributorRows, onlineRows, stats, newest] = ids.length ? await Promise.all([
    // Newest activity first; the first topic met for a category is that forum's last post.
    db.forumThread.findMany({ where: scope, orderBy: { lastPostAt: 'desc' }, take: 240, select: { id: true, title: true, lastPostAt: true, lastPostUserId: true, userId: true, categoryId: true, replyCount: true } }),
    db.forumPost.groupBy({ by: ['userId'], where: { status: 'VISIBLE', createdAt: { gte: new Date(now.getTime() - CONTRIBUTOR_DAYS * 86_400_000) }, thread: { is: scope } }, _count: { _all: true }, orderBy: { _count: { userId: 'desc' } }, take: 5 }),
    db.forumProfile.findMany({ where: { lastSeenAt: { gt: new Date(now.getTime() - ONLINE_MINUTES * 60_000) } }, orderBy: { lastSeenAt: 'desc' }, take: 24, select: { userId: true } }),
    forumStats(),
    db.forumProfile.findFirst({ where: { user: { status: 'ACTIVE' } }, orderBy: { createdAt: 'desc' }, select: { userId: true } }),
  ]).catch(() => [[], [], [], { threads: 0, posts: 0, members: 0, online: 0 }, null] as const) : [[], [], [], { threads: 0, posts: 0, members: 0, online: 0 }, null] as const

  const lastOf = new Map<number, (typeof threads)[number]>()
  for (const thread of threads) if (!lastOf.has(thread.categoryId)) lastOf.set(thread.categoryId, thread)
  const recent = threads.slice(0, 6)
  const authors = await authorsFor([
    ...[...lastOf.values()].map((thread) => thread.lastPostUserId || thread.userId),
    ...recent.map((thread) => thread.lastPostUserId || thread.userId),
    ...contributorRows.map((row) => row.userId), ...onlineRows.map((row) => row.userId), ...(newest ? [newest.userId] : []),
  ])
  const author = (id: number) => authors.get(id) || fallbackAuthor(id)
  const forum = (category: CategoryView): BoardForum => {
    const thread = lastOf.get(category.id)
    return { ...category, quiet: isQuiet(thread?.lastPostAt ?? null, now), last: thread ? { topicId: thread.id, title: thread.title, at: thread.lastPostAt, author: author(thread.lastPostUserId || thread.userId) } : null }
  }
  const byId = new Map(categories.map((category) => [category.id, category]))
  // A top-level category with subcategories is a section of its own. Those without any are forums
  // themselves and share the first section, instead of each sitting alone under a heading that repeats its name.
  const tops = categories.filter((category) => !category.parentId || !visible.has(category.parentId))
  const childrenOf = (top: CategoryView) => categories.filter((child) => child.parentId === top.id)
  const standalone = tops.filter((top) => !childrenOf(top).length)
  const sections: BoardSection[] = [
    ...(standalone.length ? [{ id: 0, slug: '', title: 'انجمن‌ها', description: '', color: '', icon: '', vip: false, own: true, forums: standalone.map(forum) }] : []),
    ...tops.filter((top) => childrenOf(top).length).map((top) => ({ id: top.id, slug: top.slug, title: top.title, description: top.description, color: top.color, icon: top.icon, vip: top.vip, own: false, forums: childrenOf(top).map(forum) })),
  ]
  const topics: BoardTopic[] = recent.map((thread) => {
    const category = byId.get(thread.categoryId)!
    return { id: thread.id, title: thread.title, replies: thread.replyCount, at: thread.lastPostAt, author: author(thread.lastPostUserId || thread.userId), forum: { slug: category.slug, title: category.title, color: category.color } }
  })
  return {
    sections, topics, stats,
    contributors: contributorRows.map((row): BoardContributor => ({ author: author(row.userId), posts: row._count._all })),
    // Who is here is shown to members; a visitor gets the number only.
    online: viewer.userId ? onlineRows.map((row) => author(row.userId)) : [],
    newest: newest ? author(newest.userId) : null,
    days: CONTRIBUTOR_DAYS,
  }
}
