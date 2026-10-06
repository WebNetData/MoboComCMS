import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import type { Viewer } from '@/modules/forum/domain/community'
import { markdownExcerpt } from '@/modules/forum/domain/markdown'
import { authorsFor, fallbackAuthor, visibleCategories } from '@/modules/forum/server/forum'
import { homeFeed } from '@/modules/community/server/community'
import { recentReviews } from '@/modules/reviews/server/reviews'
import { blockedIds, followingIds } from '@/modules/identity/server/profile'
import { plainText } from '@/shared/text/plain'

// The activity stream: what the whole community is doing, newest first. New topics and replies of the
// forum and, while the social module is on, the posts of the feed, in one list. Each source keeps its own
// rules: forum entries come only from categories this viewer may see, feed posts through the feed's own
// visibility, privacy and block rules, reviews only when approved and of something still public. "Following"
// is the same stream narrowed to the people the viewer follows.

export const STREAM_FILTERS = ['all', 'following', 'topics', 'replies', 'posts', 'reviews'] as const
export type StreamFilter = (typeof STREAM_FILTERS)[number]
export const normalizeStreamFilter = (value: unknown): StreamFilter => (STREAM_FILTERS as readonly string[]).includes(String(value)) ? value as StreamFilter : 'all'

export type StreamPerson = { name: string; username: string; avatar: string; avatarColor: string; href: string }
export type StreamEntry = {
  key: string; kind: 'topic' | 'reply' | 'post' | 'review'; at: Date; person: StreamPerson
  /** Stars given, for a review. */
  rating?: number
  title: string; text: string; href: string; image: string
  place: { title: string; color: string; href: string } | null
}

const PAGE = 30
const cursorDate = (value: unknown) => { const date = typeof value === 'string' && value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date : null }

export async function activityStream(viewer: Viewer, input: { filter?: unknown; before?: unknown } = {}) {
  const asked = normalizeStreamFilter(input.filter)
  const [social, reviewsOn] = await Promise.all([isModuleEnabled('community'), isModuleEnabled('reviews')])
  // "Following" needs someone to be following: a visitor, or the social module off, gets the whole stream.
  const filter: StreamFilter = asked === 'following' && (!viewer.userId || !social) ? 'all' : asked
  const before = cursorDate(input.before)
  const followed = filter === 'following' ? await followingIds(viewer.userId!) : null
  const everything = filter === 'all' || filter === 'following'
  const wantsForum = everything || filter === 'topics' || filter === 'replies'
  const wantsPosts = social && (everything || filter === 'posts')
  const wantsReviews = reviewsOn && (everything || filter === 'reviews')
  const categories = wantsForum ? await visibleCategories(viewer) : []
  const byId = new Map(categories.map((category) => [category.id, category]))

  const [forumRows, feed, reviews] = await Promise.all([
    wantsForum && categories.length && (!followed || followed.length) ? db.forumPost.findMany({
      where: {
        status: 'VISIBLE', ...(before ? { createdAt: { lt: before } } : {}), ...(followed ? { userId: { in: followed } } : {}),
        ...(filter === 'topics' ? { postNumber: { lte: 1 } } : filter === 'replies' ? { postNumber: { gt: 1 } } : {}),
        thread: { is: { status: 'VISIBLE', listed: true, categoryId: { in: categories.map((category) => category.id) } } },
      },
      orderBy: { createdAt: 'desc' }, take: PAGE,
      select: { id: true, postNumber: true, content: true, createdAt: true, userId: true, thread: { select: { id: true, title: true, categoryId: true } } },
    }).catch(() => []) : Promise.resolve([]),
    wantsPosts ? homeFeed(viewer.userId, { mode: followed ? 'following' : 'all', cursor: before ? before.toISOString() : undefined }).catch(() => null) : Promise.resolve(null),
    wantsReviews ? blockedIds(viewer.userId).then((blocked) => recentReviews({ before, take: PAGE, ...(followed ? { byUsers: followed } : {}), notUsers: blocked })).catch(() => []) : Promise.resolve([]),
  ])

  const authors = await authorsFor([...forumRows.map((row) => row.userId), ...reviews.map((row) => row.userId), ...(followed && viewer.userId ? [viewer.userId] : [])])
  const viewerName = followed && viewer.userId ? authors.get(viewer.userId)?.username || '' : ''
  const entries: StreamEntry[] = forumRows.map((row) => {
    const author = authors.get(row.userId) || fallbackAuthor(row.userId)
    const category = byId.get(row.thread.categoryId)
    const topic = row.postNumber <= 1
    return {
      key: `forum:${row.id}`, kind: topic ? 'topic' : 'reply', at: row.createdAt,
      person: { name: author.name, username: author.username, avatar: author.avatar, avatarColor: author.avatarColor, href: `/forum/u/${author.username}` },
      title: row.thread.title, text: markdownExcerpt(row.content, 220), href: topic ? `/forum/t/${row.thread.id}` : `/forum/t/${row.thread.id}?post=${row.postNumber}`, image: '',
      place: category ? { title: category.title, color: category.color, href: `/forum/c/${category.slug}` } : null,
    }
  })
  for (const review of reviews) {
    const author = authors.get(review.userId) || fallbackAuthor(review.userId)
    entries.push({
      key: `review:${review.id}`, kind: 'review', at: review.at, rating: review.rating,
      person: { name: author.name, username: author.username, avatar: author.avatar, avatarColor: author.avatarColor, href: `/forum/u/${author.username}` },
      title: review.item.title, text: review.text, href: review.item.url, image: review.item.image, place: null,
    })
  }
  for (const post of feed?.posts || []) {
    // The feed's "following" includes one's own posts; this stream is about other people.
    if (followed && post.author.username && viewerName && post.author.username === viewerName) continue
    entries.push({
      key: `post:${post.id}`, kind: 'post', at: new Date(post.createdAt),
      person: { name: post.author.name, username: post.author.username, avatar: post.author.avatar, avatarColor: post.author.avatarColor, href: `/u/${post.author.username}` },
      title: post.item?.title || '', text: plainText(post.html, 280), href: `/feed/p/${post.id}`, image: post.images[0] || '', place: null,
    })
  }
  entries.sort((a, b) => b.at.getTime() - a.at.getTime())
  const page = entries.slice(0, PAGE)
  // More exists when a source filled its page or the merge had to cut.
  const more = entries.length > PAGE || forumRows.length === PAGE || reviews.length === PAGE || Boolean(feed?.next)
  return {
    filter, entries: page, next: more && page.length ? page[page.length - 1].at.toISOString() : null,
    // Which tabs to offer: feed posts and "following" need the social module, reviews theirs, following a signed-in member.
    posts: social, reviews: reviewsOn, following: social && !!viewer.userId, followingCount: followed ? followed.length : null,
  }
}

/** Day label key of an entry in site time, to group the stream under "today", "yesterday" and dates. */
export const streamDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
