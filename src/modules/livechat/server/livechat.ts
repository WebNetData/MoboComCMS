import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getSettings, readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { isModuleEnabled } from '@/extensions/server/modules'
import { minorToNumber } from '@/shared/money'
import {
  CRM_TAG, ChatError, chatPrompt, cleanContact, cleanMessage, customerSegment, normalizeChatSettings, operatorsOnline, parseBotReply, timeline, wantsHuman,
  type ChatSettings, type CrmEvent,
} from '@/modules/livechat/domain/livechat'

/**
 * Live chat: visitors talk to the AI assistant first; it hands the chat to an
 * operator on request or when it cannot help. Operators work from the admin
 * console with the customer's CRM file beside the chat. Visitors poll for new
 * messages (works behind any proxy, no websockets needed).
 */

const KEY = 'livechat.v1'
const BOT_TIMEOUT_MS = 25_000

export async function getChatSettings(): Promise<ChatSettings> {
  return normalizeChatSettings(await readJsonSetting(KEY))
}

export async function saveChatSettings(input: unknown) {
  const next = normalizeChatSettings(input)
  await writeJsonSetting(KEY, next)
  return next
}

export const chatEnabled = () => isModuleEnabled('livechat')

export const newChatToken = () => randomBytes(24).toString('base64url')

type Conversation = NonNullable<Awaited<ReturnType<typeof db.chatConversation.findUnique>>>

const publicMessage = (row: { id: number; sender: string; body: string; createdAt: Date }) => ({ id: row.id, sender: row.sender, body: row.body, at: row.createdAt.toISOString() })

async function addMessage(conversation: Conversation, sender: string, body: string, agentId?: number | null) {
  const message = await db.chatMessage.create({ data: { conversationId: conversation.id, sender, body, agentId: agentId ?? null } })
  await db.chatConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: message.createdAt,
      ...(sender === 'VISITOR' ? { unreadForAgent: { increment: 1 } } : sender === 'AGENT' || sender === 'BOT' ? { unreadForVisitor: { increment: 1 } } : {}),
    },
  })
  return message
}

async function notifyAgents(conversation: Conversation, text: string) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(admins.map((admin) => createInboxEvent({
    userId: admin.id, kind: 'LIVECHAT', dedupeKey: `chat-wait:${conversation.id}:${Math.floor(Date.now() / 600_000)}:${admin.id}`,
    titleFa: 'گفت‌وگوی تازه منتظر اپراتور', titleEn: 'A chat is waiting', bodyFa: `${conversation.name || 'بازدیدکننده'}: ${text.slice(0, 120)}`, bodyEn: text.slice(0, 120), href: `/admin/chat?id=${conversation.id}`,
  }).catch(() => undefined)))
}

// ------------------------------------------------------------------ visitor

/** Widget state: settings, and the visitor's conversation when the cookie has one. */
export async function visitorState(token: string | null, userId: number | null) {
  const settings = await getChatSettings()
  const online = operatorsOnline(settings)
  const conversation = token ? await db.chatConversation.findUnique({ where: { token } }) : null
  const mine = conversation && (!conversation.userId || conversation.userId === userId) ? conversation : null
  const messages = mine ? await db.chatMessage.findMany({ where: { conversationId: mine.id }, orderBy: { id: 'asc' }, take: 200 }) : []
  return {
    botName: settings.botName, welcome: settings.welcome, online, offlineMessage: settings.offlineMessage, askContact: settings.askContact && !userId,
    conversation: mine ? { status: mine.status, rated: mine.rating != null, hasContact: !!(mine.contact || mine.userId) } : null,
    messages: messages.map(publicMessage),
  }
}

