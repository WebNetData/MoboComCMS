import { db } from '@/platform/database/prisma'
import { dayKeys, tehranDay } from '@/modules/forum/domain/discourse'
import { authorsFor, fallbackAuthor } from '@/modules/forum/server/forum'

// Community health for the forum admin (Discourse-style dashboard): daily
// activity, response rate, top topics, contributors and categories.

export async function forumReports(days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000)
  const [topics, posts, members, reactions, flags, messages, firstReplies, pending, pendingFlags] = await Promise.all([
    db.forumThread.findMany({ where: { createdAt: { gte: since }, status: 'VISIBLE' }, select: { id: true, createdAt: true, views: true, likeCount: true, replyCount: true, title: true, categoryId: true } }),
    db.forumPost.findMany({ where: { createdAt: { gte: since }, status: 'VISIBLE' }, select: { createdAt: true, userId: true, postNumber: true, threadId: true } }),
    db.forumProfile.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.forumReaction.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.forumFlag.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.forumMessage.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.forumPost.findMany({ where: { postNumber: 2, status: 'VISIBLE', thread: { createdAt: { gte: since } } }, select: { threadId: true, createdAt: true } }),
    db.forumPost.count({ where: { status: 'PENDING' } }),
    db.forumFlag.count({ where: { status: 'PENDING' } }),
  ])
  const keys = dayKeys(days, now)
  const bucket = (rows: { createdAt: Date }[]) => {
    const counts = new Map(keys.map((key) => [key, 0]))
    for (const row of rows) { const key = tehranDay(row.createdAt); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }
    return keys.map((key) => counts.get(key)!)
  }
  const replies = posts.filter((post) => post.postNumber > 1)
  const firstReply = new Map(firstReplies.map((row) => [row.threadId, row.createdAt]))
  const answered = topics.filter((topic) => { const at = firstReply.get(topic.id); return at && at.getTime() - topic.createdAt.getTime() <= 86_400_000 }).length
  const delays = topics.map((topic) => firstReply.get(topic.id)?.getTime()).map((at, i) => (at ? at - topics[i].createdAt.getTime() : null)).filter((ms): ms is number => ms !== null).sort((a, b) => a - b)
  const contributors = new Map<number, number>()
  for (const post of posts) contributors.set(post.userId, (contributors.get(post.userId) || 0) + 1)
  const top = [...contributors].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const authors = await authorsFor(top.map(([id]) => id))
  const categories = await db.forumCategory.findMany({ select: { id: true, title: true, color: true } })
  const byCategory = new Map<number, { topics: number; posts: number }>()
  for (const topic of topics) byCategory.set(topic.categoryId, { topics: (byCategory.get(topic.categoryId)?.topics || 0) + 1, posts: byCategory.get(topic.categoryId)?.posts || 0 })
  const threadCategory = new Map((await db.forumThread.findMany({ where: { id: { in: [...new Set(posts.map((post) => post.threadId))] } }, select: { id: true, categoryId: true } })).map((row) => [row.id, row.categoryId]))
  for (const post of posts) { const cat = threadCategory.get(post.threadId); if (cat) byCategory.set(cat, { topics: byCategory.get(cat)?.topics || 0, posts: (byCategory.get(cat)?.posts || 0) + 1 }) }
  const activeUsers = contributors.size
  return {
    days: keys,
    series: { topics: bucket(topics), replies: bucket(replies), members: bucket(members), likes: bucket(reactions), flags: bucket(flags), messages: bucket(messages) },
    totals: {
      topics: topics.length, replies: replies.length, members: members.length, likes: reactions.length, flags: flags.length, messages: messages.length,
      activeUsers, pending, pendingFlags,
      answeredIn24h: topics.length ? Math.round((answered / topics.length) * 100) : 0,
      medianFirstReplyMinutes: delays.length ? Math.round(delays[Math.floor(delays.length / 2)] / 60_000) : null,
      unanswered: topics.filter((topic) => topic.replyCount === 0).length,
    },
    topTopics: [...topics].sort((a, b) => (b.likeCount * 5 + b.replyCount * 3 + b.views) - (a.likeCount * 5 + a.replyCount * 3 + a.views)).slice(0, 8).map((topic) => ({ id: topic.id, title: topic.title, views: topic.views, replies: topic.replyCount, likes: topic.likeCount })),
    contributors: top.map(([id, count]) => ({ ...(authors.get(id) || fallbackAuthor(id)), posts: count })),
    categories: categories.map((category) => ({ ...category, ...(byCategory.get(category.id) || { topics: 0, posts: 0 }) })).filter((row) => row.topics || row.posts).sort((a, b) => b.posts - a.posts),
  }
}
