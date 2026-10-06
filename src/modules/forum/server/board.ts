import { db } from '@/platform/database/prisma'
import type { Viewer } from '@/modules/forum/domain/community'
import { authorsFor, categoryFamily, fallbackAuthor, forumStats, visibleCategories, type AuthorView, type CategoryView } from '@/modules/forum/server/forum'

// The board index: the forum's front page. Sections (top-level categories) hold forums (their
// subcategories, or the section itself when it has none), and a forum may hold subforums. Every forum
// shows its size and its last post, counted over itself and its subforums. Beside them: what is new,
// who contributes most, who is here, and the totals.
//
// Everything is limited to the categories this viewer may see, so a private forum leaks neither a
// topic title in "last post" nor a name in "recent topics".

const ONLINE_MINUTES = 10
const CONTRIBUTOR_DAYS = 30

export type BoardLastPost = { topicId: number; title: string; at: Date; author: AuthorView }
export type BoardSubforum = { id: number; slug: string; title: string; color: string; icon: string; topics: number; quiet: boolean }
/** `topics` and `posts` count the forum together with its subforums; `last` is the newest post among them. */
export type BoardForum = CategoryView & { last: BoardLastPost | null; quiet: boolean; topics: number; posts: number; subforums: BoardSubforum[] }
export type BoardSection = { id: number; slug: string; title: string; description: string; color: string; icon: string; vip: boolean; own: boolean; forums: BoardForum[]; topics: number; posts: number }
export type BoardTopic = { id: number; title: string; replies: number; at: Date; author: AuthorView; forum: { slug: string; title: string; color: string } }
export type BoardContributor = { author: AuthorView; posts: number }

/** A forum is "quiet" when nothing was posted in it for a month: its icon is dimmed, as unread markers are elsewhere. */
export const isQuiet = (lastPostAt: Date | null, now: Date) => !lastPostAt || now.getTime() - lastPostAt.getTime() > 30 * 86_400_000

type LastThread = { id: number; title: string; lastPostAt: Date; lastPostUserId: number | null; userId: number }

/** One forum as the index shows it: sized and dated over itself and every subforum the viewer may see. */
function boardForum(category: CategoryView, categories: CategoryView[], lastOf: Map<number, LastThread>, author: (id: number) => AuthorView, now: Date): BoardForum {
  const byId = new Map(categories.map((row) => [row.id, row]))
  const family = categoryFamily(categories, category.id).map((id) => byId.get(id)!)
  const thread = family.map((row) => lastOf.get(row.id)).filter((row): row is LastThread => !!row).sort((a, b) => b.lastPostAt.getTime() - a.lastPostAt.getTime())[0]
  return {
    ...category, quiet: isQuiet(thread?.lastPostAt ?? null, now),
    topics: family.reduce((sum, row) => sum + row.threadCount, 0), posts: family.reduce((sum, row) => sum + row.postCount, 0),
    subforums: categories.filter((child) => child.parentId === category.id).map((child) => ({ id: child.id, slug: child.slug, title: child.title, color: child.color, icon: child.icon, topics: child.threadCount, quiet: isQuiet(lastOf.get(child.id)?.lastPostAt ?? null, now) })),
    last: thread ? { topicId: thread.id, title: thread.title, at: thread.lastPostAt, author: author(thread.lastPostUserId || thread.userId) } : null,
  }
}

/**
 * Who moderates a forum, as its page names them: those assigned to it and to what it sits under. Staff and
 * moderator groups moderate everywhere and are not listed here.
 */
export async function forumModerators(categoryIds: number[]): Promise<AuthorView[]> {
  if (!categoryIds.length) return []
  const rows = await db.forumCategoryModerator.findMany({ where: { categoryId: { in: categoryIds }, user: { status: 'ACTIVE' } }, orderBy: { createdAt: 'asc' }, select: { userId: true } }).catch(() => [])
  const ids = [...new Set(rows.map((row) => row.userId))]
  const authors = await authorsFor(ids)
  return ids.map((id) => authors.get(id)).filter((author): author is AuthorView => !!author)
}

/** The forums directly under a category, as rows of the index: what a forum page lists above its topics. */
export async function subforumRows(viewer: Viewer, parentId: number, now = new Date()): Promise<BoardForum[]> {
  const categories = await visibleCategories(viewer)
  const children = categories.filter((category) => category.parentId === parentId)
  if (!children.length) return []
  const ids = [...new Set(children.flatMap((child) => categoryFamily(categories, child.id)))]
  const found = await Promise.all(ids.map((categoryId) => db.forumThread.findFirst({ where: { status: 'VISIBLE', listed: true, categoryId }, orderBy: { lastPostAt: 'desc' }, select: { id: true, title: true, lastPostAt: true, lastPostUserId: true, userId: true, categoryId: true } }).catch(() => null)))
  const lastOf = new Map<number, LastThread>()
  for (const thread of found) if (thread) lastOf.set(thread.categoryId, thread)
  const authors = await authorsFor([...lastOf.values()].map((thread) => thread.lastPostUserId || thread.userId))
  return children.map((child) => boardForum(child, categories, lastOf, (id) => authors.get(id) || fallbackAuthor(id), now))
}

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
  const byId = new Map(categories.map((category) => [category.id, category]))
  const forum = (category: CategoryView) => boardForum(category, categories, lastOf, author, now)
  // A top-level category with subcategories is a section of its own. Those without any are forums
  // themselves and share the first section, instead of each sitting alone under a heading that repeats its name.
  const tops = categories.filter((category) => !category.parentId || !visible.has(category.parentId))
  const childrenOf = (top: CategoryView) => categories.filter((child) => child.parentId === top.id)
  const standalone = tops.filter((top) => !childrenOf(top).length)
  const sized = (section: Omit<BoardSection, 'topics' | 'posts'>, own = 0, ownPosts = 0): BoardSection => ({ ...section, topics: own + section.forums.reduce((sum, row) => sum + row.topics, 0), posts: ownPosts + section.forums.reduce((sum, row) => sum + row.posts, 0) })
  const sections: BoardSection[] = [
    // A forum standing alone has no subforums to list: nothing sits under it, or it would be a section.
    ...tops.filter((top) => childrenOf(top).length).map((top) => sized({ id: top.id, slug: top.slug, title: top.title, description: top.description, color: top.color, icon: top.icon, vip: top.vip, own: false, forums: childrenOf(top).map(forum) }, top.threadCount, top.postCount)),
    ...(standalone.length ? [sized({ id: 0, slug: '', title: 'انجمن‌های دیگر', description: '', color: '', icon: '', vip: false, own: true, forums: standalone.map(forum) })] : []),
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