/** Visitor message: creates the conversation on first use, then lets the assistant answer while it is in BOT mode. */
export async function visitorSend(input: { token: string; userId: number | null; body: unknown; name?: unknown; pageUrl?: unknown }) {
  const body = cleanMessage(input.body)
  const settings = await getChatSettings()
  let conversation = await db.chatConversation.findUnique({ where: { token: input.token } })
  if (conversation && conversation.userId && conversation.userId !== input.userId) throw new ChatError('این گفت‌وگو متعلق به حساب دیگری است', 403)
  if (!conversation || conversation.status === 'CLOSED') {
    const user = input.userId ? await db.user.findUnique({ where: { id: input.userId }, select: { name: true } }) : null
    conversation = conversation?.status === 'CLOSED'
      ? await db.chatConversation.update({ where: { id: conversation.id }, data: { status: settings.botEnabled ? 'BOT' : 'WAITING', closedAt: null, rating: null, botReplies: 0, assignedTo: null } })
      : await db.chatConversation.create({ data: {
        token: input.token, userId: input.userId, name: String(input.name || user?.name || '').replace(/[<>]/g, '').trim().slice(0, 60),
        pageUrl: String(input.pageUrl || '').slice(0, 300), status: settings.botEnabled ? 'BOT' : 'WAITING',
      } })
  } else if (!conversation.userId && input.userId) {
    conversation = await db.chatConversation.update({ where: { id: conversation.id }, data: { userId: input.userId } })
  }
  const message = await addMessage(conversation, 'VISITOR', body)
  const replies = [publicMessage(message)]

  if (conversation.status === 'BOT') {
    const handoffByUser = wantsHuman(body)
    let handoff = handoffByUser || conversation.botReplies >= settings.maxBotReplies
    let botHandedOff = false
    if (!handoff) {
      const bot = await botAnswer(conversation, settings)
      if (bot) {
        const saved = await addMessage(conversation, 'BOT', bot.body)
        await db.chatConversation.update({ where: { id: conversation.id }, data: { botReplies: { increment: 1 } } })
        replies.push(publicMessage(saved))
        handoff = bot.handoff
        botHandedOff = bot.handoff
      } else handoff = true
    }
    // The assistant already told the visitor it is connecting them; only say it ourselves otherwise.
    if (handoff) replies.push(...await handToOperator(conversation, settings, body, !botHandedOff))
  } else if (conversation.status === 'WAITING' || conversation.status === 'OPEN') {
    if (conversation.status === 'WAITING') await notifyAgents(conversation, body)
  }
  return { status: (await db.chatConversation.findUnique({ where: { id: conversation.id }, select: { status: true } }))?.status || conversation.status, messages: replies }
}

async function handToOperator(conversation: Conversation, settings: ChatSettings, lastText: string, announce = true) {
  await db.chatConversation.update({ where: { id: conversation.id }, data: { status: 'WAITING' } })
  const online = operatorsOnline(settings)
  await notifyAgents(conversation, lastText)
  if (online && !announce) return []
  const system = await addMessage(conversation, 'SYSTEM', online ? 'شما را به همکاران پشتیبانی وصل می‌کنم؛ لطفاً چند لحظه منتظر بمانید.' : settings.offlineMessage)
  return [publicMessage(system)]
}

export async function requestOperator(token: string, userId: number | null) {
  const conversation = await db.chatConversation.findUnique({ where: { token } })
  if (!conversation || (conversation.userId && conversation.userId !== userId)) throw new ChatError('گفت‌وگو پیدا نشد', 404)
  if (conversation.status !== 'BOT') return { messages: [] }
  return { messages: await handToOperator(conversation, await getChatSettings(), 'درخواست اپراتور') }
}

/** New messages since the visitor's last one (polling). */
export async function visitorPoll(token: string, userId: number | null, since: number) {
  const conversation = await db.chatConversation.findUnique({ where: { token } })
  if (!conversation || (conversation.userId && conversation.userId !== userId)) return { status: null, messages: [], agentTyping: false }
  const messages = await db.chatMessage.findMany({ where: { conversationId: conversation.id, id: { gt: Math.max(0, since) } }, orderBy: { id: 'asc' }, take: 50 })
  if (conversation.unreadForVisitor) await db.chatConversation.update({ where: { id: conversation.id }, data: { unreadForVisitor: 0 } })
  return { status: conversation.status, messages: messages.map(publicMessage) }
}

