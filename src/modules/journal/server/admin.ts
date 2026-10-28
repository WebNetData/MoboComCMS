import { db } from '@/platform/database/prisma'
import { plainText } from '@/shared/text/plain'
import { readJsonSetting, createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import type { Prisma } from '@prisma/client'
import { categoryDescendants } from '@/modules/site/domain/categories'
import { categoryMembership } from '@/modules/site/server/categories'
import { ADMIN_POST_STATES, adminPostStateWhere, type AdminPostFilters, JOURNAL_HEALTH, livePostWhere, normalizeJournalSettings, postIssues, type JournalHealth, type JournalSettings } from '@/modules/journal/domain/journal'

// Journal admin: Liona home settings, editorial dashboard and pickers.

const SETTINGS_KEY = 'journal.home.v1'
const settingsHistory = () => createSectionSettingsHistory(SETTINGS_KEY, 'settings-journal', normalizeJournalSettings, settings => ({ rails: settings.rails.filter(rail => rail.enabled).length }))
export const journalSettingsState = () => settingsHistory().current()
export const restoreJournalSettings = (...args: Parameters<ReturnType<typeof settingsHistory>['restore']>) => settingsHistory().restore(...args)
const DAY = 86_400_000
const DASHBOARD_PAGE = 500
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

/** The list's narrowing as query conditions: a category also matches its sub-categories and secondary placements. */
export async function adminPostFilterWhere(filters: AdminPostFilters, now = new Date()): Promise<Prisma.PostWhereInput[]> {
  const where: Prisma.PostWhereInput[] = []
  if (filters.state) where.push(adminPostStateWhere(filters.state, now))
  if (filters.category) where.push(categoryMembership(categoryDescendants(await db.postCategory.findMany({ select: { id: true, parentId: true, name: true } }), filters.category)))
  if (filters.featured !== undefined) where.push({ featured: filters.featured })
  if (filters.access) where.push({ access: filters.access })
  return where
}

/** How many of the caller's articles stand in each state, for the list's state filter. */
export async function adminPostStateCounts(own: Prisma.PostWhereInput | null, now = new Date()) {
  const counts = await Promise.all(ADMIN_POST_STATES.map((state) => db.post.count({ where: { ...adminPostStateWhere(state, now), ...(own || {}) } })))
  return Object.fromEntries(ADMIN_POST_STATES.map((state, index) => [state, counts[index]]))
}

export async function getJournalSettings(fresh = false): Promise<JournalSettings> {
  return fresh ? settingsHistory().read() : normalizeJournalSettings(await readJsonSetting(SETTINGS_KEY))
}

/** The newest live article, to look at the page styles on (empty when the magazine has none). */
export async function latestLivePostSlug(): Promise<string> {
  const post = await db.post.findFirst({ where: livePostWhere(), orderBy: { publishedAt: 'desc' }, select: { slug: true } }).catch(() => null)
  return post?.slug || ''
}

export async function saveJournalSettings(input: unknown, context?: SectionSettingsContext): Promise<JournalSettings> {
  return settingsHistory().save(input, context)
}

export async function journalDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [categories, pending, pendingRecent, drafts, scheduled, scheduledPosts, reviewWaiting, proposals] = await Promise.all([
    db.postCategory.findMany({ select: { id: true, name: true } }),
    db.postComment.count({ where: { status: 'PENDING' } }),
    db.postComment.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, body: true, createdAt: true, user: { select: { name: true } }, post: { select: { title: true } } } }),
    db.post.count({ where: { status: 'DRAFT' } }),
    db.post.count({ where: { status: 'PUBLISHED', publishedAt: { gt: now } } }),
    db.post.findMany({ where: { status: 'PUBLISHED', publishedAt: { gt: now } }, orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }], take: 6, select: { id: true, title: true, cover: true, publishedAt: true } }),
    db.post.count({ where: { status: 'PENDING' } }),
    db.postEditProposal.count(),
  ])
  const health = Object.fromEntries(Object.keys(JOURNAL_HEALTH).map((key) => [key, 0])) as Record<JournalHealth, number>
  const worst: { id: number; title: string; cover: string; issues: JournalHealth[] }[] = []
  const topViewed: { id: number; slug: string; title: string; cover: string; views: number; comments: number }[] = []
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const commentDays = new Map(days.map((day) => [day, 0]))
  const postDays = new Map(days.map((day) => [day, 0]))
  const byCategory = new Map<number, number>()
  const catName = new Map(categories.map((category) => [category.id, category.name]))
  const authors = new Map<string, { posts: number; views: number }>()
  let published = 0
  let views = 0
  let posts30 = 0
  let vip = 0
  let featured = 0
  let postCursor = 0
  while (true) {
    const rows = await db.post.findMany({
      where: { ...livePostWhere(now), id: { gt: postCursor } }, orderBy: { id: 'asc' }, take: DASHBOARD_PAGE,
      select: { id: true, slug: true, title: true, cover: true, excerpt: true, content: true, publishedAt: true, views: true, access: true, featured: true, categoryId: true, author: { select: { name: true } }, _count: { select: { categories: true, comments: true } } },
    })
    if (!rows.length) break
    for (const post of rows) {
      published++
      views += post.views
      if (post.publishedAt >= since) posts30++
      if (post.access === 'MEMBERS') vip++
      if (post.featured) featured++
      const issues = postIssues({ ...post, categories: post._count.categories + (post.categoryId ? 1 : 0) })
      for (const issue of issues) health[issue]++
      if (issues.length) worst.push({ id: post.id, title: post.title, cover: post.cover, issues })
      topViewed.push({ id: post.id, slug: post.slug, title: post.title, cover: post.cover, views: post.views, comments: post._count.comments })
      const day = tehranDay(post.publishedAt)
      if (postDays.has(day)) postDays.set(day, postDays.get(day)! + 1)
      if (post.categoryId) byCategory.set(post.categoryId, (byCategory.get(post.categoryId) || 0) + 1)
      const name = post.author?.name || 'بدون نویسنده'
      const author = authors.get(name) || { posts: 0, views: 0 }
      author.posts++
      author.views += post.views
      authors.set(name, author)
    }
    worst.sort((a, b) => b.issues.length - a.issues.length)
    worst.length = Math.min(worst.length, 8)
    topViewed.sort((a, b) => b.views - a.views)
    topViewed.length = Math.min(topViewed.length, 8)
    if (rows.length < DASHBOARD_PAGE) break
    postCursor = rows[rows.length - 1].id
  }
  let comments30 = 0
  let commentCursor = 0
  while (true) {
    const rows = await db.postComment.findMany({ where: { createdAt: { gte: since }, id: { gt: commentCursor } }, orderBy: { id: 'asc' }, take: DASHBOARD_PAGE, select: { id: true, createdAt: true } })
    if (!rows.length) break
    for (const row of rows) {
      comments30++
      const day = tehranDay(row.createdAt)
      if (commentDays.has(day)) commentDays.set(day, commentDays.get(day)! + 1)
    }
    if (rows.length < DASHBOARD_PAGE) break
    commentCursor = rows[rows.length - 1].id
  }
  return {
    kpis: {
      published, drafts, scheduled, views, posts30, reviewWaiting, proposals,
      pendingComments: pending, comments30, vip, featured, categories: categories.length,
    },
    series: days.map((day) => ({ day, comments: commentDays.get(day)!, posts: postDays.get(day)! })),
    health: Object.entries(health).map(([key, count]) => ({ key, label: JOURNAL_HEALTH[key as JournalHealth], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst,
    topViewed,
    scheduledList: scheduledPosts.map((post) => ({ id: post.id, title: post.title, cover: post.cover, at: post.publishedAt.toISOString() })),
    pending: pendingRecent.map((comment) => ({ id: comment.id, body: comment.body.slice(0, 140), author: comment.user.name || 'کاربر', post: comment.post.title, createdAt: comment.createdAt.toISOString() })),
    categories: [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ name: catName.get(id) || `#${id}`, count })),
    authors: [...authors].sort((a, b) => b[1].posts - a[1].posts).slice(0, 6).map(([name, row]) => ({ name, ...row })),
  }
}

