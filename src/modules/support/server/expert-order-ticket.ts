import type { Prisma } from '@prisma/client'
import { richTextToPlain, sanitizeMessage } from '@/shared/content/sanitize'
import { EXPERT_AUTHENTICATION_REQUEST, EXPERT_TICKET_SECURITY, type ExpertOrderTicket } from '@/modules/support/domain/expert-order-ticket'
import { notifyTicketReply, persistTicketReply } from '@/modules/support/server/ticket-reply'
import { ticketWorkflowSelect } from '@/modules/support/server/ticket-workflow'

type TicketReader = Pick<Prisma.TransactionClient, 'ticket'>
type Context = { key: `store:${number}` | `form:${number}`; orderId: number; userId: number; productId?: number }
type Input = { purpose?: unknown; message?: unknown; version?: unknown }

export class ExpertOrderTicketError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

function where(context: Context) {
  return { expertRequestKey: context.key, userId: context.userId, orderId: context.orderId }
}

export async function readExpertOrderTicket(client: TicketReader, context: Context): Promise<ExpertOrderTicket | null> {
  const ticket = await client.ticket.findUnique({
    where: where(context),
    select: {
      id: true, status: true,
      messages: { where: { internal: false }, orderBy: { id: 'desc' }, take: 20, select: { id: true, fromAdmin: true, body: true } },
    },
  })
  if (!ticket) return null
  return {
    id: ticket.id, status: ticket.status, version: ticket.messages[0]?.id ?? null,
    messages: ticket.messages.reverse().map(({ id, fromAdmin, body }) => ({ id, staff: fromAdmin, text: richTextToPlain(body, 4000) })),
  }
}

export async function findExpertOrderTicketIds(client: TicketReader, userId: number, keys: Context['key'][]) {
  if (!keys.length) return new Map<string, number>()
  const found = await client.ticket.findMany({
    where: { userId, expertRequestKey: { in: keys } },
    select: { expertRequestKey: true, id: true },
  })
  return new Map(found.flatMap(({ expertRequestKey, id }) => expertRequestKey ? [[expertRequestKey, id] as const] : []))
}

function prepareMessage(input: Input) {
  if (input.purpose === 'verification') return sanitizeMessage(`${EXPERT_AUTHENTICATION_REQUEST}\n\n${EXPERT_TICKET_SECURITY}`)
  if (input.purpose !== 'detail' || typeof input.message !== 'string') throw new ExpertOrderTicketError('نوع درخواست را انتخاب کنید.')
  const message = input.message.trim()
  if (!message || message.length > 1500) throw new ExpertOrderTicketError('متن پیام باید از ۱ تا ۱۵۰۰ نویسه باشد.')
  const plain = richTextToPlain(sanitizeMessage(message), 1500)
  if (!plain || /(?:\b(?:password|passcode|otp|2fa|mfa|verification code|login code|recovery code)\b|پسورد|گذرواژه|رمز\s*(?:عبور|یک[\s‌-]*بار)|کد\s+(?:ورود|ت[اأ]یید|بازیابی|دومرحله))/iu.test(plain)) {
    throw new ExpertOrderTicketError('در تیکت فقط جزئیات غیرحساس بنویسید. برای تأیید ورود، گزینهٔ «تأیید در سرویس اصلی» را انتخاب کنید.')
  }
  return sanitizeMessage(`${plain}\n\n${EXPERT_TICKET_SECURITY}`)
}

/** Caller must claim and authorize the paid work source in this transaction. */
export async function writeExpertOrderTicket(tx: Prisma.TransactionClient, context: Context, actorId: number, input: Input) {
  const message = prepareMessage(input)
  const version = input.version === null ? null : typeof input.version === 'number' && Number.isSafeInteger(input.version) && input.version > 0 ? input.version : undefined
  if (version === undefined) throw new ExpertOrderTicketError('نسخهٔ پیام معتبر نیست.')
  const existing = await tx.ticket.findUnique({
    where: where(context),
    select: { ...ticketWorkflowSelect, userId: true, messages: { where: { internal: false }, orderBy: { id: 'desc' }, take: 1, select: { id: true } } },
  })
  if (existing) {
    // A repeated open after a lost response returns the original thread.
    if (version === null) return { id: existing.id, created: false, sent: false }
    if (existing.status === 'CLOSED') throw new ExpertOrderTicketError('این گفت‌وگو بسته شده است.', 409)
    if (existing.messages[0]?.id !== version) throw new ExpertOrderTicketError('پیام تازه‌ای ثبت شده است. گفت‌وگو را دوباره بارگیری کنید.', 409)
    const messageId = await persistTicketReply(tx, existing, actorId, { message, staffReply: true, internal: false })
    if (!messageId) throw new ExpertOrderTicketError('گفت‌وگو تغییر کرد. دوباره تلاش کنید.', 409)
    await notifyTicketReply(existing.id, existing.userId, messageId, tx)
    return { id: existing.id, created: false, sent: true }
  }
  if (version !== null) throw new ExpertOrderTicketError('گفت‌وگو در دسترس نیست. صفحه را تازه کنید.', 409)
  const customer = await tx.user.findFirst({ where: { id: context.userId, status: 'ACTIVE', erasedAt: null }, select: { id: true } })
  if (!customer) throw new ExpertOrderTicketError('حساب مشتری فعال نیست.', 409)
  const now = new Date()
  const ticket = await tx.ticket.create({
    data: {
      expertRequestKey: context.key, userId: context.userId, orderId: context.orderId, productId: context.productId,
      subject: `پیگیری سفارش ${context.orderId.toLocaleString('fa-IR')}`, department: 'GENERAL', priority: 'normal', status: 'PENDING',
      assignedToId: actorId, firstResponseAt: now, lastStaffAt: now,
      messages: { create: { userId: actorId, fromAdmin: true, body: message } },
    },
    select: { id: true, messages: { select: { id: true }, take: 1 } },
  })
  await notifyTicketReply(ticket.id, context.userId, ticket.messages[0].id, tx)
  return { id: ticket.id, created: true, sent: true }
}