export async function visitorContact(token: string, userId: number | null, input: { name?: unknown; contact?: unknown }) {
  const conversation = await db.chatConversation.findUnique({ where: { token } })
  if (!conversation || (conversation.userId && conversation.userId !== userId)) throw new ChatError('گفت‌وگو پیدا نشد', 404)
  const contact = cleanContact(input.contact)
  if (!contact) throw new ChatError('شمارهٔ موبایل یا ایمیل معتبر وارد کنید')
  await db.chatConversation.update({ where: { id: conversation.id }, data: { contact, name: String(input.name ?? conversation.name).replace(/[<>]/g, '').trim().slice(0, 60) } })
  await addMessage(conversation, 'SYSTEM', `اطلاعات تماس ثبت شد: ${contact}`)
}

export async function visitorRate(token: string, userId: number | null, rating: unknown) {
  const value = Math.round(Number(rating))
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new ChatError('امتیاز نامعتبر است')
  const updated = await db.chatConversation.updateMany({ where: { token, ...(userId ? { OR: [{ userId }, { userId: null }] } : { userId: null }) }, data: { rating: value } })
  if (!updated.count) throw new ChatError('گفت‌وگو پیدا نشد', 404)
}

// ------------------------------------------------------------------ assistant

/** What the assistant may know about a signed-in customer (their own data only). */
async function customerFacts(userId: number | null) {
  if (!userId) return ''
  const [user, orders, tickets, wallets] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.order.findMany({ where: { userId, productId: { not: null } }, orderBy: { id: 'desc' }, take: 3, select: { id: true, status: true, createdAt: true, totalMinor: true, currency: true, productDelivery: { select: { status: true } }, shipment: { select: { trackingCode: true, carrierName: true } }, lines: { select: { name: true }, take: 3 } } }),
    db.ticket.count({ where: { userId, status: { not: 'CLOSED' } } }),
    db.walletAccount.findMany({ where: { userId }, select: { currency: true, balanceMinor: true } }),
  ])
  const status: Record<string, string> = { PENDING: 'در انتظار پرداخت', PAID: 'پرداخت‌شده', FAILED: 'ناموفق', REFUNDED: 'بازپرداخت‌شده', CANCELLED: 'لغوشده' }
  const delivery: Record<string, string> = { PENDING: 'در صف پردازش', PROCESSING: 'در حال آماده‌سازی', PACKED: 'بسته‌بندی شد', SHIPPED: 'ارسال شد', DELIVERED: 'تحویل شد', RETURNED: 'مرجوع شد', CANCELLED: 'لغو شد' }
  return [
    `نام: ${user?.name || '—'}`,
    orders.length ? `آخرین سفارش‌ها:\n${orders.map((order) => `- سفارش ${order.id} (${order.createdAt.toLocaleDateString('fa-IR')}): ${order.lines.map((line) => line.name).join('، ')} — ${status[order.status] || order.status}${order.productDelivery ? ` / ${delivery[order.productDelivery.status] || order.productDelivery.status}` : ''}${order.shipment?.trackingCode ? ` / کد رهگیری ${order.shipment.trackingCode} (${order.shipment.carrierName})` : ''}`).join('\n')}` : 'سفارشی ندارد.',
    `تیکت باز: ${tickets}`,
    wallets.length ? `موجودی کیف پول: ${wallets.map((w) => `${minorToNumber(w.balanceMinor, w.currency).toLocaleString('fa-IR')} ${w.currency === 'IRT' ? 'تومان' : w.currency}`).join('، ')}` : '',
  ].filter(Boolean).join('\n')
}