export async function journalPickers(selectedIds: readonly number[] = []) {
  const selected = [...new Set(selectedIds.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 9)
  const [posts, selectedPosts, categories] = await Promise.all([
    db.post.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 800, select: { id: true, title: true, cover: true, publishedAt: true } }),
    db.post.findMany({ where: { status: 'PUBLISHED', id: { in: selected } }, select: { id: true, title: true, cover: true } }),
    db.postCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
  ])
  const byId = new Map([...posts, ...selectedPosts].map((post) => [post.id, { id: post.id, title: post.title, cover: post.cover }]))
  return { posts: [...byId.values()], categories: categories.filter((category) => !category.parentId).map((category) => ({ id: category.id, title: category.name, cover: '' })) }
}

export async function searchJournalPicker(input: unknown) {
  const query = String(input ?? '').trim().slice(0, 100)
  if (query.length < 2) return []
  const posts = await db.post.findMany({
    where: { status: 'PUBLISHED', OR: [{ title: { contains: query } }, { titleEn: { contains: query } }, { slug: { contains: query } }] },
    orderBy: { publishedAt: 'desc' }, take: 25, select: { id: true, title: true, cover: true },
  })
  return posts.map((post) => ({ id: post.id, title: post.title, cover: post.cover }))
}

/** For the staff moderation overview: articles an author asked to delete, waiting in the trash for a manager, oldest request first. */
export async function waitingInTrash(take = 5) {
  const where = { status: 'TRASHED' }
  const [count, rows] = await Promise.all([
    db.post.count({ where }),
    db.post.findMany({ where, orderBy: { trashedAt: 'asc' }, take, select: { id: true, title: true, excerpt: true, trashedAt: true, updatedAt: true, author: { select: { name: true, email: true } } } }),
  ])
  return { count, items: rows.map((row) => ({ id: row.id, text: plainText(row.title, 160), full: plainText(`${row.title}\n${row.excerpt}`, 2000), by: row.author?.name || row.author?.email || '', about: 'درخواست حذف نوشته', at: row.trashedAt || row.updatedAt })) }
}

/** For the staff moderation overview: article comments waiting for approval, oldest first. */
export async function waitingForModeration(take = 5) {
  const [count, rows] = await Promise.all([
    db.postComment.count({ where: { status: 'PENDING' } }),
    db.postComment.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take, select: { id: true, body: true, createdAt: true, user: { select: { name: true } }, post: { select: { title: true } } } }),
  ])
  return { count, items: rows.map((row) => ({ id: row.id, text: plainText(row.body, 160), full: plainText(row.body, 2000), by: row.user.name || '', about: row.post.title, at: row.createdAt })) }
}
