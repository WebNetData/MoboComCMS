import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { ForumError, cleanContent, cleanTitle, pageCount } from '@/modules/forum/domain/forum'
import { postLimits, type Viewer } from '@/modules/forum/domain/community'
import { MAX_GROUP_RECIPIENTS, RuleError, canStartMessage, censorText, findWatched, parseRecipients } from '@/modules/forum/domain/discourse'
import { markdownExcerpt, renderMarkdown } from '@/modules/forum/domain/markdown'
import { getForumSettings, notify } from '@/modules/forum/server/community'
import { authorsFor, fallbackAuthor } from '@/modules/forum/server/forum'
import { relationBetween } from '@/modules/identity/server/profile'
import { canMessage, normalizePrivacy } from '@/modules/identity/domain/profile'

// Personal messages: private conversations kept apart from topics, so they
// can never leak into listings, search, feeds or the sitemap. Only
// participants read a conversation (staff included only when invited).

const PAGE = 30
export const INBOX_BOXES = ['inbox', 'unread', 'sent', 'archived'] as const
export type InboxBox = (typeof INBOX_BOXES)[number]

function requireSender(viewer: Viewer) {
  if (!viewer.userId) throw new ForumError('برای پیام خصوصی وارد شوید', 401)
  if (viewer.suspended) throw new ForumError('حساب شما در تالار موقتاً تعلیق شده است', 403)
  if (viewer.silenced) throw new ForumError('امکان ارسال پیام برای حساب شما موقتاً بسته شده است', 403)
  return viewer.userId
}

function throttle(viewer: Viewer, kind: 'start' | 'reply') {
  if (viewer.moderator) return
  const [limit, windowMs] = kind === 'start' ? [10, 3_600_000] : [60, 600_000]
  if (!rateLimitHit(`forum:pm:${kind}:${viewer.userId}`, limit, windowMs).ok) throw new ForumError('کمی صبر کنید و دوباره تلاش کنید', 429)
}

async function checkBody(content: string) {
  const settings = await getForumSettings()
  const blocked = findWatched(content, settings.watchedWords.block)
  if (blocked) throw new ForumError(`متن شما شامل واژهٔ غیرمجاز «${blocked}» است`, 422)
}

/** Users behind the given usernames and messageable group slugs (excluding the sender). */
async function resolveRecipients(viewer: Viewer, input: { to?: unknown; groups?: unknown }) {
  const names = input.to === undefined || input.to === '' || (Array.isArray(input.to) && !input.to.length) ? [] : (() => { try { return parseRecipients(input.to) } catch (error) { if (error instanceof RuleError) throw new ForumError(error.message); throw error } })()
  const profiles = names.length ? await db.forumProfile.findMany({ where: { username: { in: names } }, select: { userId: true, username: true, suspendedUntil: true } }) : []
  const missing = names.filter((name) => !profiles.some((profile) => profile.username === name))
  if (missing.length) throw new ForumError(`کاربر «${missing[0]}» پیدا نشد`, 404)
  const ids = new Set(profiles.map((profile) => profile.userId))
  const slugs = Array.isArray(input.groups) ? input.groups.map(String).slice(0, 3) : []
  if (slugs.length) {
    const groups = await db.forumGroup.findMany({ where: { slug: { in: slugs } }, include: { members: { where: { status: 'ACTIVE' }, select: { userId: true }, take: MAX_GROUP_RECIPIENTS + 1 } } })
    for (const group of groups) {
      if (!group.mentionable && !viewer.moderator) throw new ForumError(`به گروه «${group.name}» نمی‌توان پیام داد`, 403)
      if (group.members.length > MAX_GROUP_RECIPIENTS) throw new ForumError(`گروه «${group.name}» برای پیام گروهی بیش از حد بزرگ است`, 422)
      for (const member of group.members) ids.add(member.userId)
    }
  }
  ids.delete(viewer.userId!)
  if (!ids.size) throw new ForumError('دست‌کم یک گیرندهٔ دیگر لازم است')
  // Named recipients decide who may message them (profile privacy, blocks); staff are exempt.
  if (!viewer.moderator) {
    const named = new Set(profiles.map((profile) => profile.userId))
    const privacy = new Map((await db.userProfile.findMany({ where: { userId: { in: [...named] } }, select: { userId: true, username: true, privacy: true } })).map((row) => [row.userId, row]))
    for (const id of named) {
      const relation = await relationBetween(viewer.userId!, id)
      const row = privacy.get(id)
      if (!canMessage(normalizePrivacy(row?.privacy), relation)) throw new ForumError(`@${row?.username || profiles.find((p) => p.userId === id)?.username} پیام خصوصی نمی‌پذیرد`, 403)
    }
  }
  return [...ids]
}