async function botAnswer(conversation: Conversation, settings: ChatSettings): Promise<{ body: string; handoff: boolean } | null> {
  try {
    const [{ generate }, site, turns, customer] = await Promise.all([
      import('@/modules/ai/server/client'),
      getSettings(),
      db.chatMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { id: 'desc' }, take: 16, select: { sender: true, body: true } }),
      customerFacts(conversation.userId),
    ])
    const prompt = chatPrompt({ brand: site.brandName || 'موبوکام', botName: settings.botName, knowledge: settings.knowledge, customer, turns: turns.reverse().filter((turn) => turn.sender !== 'SYSTEM') })
    const result = await Promise.race([generate(prompt), new Promise<null>((resolve) => setTimeout(() => resolve(null), BOT_TIMEOUT_MS))])
    if (!result) return null
    const reply = parseBotReply(result.text)
    return reply.body ? reply : null
  } catch (error) {
    logEvent('warn', 'livechat.bot_failed', { conversationId: conversation.id, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

// ------------------------------------------------------------------ operators

export async function agentList(input: { status?: string; q?: string; agentId: number }) {
  const where: Prisma.ChatConversationWhereInput = {}
  if (input.status === 'mine') Object.assign(where, { assignedTo: input.agentId, status: { in: ['OPEN', 'WAITING'] } })
  else if (input.status && ['BOT', 'WAITING', 'OPEN', 'CLOSED'].includes(input.status)) where.status = input.status
  else where.status = { not: 'CLOSED' }
  const q = String(input.q || '').trim()
  if (q) where.OR = [{ name: { contains: q } }, { contact: { contains: q } }, { messages: { some: { body: { contains: q } } } }]
  const [rows, counts] = await Promise.all([
    db.chatConversation.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }], take: 100, include: { messages: { orderBy: { id: 'desc' }, take: 1 } } }),
    db.chatConversation.groupBy({ by: ['status'], where: { status: { not: 'CLOSED' } }, _count: { _all: true } }),
  ])
  const users = await db.user.findMany({ where: { id: { in: rows.flatMap((row) => (row.userId ? [row.userId] : [])) } }, select: { id: true, name: true, email: true } })
  const byId = new Map(users.map((user) => [user.id, user]))
  const order: Record<string, number> = { WAITING: 0, OPEN: 1, BOT: 2, CLOSED: 3 }
  return {
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    rows: rows.sort((a, b) => (order[a.status] - order[b.status]) || (b.lastMessageAt.getTime() - a.lastMessageAt.getTime())).map((row) => ({
      id: row.id, status: row.status, name: row.name || byId.get(row.userId || 0)?.name || 'بازدیدکننده', user: row.userId, contact: row.contact || byId.get(row.userId || 0)?.email || '',
      assignedTo: row.assignedTo, unread: row.unreadForAgent, last: row.messages[0] ? { sender: row.messages[0].sender, body: row.messages[0].body.slice(0, 120) } : null,
      lastMessageAt: row.lastMessageAt.toISOString(), rating: row.rating, pageUrl: row.pageUrl,
    })),
  }
}

export async function agentConversation(id: number, since = 0) {
  const conversation = await db.chatConversation.findUnique({ where: { id } })
  if (!conversation) throw new ChatError('گفت‌وگو پیدا نشد', 404)
  const messages = await db.chatMessage.findMany({ where: { conversationId: id, id: { gt: since } }, orderBy: { id: 'asc' }, take: 300 })
  if (conversation.unreadForAgent) await db.chatConversation.update({ where: { id }, data: { unreadForAgent: 0 } })
  const agents = await db.user.findMany({ where: { id: { in: [...new Set(messages.flatMap((m) => (m.agentId ? [m.agentId] : [])).concat(conversation.assignedTo ? [conversation.assignedTo] : []))] } }, select: { id: true, name: true } })
  const names = new Map(agents.map((agent) => [agent.id, agent.name]))
  return {
    conversation: { id, status: conversation.status, name: conversation.name, contact: conversation.contact, userId: conversation.userId, assignedTo: conversation.assignedTo, assignedName: conversation.assignedTo ? names.get(conversation.assignedTo) || '' : '', pageUrl: conversation.pageUrl, rating: conversation.rating, createdAt: conversation.createdAt.toISOString() },
    messages: messages.map((m) => ({ ...publicMessage(m), agent: m.agentId ? names.get(m.agentId) || '' : '' })),
    customer: conversation.userId ? await crmSnapshot(conversation.userId) : null,
  }
}

