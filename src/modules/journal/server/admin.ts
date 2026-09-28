import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { JOURNAL_HEALTH, normalizeJournalSettings, postIssues, type JournalHealth, type JournalSettings } from '@/modules/journal/domain/journal'

// Journal admin: Liona home settings, editorial dashboard and pickers.

const SETTINGS_KEY = 'journal.home.v1'
const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export async function getJournalSettings(): Promise<JournalSettings> {
  return normalizeJournalSettings(await readJsonSetting(SETTINGS_KEY))
}

export async function saveJournalSettings(input: unknown): Promise<JournalSettings> {
  const next = normalizeJournalSettings(input)
  await writeJsonSetting(SETTINGS_KEY, next)
  return next
}

export async function journalDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [posts, categories, pending, comments30, pendingRecent] = await Promise.all([
    db.post.findMany({ select: { id: true, slug: true, title: true, cover: true, excerpt: true, content: true, status: true, publishedAt: true, views: true, access: true, featured: true, categoryId: true, authorId: true, author: { select: { name: true } }, _count: { select: { categories: true, comments: true } } } }),
    db.postCategory.findMany({ select: { id: true, name: true, parentId: true } }),
    db.postComment.count({ where: { status: 'PENDING' } }),
    db.postComment.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.postComment.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, body: true, createdAt: true, user: { select: { name: true } }, post: { select: { title: true } } } }),
  ])
  const live = posts.filter((post) => post.status === 'PUBLISHED' && post.publishedAt <= now)
  const health = Object.fromEntries(Object.keys(JOURNAL_HEALTH).map((key) => [key, 0])) as Record<JournalHealth, number>
  const worst: { id: number; title: string; cover: string; issues: JournalHealth[] }[] = []
  for (const post of live) {
    const issues = postIssues({ ...post, categories: post._count.categories + (post.categoryId ? 1 : 0) })
    for (const issue of issues) health[issue]++
    if (issues.length) worst.push({ id: post.id, title: post.title, cover: post.cover, issues })
  }
  worst.sort((a, b) => b.issues.length - a.issues.length)
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const commentDays = new Map(days.map((day) => [day, 0]))
  for (const row of comments30) { const key = tehranDay(row.createdAt); if (commentDays.has(key)) commentDays.set(key, commentDays.get(key)! + 1) }
  const postDays = new Map(days.map((day) => [day, 0]))
  for (const post of live) { const key = tehranDay(post.publishedAt); if (postDays.has(key)) postDays.set(key, postDays.get(key)! + 1) }
  const byCategory = new Map<number, number>()
  for (const post of live) if (post.categoryId) byCategory.set(post.categoryId, (byCategory.get(post.categoryId) || 0) + 1)
  const catName = new Map(categories.map((category) => [category.id, category.name]))
  const authors = new Map<string, { posts: number; views: number }>()
  for (const post of live) { const name = post.author?.name || 'بدون نویسنده'; const row = authors.get(name) || { posts: 0, views: 0 }; row.posts++; row.views += post.views; authors.set(name, row) }
  const scheduled = posts.filter((post) => post.status === 'PUBLISHED' && post.publishedAt > now).sort((a, b) => +a.publishedAt - +b.publishedAt)
  return {
    kpis: {
      published: live.length, drafts: posts.filter((post) => post.status !== 'PUBLISHED').length, scheduled: scheduled.length,
      views: live.reduce((sum, post) => sum + post.views, 0), posts30: live.filter((post) => post.publishedAt >= since).length,
      pendingComments: pending, comments30: comments30.length, vip: live.filter((post) => post.access === 'MEMBERS').length,
      featured: live.filter((post) => post.featured).length, categories: categories.length,
    },
    series: days.map((day) => ({ day, comments: commentDays.get(day)!, posts: postDays.get(day)! })),
    health: Object.entries(health).map(([key, count]) => ({ key, label: JOURNAL_HEALTH[key as JournalHealth], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst: worst.slice(0, 8),
    topViewed: [...live].sort((a, b) => b.views - a.views).slice(0, 8).map((post) => ({ id: post.id, slug: post.slug, title: post.title, cover: post.cover, views: post.views, comments: post._count.comments })),
    scheduledList: scheduled.slice(0, 6).map((post) => ({ id: post.id, title: post.title, cover: post.cover, at: post.publishedAt.toISOString() })),
    pending: pendingRecent.map((comment) => ({ id: comment.id, body: comment.body.slice(0, 140), author: comment.user.name || 'کاربر', post: comment.post.title, createdAt: comment.createdAt.toISOString() })),
    categories: [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ name: catName.get(id) || `#${id}`, count })),
    authors: [...authors].sort((a, b) => b[1].posts - a[1].posts).slice(0, 6).map(([name, row]) => ({ name, ...row })),
  }
}

export async function journalPickers() {
  const [posts, categories] = await Promise.all([
    db.post.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 800, select: { id: true, title: true, cover: true, publishedAt: true } }),
    db.postCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
  ])
  return { posts: posts.map((post) => ({ id: post.id, title: post.title, cover: post.cover })), categories: categories.filter((category) => !category.parentId).map((category) => ({ id: category.id, title: category.name, cover: '' })) }
}
