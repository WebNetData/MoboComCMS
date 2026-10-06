import { db } from '@/platform/database/prisma'
import type { Viewer } from '@/modules/forum/domain/community'
import { markdownExcerpt } from '@/modules/forum/domain/markdown'
import { authorsFor, fallbackAuthor, visibleCategories, type AuthorView } from '@/modules/forum/server/forum'

// The leaderboard: who earned the most reputation in a period, who wrote the most, which posts were liked the
// most, and who led each of the last days. Reputation is one point for each reaction a member's post receives
// from someone else. Everything is counted in the forums this viewer may see, so a private forum adds neither
// a point nor a post to what an outsider is shown.

export const LEADER_PERIODS = ['today', 'week', 'month', 'all'] as const
export type LeaderPeriod = (typeof LEADER_PERIODS)[number]
export const normalizeLeaderPeriod = (value: unknown): LeaderPeriod => (LEADER_PERIODS as readonly string[]).includes(String(value)) ? value as LeaderPeriod : 'week'

const DAY = 86_400_000
const WINDOW_DAYS = 30
const PAST_DAYS = 7
const TOP = 20
/** Reactions read for one board; beyond it the oldest of the window are left out, the newest kept. */
const MAX_ROWS = 20_000

/** The calendar day of a moment in the site's time: days turn at midnight in Tehran, not in UTC. */
export const leaderDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export type LeaderRow = { author: AuthorView; points: number }
export type LeaderPost = { id: number; number: number; points: number; excerpt: string; topic: { id: number; title: string }; author: AuthorView }
export type PastLeader = { day: string; at: Date; author: AuthorView; points: number }

const ranked = (counts: Map<number, number>) => [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])
const bump = (counts: Map<number, number>, key: number, by = 1) => counts.set(key, (counts.get(key) || 0) + by)

export async function leaderboard(viewer: Viewer, input: { period?: unknown } = {}, now = new Date()) {
  const period = normalizeLeaderPeriod(input.period)
  const categoryIds = (await visibleCategories(viewer)).map((category) => category.id)
  const inForums = { status: 'VISIBLE', thread: { is: { status: 'VISIBLE', categoryId: { in: categoryIds } } } }
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY)
  const today = leaderDay(now)
  const from = period === 'today' ? null : period === 'week' ? new Date(now.getTime() - 7 * DAY) : period === 'month' ? since : null
  const within = (at: Date) => period === 'today' ? leaderDay(at) === today : !!from && at >= from

  const [reactions, posts] = categoryIds.length ? await Promise.all([
    db.forumReaction.findMany({ where: { createdAt: { gte: since, lte: now }, post: { is: inForums } }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, select: { userId: true, createdAt: true, post: { select: { id: true, userId: true } } } }),
    period === 'all' ? Promise.resolve([]) : db.forumPost.findMany({ where: { ...inForums, createdAt: { gte: since, lte: now } }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, select: { userId: true, createdAt: true } }),
  ]).catch(() => [[], []] as const) : [[], []] as const
  // A point is a reaction from someone else.
  const earned = reactions.filter((row) => row.userId !== row.post.userId)

  const reputation = new Map<number, number>(), written = new Map<number, number>(), liked = new Map<number, number>()
  const days = new Map<string, Map<number, number>>()
  for (const row of earned) {
    if (period !== 'all' && within(row.createdAt)) { bump(reputation, row.post.userId); bump(liked, row.post.id) }
    const day = leaderDay(row.createdAt)
    if (!days.has(day)) days.set(day, new Map())
    bump(days.get(day)!, row.post.userId)
  }
  for (const row of posts) if (within(row.createdAt)) bump(written, row.userId)

  let reputationRows = ranked(reputation).slice(0, TOP), writtenRows = ranked(written).slice(0, TOP), likedRows = ranked(liked).slice(0, 10)
  if (period === 'all') {
    // All time is what the profiles and posts already carry; it is not recounted from every reaction ever made.
    const [profiles, writers, best] = await Promise.all([
      db.forumProfile.findMany({ where: { likesReceived: { gt: 0 }, user: { status: 'ACTIVE' } }, orderBy: [{ likesReceived: 'desc' }, { userId: 'asc' }], take: TOP, select: { userId: true, likesReceived: true } }),
      db.forumProfile.findMany({ where: { postCount: { gt: 0 }, user: { status: 'ACTIVE' } }, orderBy: [{ postCount: 'desc' }, { userId: 'asc' }], take: TOP, select: { userId: true, postCount: true } }),
      categoryIds.length ? db.forumPost.findMany({ where: { ...inForums, likeCount: { gt: 0 } }, orderBy: [{ likeCount: 'desc' }, { id: 'asc' }], take: 10, select: { id: true, likeCount: true } }) : Promise.resolve([]),
    ]).catch(() => [[], [], []] as const)
    reputationRows = profiles.map((row) => [row.userId, row.likesReceived]); writtenRows = writers.map((row) => [row.userId, row.postCount]); likedRows = best.map((row) => [row.id, row.likeCount])
  }

  // The leader of each of the last days, newest first; today is still open and is not a "past" day.
  const past: [string, number, number][] = []
  for (let back = 1; back <= PAST_DAYS; back += 1) {
    const at = new Date(now.getTime() - back * DAY), top = ranked(days.get(leaderDay(at)) || new Map())[0]
    if (top) past.push([leaderDay(at), top[0], top[1]])
  }

  const topPosts = likedRows.length ? await db.forumPost.findMany({ where: { id: { in: likedRows.map((row) => row[0]) }, ...inForums }, select: { id: true, postNumber: true, content: true, userId: true, thread: { select: { id: true, title: true } } } }) : []
  const authors = await authorsFor([...reputationRows.map((row) => row[0]), ...writtenRows.map((row) => row[0]), ...past.map((row) => row[1]), ...topPosts.map((post) => post.userId), ...(viewer.userId ? [viewer.userId] : [])])
  const author = (id: number) => authors.get(id) || fallbackAuthor(id)
  const dayStart = (day: string) => new Date(`${day}T12:00:00+03:30`)
  const own = viewer.userId ? reputationRows.findIndex((row) => row[0] === viewer.userId) : -1

  return {
    period, days: WINDOW_DAYS,
    reputation: reputationRows.map((row): LeaderRow => ({ author: author(row[0]), points: row[1] })),
    writers: writtenRows.map((row): LeaderRow => ({ author: author(row[0]), points: row[1] })),
    posts: likedRows.map((row): LeaderPost | null => {
      const post = topPosts.find((item) => item.id === row[0])
      return post ? { id: post.id, number: post.postNumber, points: row[1], excerpt: markdownExcerpt(post.content, 180), topic: post.thread, author: author(post.userId) } : null
    }).filter((row): row is LeaderPost => !!row),
    past: past.map((row): PastLeader => ({ day: row[0], at: dayStart(row[0]), author: author(row[1]), points: row[2] })),
    // Where the viewer stands in this period, when they are on the board; their points either way.
    mine: viewer.userId ? { place: own >= 0 ? own + 1 : null, points: period === 'all' ? authors.get(viewer.userId)?.reputation ?? 0 : reputation.get(viewer.userId) || 0 } : null,
  }
}