export async function agentReply(id: number, agentId: number, body: unknown) {
  const text = cleanMessage(body)
  const conversation = await db.chatConversation.findUnique({ where: { id } })
  if (!conversation) throw new ChatError('گفت‌وگو پیدا نشد', 404)
  if (conversation.status === 'CLOSED') throw new ChatError('این گفت‌وگو بسته شده است', 409)
  if (conversation.status !== 'OPEN' || !conversation.assignedTo) {
    await db.chatConversation.update({ where: { id }, data: { status: 'OPEN', assignedTo: conversation.assignedTo || agentId } })
    const agent = await db.user.findUnique({ where: { id: agentId }, select: { name: true } })
    await addMessage(conversation, 'SYSTEM', `${agent?.name || 'اپراتور'} به گفت‌وگو پیوست.`)
  }
  const message = await addMessage(conversation, 'AGENT', text, agentId)
  if (conversation.userId) await createInboxEvent({ userId: conversation.userId, kind: 'LIVECHAT', dedupeKey: `chat-reply:${id}:${Math.floor(Date.now() / 600_000)}`, titleFa: 'پاسخ پشتیبانی در گفت‌وگوی آنلاین', titleEn: 'Support replied in chat', bodyFa: text.slice(0, 140), bodyEn: text.slice(0, 140), href: '/?chat=1' }).catch(() => undefined)
  return publicMessage(message)
}

export async function agentAction(id: number, agentId: number, action: string) {
  const conversation = await db.chatConversation.findUnique({ where: { id } })
  if (!conversation) throw new ChatError('گفت‌وگو پیدا نشد', 404)
  if (action === 'assign') {
    await db.chatConversation.update({ where: { id }, data: { assignedTo: agentId, status: conversation.status === 'CLOSED' ? 'CLOSED' : 'OPEN' } })
    const agent = await db.user.findUnique({ where: { id: agentId }, select: { name: true } })
    await addMessage(conversation, 'SYSTEM', `${agent?.name || 'اپراتور'} به گفت‌وگو پیوست.`)
  } else if (action === 'close') {
    await db.chatConversation.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } })
    await addMessage(conversation, 'SYSTEM', 'گفت‌وگو بسته شد. از همراهی شما سپاسگزاریم؛ لطفاً به این گفت‌وگو امتیاز دهید.')
  } else if (action === 'reopen') {
    await db.chatConversation.update({ where: { id }, data: { status: 'OPEN', closedAt: null, assignedTo: agentId } })
  } else if (action === 'to-bot') {
    await db.chatConversation.update({ where: { id }, data: { status: 'BOT', assignedTo: null, botReplies: 0 } })
  } else throw new ChatError('عملیات نامعتبر است')
}