export async function startConversation(viewer: Viewer, input: { to?: unknown; groups?: unknown; title?: unknown; content?: unknown }) {
  const userId = requireSender(viewer)
  const settings = await getForumSettings()
  if (!canStartMessage(viewer, settings)) throw new ForumError(settings.messagesEnabled ? `ارسال پیام خصوصی از سطح اعتماد ${settings.messagesMinTrust.toLocaleString('fa-IR')} به بعد ممکن است` : 'پیام خصوصی در تالار غیرفعال است', 403)
  const title = cleanTitle(input.title)
  const content = cleanContent(input.content)
  await checkBody(`${title}\n${content}`)
  const recipients = await resolveRecipients(viewer, input)
  throttle(viewer, 'start')
  const now = new Date()
  const conversation = await db.$transaction(async (tx) => {
    const created = await tx.forumConversation.create({ data: { title, userId, postCount: 1, lastPostAt: now, lastPostUserId: userId } })
    await tx.forumMessage.create({ data: { conversationId: created.id, userId, number: 1, content, createdAt: now } })
    await tx.forumConversationUser.createMany({ data: [{ conversationId: created.id, userId, lastRead: 1 }, ...recipients.map((id) => ({ conversationId: created.id, userId: id }))] })
    return created
  })
  const sender = await db.forumProfile.findUnique({ where: { userId }, select: { username: true } })
  for (const id of recipients) {
    await notify(id, 'FORUM_MESSAGE', `forum:pm:${conversation.id}:1:${id}`, `@${sender?.username} به شما پیام خصوصی داد`, `«${title}»: ${markdownExcerpt(content, 120)}`, `/forum/messages/${conversation.id}`)
  }
  return { id: conversation.id }
}

async function membership(viewer: Viewer, conversationId: number) {
  if (!viewer.userId || !Number.isSafeInteger(conversationId)) throw new ForumError('گفت‌وگو پیدا نشد', 404)
  const row = await db.forumConversationUser.findUnique({ where: { conversationId_userId: { conversationId, userId: viewer.userId } }, include: { conversation: true } })
  if (!row || row.left) throw new ForumError('گفت‌وگو پیدا نشد', 404)
  return row
}

export async function replyConversation(viewer: Viewer, conversationId: number, input: { content?: unknown }) {
  const userId = requireSender(viewer)
  const member = await membership(viewer, conversationId)
  const content = cleanContent(input.content)
  await checkBody(content)
  throttle(viewer, 'reply')
  const now = new Date()
  const message = await db.$transaction(async (tx) => {
    const updated = await tx.forumConversation.update({ where: { id: conversationId }, data: { postCount: { increment: 1 }, lastPostAt: now, lastPostUserId: userId } })
    const created = await tx.forumMessage.create({ data: { conversationId, userId, number: updated.postCount, content, createdAt: now } })
    await tx.forumConversationUser.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastRead: created.number, archived: false } })
    // A new message brings the conversation back to everyone's inbox.
    await tx.forumConversationUser.updateMany({ where: { conversationId, userId: { not: userId }, left: false }, data: { archived: false } })
    return created
  })
  const [others, sender] = await Promise.all([
    db.forumConversationUser.findMany({ where: { conversationId, userId: { not: userId }, left: false }, select: { userId: true } }),
    db.forumProfile.findUnique({ where: { userId }, select: { username: true } }),
  ])
  for (const other of others) {
    await notify(other.userId, 'FORUM_MESSAGE', `forum:pm:${conversationId}:${message.number}:${other.userId}`, `پیام تازه از @${sender?.username}`, `«${member.conversation.title}»: ${markdownExcerpt(content, 120)}`, `/forum/messages/${conversationId}#m-${message.number}`)
  }
  return { id: message.id, number: message.number }
}

