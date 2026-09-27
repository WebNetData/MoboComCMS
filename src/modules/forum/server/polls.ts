import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { ForumError } from '@/modules/forum/domain/forum'
import { categoryAccess, type Viewer } from '@/modules/forum/domain/community'
import { RuleError, parsePolls, resultsVisible, validateVote } from '@/modules/forum/domain/discourse'
import { getForumSettings } from '@/modules/forum/server/community'

// Polls live in post text as [poll] blocks; each save syncs one ForumPoll row
// per block. Options keep stable ids so edits that only add or reword other
// options do not lose votes.

type Tx = Prisma.TransactionClient

/** Validates poll blocks before a post is saved (trust level, syntax). */
export async function checkPolls(viewer: Viewer, content: string) {
  let specs
  try { specs = parsePolls(content) } catch (error) { if (error instanceof RuleError) throw new ForumError(error.message, error.status); throw error }
  if (specs.length && !viewer.moderator) {
    const settings = await getForumSettings()
    if (viewer.trustLevel < settings.pollsMinTrust) throw new ForumError(`ساخت نظرسنجی از سطح اعتماد ${settings.pollsMinTrust.toLocaleString('fa-IR')} به بعد ممکن است`, 403)
  }
  return specs
}

/** Creates, updates or removes the post's polls to match its text. */
export async function syncPolls(tx: Tx, postId: number, content: string) {
  const specs = parsePolls(content)
  const existing = await tx.forumPoll.findMany({ where: { postId } })
  for (const spec of specs) {
    const data = { title: spec.title, type: spec.type, options: JSON.stringify(spec.options), minChoices: spec.min, maxChoices: spec.max, results: spec.results, closesAt: spec.closesAt ? new Date(spec.closesAt) : null }
    const current = existing.find((poll) => poll.name === spec.name)
    if (current) {
      await tx.forumPoll.update({ where: { id: current.id }, data })
      // Votes for options that no longer exist are dropped.
      await tx.forumPollVote.deleteMany({ where: { pollId: current.id, optionId: { notIn: spec.options.map((option) => option.id) } } })
      const voters = await tx.forumPollVote.findMany({ where: { pollId: current.id }, distinct: ['userId'], select: { userId: true } })
      await tx.forumPoll.update({ where: { id: current.id }, data: { voterCount: voters.length } })
    } else {
      await tx.forumPoll.create({ data: { ...data, postId, name: spec.name } })
    }
  }
  const removed = existing.filter((poll) => !specs.some((spec) => spec.name === poll.name)).map((poll) => poll.id)
  if (removed.length) await tx.forumPoll.deleteMany({ where: { id: { in: removed } } })
}

export type PollView = {
  id: number; postId: number; name: string; title: string; type: string; min: number; max: number; results: string
  closed: boolean; closesAt: Date | null; voters: number; mine: string[]; showResults: boolean
  options: { id: string; label: string; votes: number | null; percent: number | null }[]
}

const parseOptions = (raw: string): { id: string; label: string }[] => {
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value : [] } catch { return [] }
}

/** Polls of the given posts, with tallies only when the viewer may see them. */
export async function pollsForPosts(postIds: number[], viewer: Viewer): Promise<Map<number, PollView[]>> {
  if (!postIds.length) return new Map()
  const polls = await db.forumPoll.findMany({ where: { postId: { in: postIds } }, orderBy: { id: 'asc' } })
  if (!polls.length) return new Map()
  const ids = polls.map((poll) => poll.id)
  const [tallies, mine] = await Promise.all([
    db.forumPollVote.groupBy({ by: ['pollId', 'optionId'], where: { pollId: { in: ids } }, _count: { _all: true } }),
    viewer.userId ? db.forumPollVote.findMany({ where: { pollId: { in: ids }, userId: viewer.userId }, select: { pollId: true, optionId: true } }) : Promise.resolve([]),
  ])
  const out = new Map<number, PollView[]>()
  const now = new Date()
  for (const poll of polls) {
    const own = mine.filter((row) => row.pollId === poll.id).map((row) => row.optionId)
    const closed = poll.closed || !!(poll.closesAt && poll.closesAt <= now)
    const show = resultsVisible(poll, own.length > 0, viewer.moderator, now)
    const votes = tallies.filter((row) => row.pollId === poll.id)
    const total = votes.reduce((sum, row) => sum + row._count._all, 0)
    const view: PollView = {
      id: poll.id, postId: poll.postId, name: poll.name, title: poll.title, type: poll.type, min: poll.minChoices, max: poll.maxChoices, results: poll.results,
      closed, closesAt: poll.closesAt, voters: poll.voterCount, mine: own, showResults: show,
      options: parseOptions(poll.options).map((option) => {
        const count = votes.find((row) => row.optionId === option.id)?._count._all ?? 0
        return { ...option, votes: show ? count : null, percent: show ? (total ? Math.round((count / total) * 100) : 0) : null }
      }),
    }
    out.set(poll.postId, [...(out.get(poll.postId) || []), view])
  }
  return out
}