/** Turns a chat into a support ticket for follow-up (signed-in customers). */
export async function chatToTicket(id: number, agentId: number) {
  const conversation = await db.chatConversation.findUnique({ where: { id }, include: { messages: { orderBy: { id: 'asc' } } } })
  if (!conversation?.userId) throw new ChatError('برای ساخت تیکت، مشتری باید وارد حساب شده باشد', 409)
  const transcript = conversation.messages.filter((m) => m.sender !== 'SYSTEM').map((m) => `${m.sender === 'VISITOR' ? 'مشتری' : m.sender === 'BOT' ? 'دستیار' : 'اپراتور'}: ${m.body}`).join('\n')
  const ticket = await db.ticket.create({ data: { userId: conversation.userId, subject: `پیگیری گفت‌وگوی آنلاین #${id}`, status: 'PENDING', messages: { create: [{ userId: conversation.userId, body: transcript.slice(0, 20_000) }, { userId: agentId, fromAdmin: true, internal: true, body: `از گفت‌وگوی آنلاین #${id} ساخته شد.` }] } } })
  await addMessage(conversation, 'SYSTEM', `برای پیگیری، تیکت شمارهٔ ${ticket.id} ساخته شد؛ پاسخ را در بخش تیکت‌های حساب کاربری ببینید.`)
  return ticket.id
}

export async function chatStats() {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [total, bot, handed, rated] = await Promise.all([
    db.chatConversation.count({ where: { createdAt: { gte: since } } }),
    db.chatConversation.count({ where: { createdAt: { gte: since }, assignedTo: null, status: { in: ['BOT', 'CLOSED'] } } }),
    db.chatConversation.count({ where: { createdAt: { gte: since }, assignedTo: { not: null } } }),
    db.chatConversation.aggregate({ where: { createdAt: { gte: since }, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
  ])
  return { total, resolvedByBot: bot, handedToAgents: handed, rating: Math.round((rated._avg.rating || 0) * 10) / 10, ratings: rated._count.rating }
}

// ------------------------------------------------------------------ CRM

/** Compact customer card for the chat console. */
export async function crmSnapshot(userId: number) {
  const [user, paid, lastOrder, openTickets, tags, wallets] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, createdAt: true, status: true } }),
    db.order.aggregate({ where: { userId, status: 'PAID', currency: { in: ['IRT', 'IRR'] } }, _sum: { totalMinor: true }, _count: { _all: true } }),
    db.order.findFirst({ where: { userId, status: 'PAID' }, orderBy: { id: 'desc' }, select: { id: true, createdAt: true } }),
    db.ticket.count({ where: { userId, status: { not: 'CLOSED' } } }),
    db.crmTag.findMany({ where: { userId }, select: { tag: true } }),
    db.walletAccount.findMany({ where: { userId }, select: { currency: true, balanceMinor: true } }),
  ])
  if (!user) return null
  const spend = Number(paid._sum.totalMinor || 0n)
  return {
    ...user, createdAt: user.createdAt.toISOString(), orders: paid._count._all, spendToman: spend, lastOrderAt: lastOrder?.createdAt.toISOString() || null, openTickets,
    tags: tags.map((row) => row.tag), wallet: wallets.map((w) => ({ currency: w.currency, balance: minorToNumber(w.balanceMinor, w.currency) })),
    ...customerSegment({ orders: paid._count._all, spendToman: spend, lastOrderAt: lastOrder?.createdAt || null, openTickets }),
  }
}