export async function inbox(viewer: Viewer, boxInput: unknown, pageInput: unknown) {
  if (!viewer.userId) return { box: 'inbox' as InboxBox, rows: [], page: 1, pages: 1, total: 0, counts: { inbox: 0, unread: 0, sent: 0, archived: 0 } }
  const userId = viewer.userId
  const box = (INBOX_BOXES as readonly string[]).includes(String(boxInput)) ? boxInput as InboxBox : 'inbox'
  const page = Math.max(1, Math.min(200, Number(pageInput) || 1))
  const memberships = await db.forumConversationUser.findMany({ where: { userId, left: false }, select: { conversationId: true, lastRead: true, archived: true, conversation: { select: { postCount: true, userId: true } } } })
  const filter = (row: typeof memberships[number], name: InboxBox) =>
    name === 'archived' ? row.archived
      : name === 'sent' ? row.conversation.userId === userId
        : name === 'unread' ? !row.archived && row.lastRead < row.conversation.postCount
          : !row.archived
  const counts = Object.fromEntries(INBOX_BOXES.map((name) => [name, memberships.filter((row) => filter(row, name)).length])) as Record<InboxBox, number>
  const ids = memberships.filter((row) => filter(row, box)).map((row) => row.conversationId)
  const conversations = await db.forumConversation.findMany({
    where: { id: { in: ids } }, orderBy: { lastPostAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
    include: { participants: { where: { left: false }, select: { userId: true } }, messages: { orderBy: { number: 'desc' }, take: 1, select: { content: true, userId: true } } },
  })
  const authors = await authorsFor(conversations.flatMap((row) => row.participants.map((p) => p.userId)))
  const state = new Map(memberships.map((row) => [row.conversationId, row]))
  const settings = await getForumSettings()
  return {
    box, page, pages: pageCount(ids.length, PAGE), total: ids.length, counts,
    rows: conversations.map((row) => {
      const mine = state.get(row.id)!
      return {
        id: row.id, title: censorText(row.title, settings.watchedWords.censor), lastPostAt: row.lastPostAt, postCount: row.postCount, unread: Math.max(0, row.postCount - mine.lastRead), archived: mine.archived,
        participants: row.participants.map((p) => authors.get(p.userId) || fallbackAuthor(p.userId)),
        excerpt: censorText(markdownExcerpt(row.messages[0]?.content || '', 140), settings.watchedWords.censor),
        lastAuthor: authors.get(row.messages[0]?.userId ?? row.userId) || fallbackAuthor(row.userId),
      }
    }),
  }
}

export async function unreadMessageCount(userId: number | null) {
  if (!userId) return 0
  const rows = await db.forumConversationUser.findMany({ where: { userId, left: false, archived: false }, select: { lastRead: true, conversation: { select: { postCount: true } } } })
  return rows.filter((row) => row.lastRead < row.conversation.postCount).length
}

export async function getConversation(viewer: Viewer, conversationId: number, pageInput?: unknown) {
  const member = await membership(viewer, conversationId).catch(() => null)
  if (!member) return null
  const total = member.conversation.postCount
  const pages = pageCount(total, PAGE)
  const page = Math.max(1, Math.min(pages, Number(pageInput) || pages))
  const [messages, participants, settings] = await Promise.all([
    db.forumMessage.findMany({ where: { conversationId }, orderBy: { number: 'asc' }, skip: (page - 1) * PAGE, take: PAGE }),
    db.forumConversationUser.findMany({ where: { conversationId }, select: { userId: true, left: true, lastRead: true } }),
    getForumSettings(),
  ])
  const authors = await authorsFor([...participants.map((p) => p.userId), ...messages.map((m) => m.userId)])
  const lastSeen = messages.length ? messages[messages.length - 1].number : 0
  if (lastSeen > member.lastRead) await db.forumConversationUser.update({ where: { conversationId_userId: { conversationId, userId: viewer.userId! } }, data: { lastRead: lastSeen } }).catch(() => undefined)
  return {
    id: conversationId, title: censorText(member.conversation.title, settings.watchedWords.censor), createdAt: member.conversation.createdAt, archived: member.archived,
    page, pages, total, lastRead: member.lastRead,
    participants: participants.map((p) => ({ ...(authors.get(p.userId) || fallbackAuthor(p.userId)), left: p.left })),
    messages: messages.map((message) => {
      const author = authors.get(message.userId) || fallbackAuthor(message.userId)
      return {
        id: message.id, number: message.number, createdAt: message.createdAt, author, own: message.userId === viewer.userId,
        html: renderMarkdown(censorText(message.content, settings.watchedWords.censor), { images: postLimits(author.trustLevel, settings, author.staff).images }),
      }
    }),
  }
}

export async function conversationAction(viewer: Viewer, conversationId: number, input: { action?: unknown; to?: unknown }) {
  requireSender(viewer)
  const member = await membership(viewer, conversationId)
  const userId = viewer.userId!
  switch (input.action) {
    case 'archive': case 'unarchive':
      await db.forumConversationUser.update({ where: { conversationId_userId: { conversationId, userId } }, data: { archived: input.action === 'archive' } })
      return { archived: input.action === 'archive' }
    case 'leave':
      await db.forumConversationUser.update({ where: { conversationId_userId: { conversationId, userId } }, data: { left: true, archived: true } })
      return { left: true }
    case 'invite': {
      const ids = await resolveRecipients(viewer, { to: input.to })
      const current = await db.forumConversationUser.count({ where: { conversationId } })
      if (current + ids.length > 30) throw new ForumError('حداکثر ۳۰ نفر در یک گفت‌وگو', 422)
      for (const id of ids) {
        await db.forumConversationUser.upsert({ where: { conversationId_userId: { conversationId, userId: id } }, create: { conversationId, userId: id }, update: { left: false, archived: false } })
        await notify(id, 'FORUM_MESSAGE', `forum:pm:${conversationId}:invite:${id}`, 'به یک گفت‌وگوی خصوصی دعوت شدید', `«${member.conversation.title}»`, `/forum/messages/${conversationId}`)
      }
      return { invited: ids.length }
    }
    default: throw new ForumError('عملیات نامعتبر')
  }
}