async function loadPoll(viewer: Viewer, pollId: number) {
  const poll = Number.isSafeInteger(pollId) ? await db.forumPoll.findUnique({ where: { id: pollId }, include: { post: { include: { thread: { include: { category: { include: { permissions: { select: { groupId: true, level: true } } } } } } } } } }) : null
  if (!poll || poll.post.status !== 'VISIBLE' || poll.post.thread.status !== 'VISIBLE' || !categoryAccess(poll.post.thread.category, viewer).see) throw new ForumError('نظرسنجی پیدا نشد', 404)
  return poll
}

/** Casts (or replaces) the viewer's vote. */
export async function vote(viewer: Viewer, pollId: number, choice: unknown) {
  if (!viewer.userId) throw new ForumError('برای شرکت در نظرسنجی وارد شوید', 401)
  if (viewer.suspended) throw new ForumError('حساب شما در تالار موقتاً تعلیق شده است', 403)
  const poll = await loadPoll(viewer, pollId)
  if (!categoryAccess(poll.post.thread.category, viewer).reply) throw new ForumError('شرکت در این نظرسنجی برای شما مجاز نیست', 403)
  let picked: string[]
  try { picked = validateVote({ type: poll.type, min: poll.minChoices, max: poll.maxChoices, options: parseOptions(poll.options), closed: poll.closed, closesAt: poll.closesAt }, choice) } catch (error) {
    if (error instanceof RuleError) throw new ForumError(error.message, error.status)
    throw error
  }
  const userId = viewer.userId
  await db.$transaction(async (tx) => {
    await tx.forumPollVote.deleteMany({ where: { pollId, userId } })
    await tx.forumPollVote.createMany({ data: picked.map((optionId) => ({ pollId, userId, optionId })) })
    const voters = await tx.forumPollVote.findMany({ where: { pollId }, distinct: ['userId'], select: { userId: true } })
    await tx.forumPoll.update({ where: { id: pollId }, data: { voterCount: voters.length } })
  })
  return (await pollsForPosts([poll.postId], viewer)).get(poll.postId)?.find((row) => row.id === pollId)
}

export async function unvote(viewer: Viewer, pollId: number) {
  if (!viewer.userId) throw new ForumError('وارد شوید', 401)
  const poll = await loadPoll(viewer, pollId)
  if (poll.closed || (poll.closesAt && poll.closesAt <= new Date())) throw new ForumError('این نظرسنجی بسته شده است', 409)
  const userId = viewer.userId
  await db.$transaction(async (tx) => {
    await tx.forumPollVote.deleteMany({ where: { pollId, userId } })
    const voters = await tx.forumPollVote.findMany({ where: { pollId }, distinct: ['userId'], select: { userId: true } })
    await tx.forumPoll.update({ where: { id: pollId }, data: { voterCount: voters.length } })
  })
  return (await pollsForPosts([poll.postId], viewer)).get(poll.postId)?.find((row) => row.id === pollId)
}

/** The post author or staff open/close a poll. */
export async function setPollClosed(viewer: Viewer, pollId: number, closed: boolean) {
  const poll = await loadPoll(viewer, pollId)
  if (!viewer.moderator && poll.post.userId !== viewer.userId) throw new ForumError('فقط نویسندهٔ پیام یا ناظران نظرسنجی را می‌بندند', 403)
  await db.forumPoll.update({ where: { id: pollId }, data: { closed, ...(closed ? {} : { closesAt: null }) } })
  return (await pollsForPosts([poll.postId], viewer)).get(poll.postId)?.find((row) => row.id === pollId)
}