/** The full customer file: profile, value, tags, notes and one timeline of everything. */
export async function crmProfile(userId: number) {
  const snapshot = await crmSnapshot(userId)
  if (!snapshot) throw new ChatError('مشتری پیدا نشد', 404)
  const [orders, tickets, chats, walletTx, returns, reviews, notes, subscriptions, addresses] = await Promise.all([
    db.order.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 60, select: { id: true, status: true, createdAt: true, totalMinor: true, currency: true, meta: true, productDelivery: { select: { status: true } }, lines: { select: { name: true, quantity: true }, take: 4 }, plan: { select: { name: true } } } }),
    db.ticket.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 40, select: { id: true, subject: true, status: true, createdAt: true, department: true } }),
    db.chatConversation.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 30, include: { messages: { orderBy: { id: 'desc' }, take: 1 } } }),
    db.walletTx.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 40, select: { id: true, type: true, amountMinor: true, currency: true, description: true, createdAt: true, status: true } }),
    db.returnRequest.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 20, select: { id: true, number: true, kind: true, status: true, orderId: true, createdAt: true } }),
    db.productReview.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 20, select: { id: true, rating: true, title: true, body: true, createdAt: true, product: { select: { name: true, slug: true } } } }),
    db.crmNote.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 50 }),
    db.subscription.count({ where: { userId, status: 'ACTIVE' } }),
    db.userAddress.findMany({ where: { userId }, take: 5, select: { city: true } }),
  ])
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(notes.map((n) => n.adminId))] } }, select: { id: true, name: true } })
  const authorName = new Map(authors.map((a) => [a.id, a.name]))
  const money = (minor: bigint, currency: string) => `${minorToNumber(minor, currency).toLocaleString('fa-IR')} ${currency === 'IRT' ? 'تومان' : currency === 'IRR' ? 'ریال' : currency}`
  const ORDER: Record<string, [string, CrmEvent['tone']]> = { PAID: ['پرداخت‌شده', 'ok'], PENDING: ['در انتظار پرداخت', 'warn'], FAILED: ['ناموفق', 'bad'], REFUNDED: ['بازپرداخت', 'bad'], CANCELLED: ['لغو', 'bad'] }
  const events: CrmEvent[] = [
    { at: new Date(snapshot.createdAt), kind: 'signup', title: 'ثبت‌نام در سایت', detail: '', href: '', tone: '' },
    ...orders.map((order): CrmEvent => ({ at: order.createdAt, kind: 'order', title: `سفارش #${order.id} — ${(ORDER[order.status] || [order.status])[0]}`, detail: `${order.lines.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`).join('، ') || order.plan?.name || ''} · ${money(order.totalMinor, order.currency)}`, href: `/admin/store/orders/${order.id}`, tone: (ORDER[order.status] || ['', ''])[1] })),
    ...tickets.map((ticket): CrmEvent => ({ at: ticket.createdAt, kind: 'ticket', title: `تیکت #${ticket.id}: ${ticket.subject}`, detail: ticket.status === 'CLOSED' ? 'بسته' : ticket.status === 'PENDING' ? 'در انتظار پاسخ' : 'باز', href: `/admin/tickets/${ticket.id}`, tone: ticket.status === 'CLOSED' ? '' : 'warn' })),
    ...chats.map((chat): CrmEvent => ({ at: chat.createdAt, kind: 'chat', title: `گفت‌وگوی آنلاین #${chat.id}`, detail: `${chat.messages[0]?.body.slice(0, 100) || ''}${chat.rating ? ` · امتیاز ${chat.rating}` : ''}`, href: `/admin/chat?id=${chat.id}`, tone: chat.status === 'CLOSED' ? '' : 'warn' })),
    ...walletTx.map((tx): CrmEvent => ({ at: tx.createdAt, kind: 'wallet', title: `کیف پول: ${tx.amountMinor < 0n ? 'برداشت' : 'واریز'} ${money(tx.amountMinor < 0n ? -tx.amountMinor : tx.amountMinor, tx.currency)}`, detail: tx.description, href: '', tone: tx.amountMinor < 0n ? '' : 'ok' })),
    ...returns.map((row): CrmEvent => ({ at: row.createdAt, kind: 'return', title: `${row.kind === 'CANCEL' ? 'لغو' : 'مرجوعی'} ${row.number}`, detail: `سفارش #${row.orderId} · ${row.status}`, href: '/admin/store/returns', tone: 'warn' })),
    ...reviews.map((row): CrmEvent => ({ at: row.createdAt, kind: 'review', title: `نظر ${'★'.repeat(row.rating)} برای ${row.product.name}`, detail: row.title || row.body.slice(0, 100), href: `/products/${row.product.slug}`, tone: row.rating >= 4 ? 'ok' : row.rating <= 2 ? 'bad' : '' })),
    ...notes.map((note): CrmEvent => ({ at: note.createdAt, kind: 'note', title: `یادداشت ${authorName.get(note.adminId) || 'مدیر'}`, detail: note.body, href: '', tone: '' })),
  ]
  return {
    customer: snapshot, subscriptions,
    cities: [...new Set(addresses.map((a) => a.city).filter(Boolean))],
    notes: notes.map((note) => ({ id: note.id, body: note.body, author: authorName.get(note.adminId) || '', createdAt: note.createdAt.toISOString() })),
    timeline: timeline(events).map((event) => ({ ...event, at: event.at.toISOString() })),
    counts: { orders: orders.length, tickets: tickets.length, chats: chats.length, returns: returns.length, reviews: reviews.length },
  }
}

export async function crmSearch(input: { q?: string; tag?: string; segment?: string }) {
  const q = String(input.q || '').trim()
  const where: Prisma.UserWhereInput = { role: { not: 'ADMIN' } }
  if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }, { phone: { contains: q } }, ...(/^\d+$/.test(q) ? [{ id: Number(q) }] : [])]
  if (input.tag) where.id = { in: (await db.crmTag.findMany({ where: { tag: input.tag }, select: { userId: true }, take: 2000 })).map((row) => row.userId) }
  const users = await db.user.findMany({ where, orderBy: { id: 'desc' }, take: 60, select: { id: true, name: true, email: true, phone: true, createdAt: true } })
  const ids = users.map((user) => user.id)
  const [spend, last, tags, allTags] = await Promise.all([
    db.order.groupBy({ by: ['userId'], where: { userId: { in: ids }, status: 'PAID', currency: { in: ['IRT', 'IRR'] } }, _sum: { totalMinor: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['userId'], where: { userId: { in: ids }, status: 'PAID' }, _max: { createdAt: true } }),
    db.crmTag.findMany({ where: { userId: { in: ids } }, select: { userId: true, tag: true } }),
    db.crmTag.groupBy({ by: ['tag'], _count: { _all: true }, orderBy: { _count: { tag: 'desc' } }, take: 30 }),
  ])
  const spendBy = new Map(spend.map((row) => [row.userId, row]))
  const lastBy = new Map(last.map((row) => [row.userId, row._max.createdAt]))
  const rows = users.map((user) => {
    const s = spendBy.get(user.id)
    const seg = customerSegment({ orders: s?._count._all || 0, spendToman: Number(s?._sum.totalMinor || 0n), lastOrderAt: lastBy.get(user.id) || null, openTickets: 0 })
    return { ...user, createdAt: user.createdAt.toISOString(), orders: s?._count._all || 0, spend: Number(s?._sum.totalMinor || 0n), lastOrderAt: lastBy.get(user.id)?.toISOString() || null, segment: seg.segment, tags: tags.filter((t) => t.userId === user.id).map((t) => t.tag) }
  })
  return { rows: input.segment ? rows.filter((row) => row.segment.key === input.segment) : rows, tags: allTags.map((row) => ({ tag: row.tag, count: row._count._all })) }
}

export async function setTag(userId: number, tag: unknown, on: boolean) {
  const value = String(tag ?? '').trim()
  if (!CRM_TAG.test(value)) throw new ChatError('برچسب باید ۲ تا ۲۴ حرف باشد')
  if (on) await db.crmTag.upsert({ where: { userId_tag: { userId, tag: value } }, create: { userId, tag: value }, update: {} })
  else await db.crmTag.deleteMany({ where: { userId, tag: value } })
}

export async function addNote(userId: number, adminId: number, body: unknown) {
  const text = String(body ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 2000)
  if (!text) throw new ChatError('متن یادداشت خالی است')
  if (!await db.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new ChatError('مشتری پیدا نشد', 404)
  await db.crmNote.create({ data: { userId, adminId, body: text } })
}
