import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireUser } from '@/modules/identity/server/access'
import { ChatError } from '@/modules/livechat/domain/livechat'
import { sseResponse, subscribe } from '@/platform/realtime/bus'
import {
  AGENTS_CHANNEL, addNote, agentAction, agentConversation, agentList, agentReply, chatStats, chatToTicket, conversationChannel, crmProfile, crmSearch, getChatSettings, newChatToken,
  requestOperator, saveChatSettings, setTag, typing, visitorContact, visitorConversation, visitorMessagesSince, visitorPoll, visitorRate, visitorSend, visitorState,
} from '@/modules/livechat/server/livechat'

const COOKIE = 'mc_chat'
const failure = (error: unknown) => {
  if (error instanceof ChatError) return err(error.message, error.status)
  throw error
}
const body = async (req: NextRequest) => ((await req.json().catch(() => null)) || {}) as Record<string, unknown>
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
const tokenOf = (req: NextRequest) => { const value = req.cookies.get(COOKIE)?.value || ''; return /^[A-Za-z0-9_-]{20,64}$/.test(value) ? value : null }

function withCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 60 })
  return response
}

// ------------------------------------------------------------------ visitor

/** GET /api/chat — widget state; ?since=<id> — new messages (polling). */
export async function GET_visitor(req: NextRequest) {
  const off = await moduleGuard('livechat')
  if (off) return off
  const user = await requireUser(req)
  const token = tokenOf(req)
  const since = req.nextUrl.searchParams.get('since')
  if (since !== null) return ok(token ? await visitorPoll(token, user?.id ?? null, Number(since) || 0) : { status: null, messages: [] })
  return ok(await visitorState(token, user?.id ?? null))
}

/** POST /api/chat — {body} send | {op: operator|contact|rate}. */
export async function POST_visitor(req: NextRequest) {
  const off = await moduleGuard('livechat')
  if (off) return off
  const user = await requireUser(req)
  const input = await body(req)
  const existing = tokenOf(req)
  if (input.op === 'typing') {
    // "Typing…" is relayed to the operator; it has its own, looser limit and needs a conversation.
    if (!existing || !rateLimitHit(`chat-typing:${existing}`, 40, 60_000).ok) return ok({ ok: false })
    const conversation = await visitorConversation(existing, user?.id ?? null)
    if (conversation && conversation.status !== 'CLOSED') await typing(conversation.id, 'visitor')
    return ok({ ok: true })
  }
  const token = existing || newChatToken()
  if (!rateLimitHit(`chat:${existing || clientIp(req.headers)}`, 20, 60_000).ok) return err('پیام‌ها خیلی سریع ارسال شد؛ کمی صبر کنید', 429)
  try {
    if (input.op === 'operator') return withCookie(NextResponse.json(await requestOperator(token, user?.id ?? null)), token)
    if (input.op === 'contact') { await visitorContact(token, user?.id ?? null, input); return ok({ ok: true }) }
    if (input.op === 'rate') { await visitorRate(token, user?.id ?? null, input.rating); return ok({ ok: true }) }
    const result = await visitorSend({ token, userId: user?.id ?? null, body: input.body, name: input.name, pageUrl: input.pageUrl })
    return withCookie(NextResponse.json(result), token)
  } catch (error) { return failure(error) }
}

/**
 * GET /api/chat/stream — the visitor's conversation as server-sent events:
 * `message` (full message, id = message id), `status`, `typing`. Reconnects
 * catch up from Last-Event-ID. 204 when there is no conversation yet.
 */
export async function GET_visitorStream(req: NextRequest) {
  const off = await moduleGuard('livechat')
  if (off) return off
  const token = tokenOf(req)
  if (!token) return new Response(null, { status: 204 })
  if (!rateLimitHit(`chat-sse:${token}`, 30, 60_000).ok) return err('اتصال‌های پیاپی زیاد است', 429)
  const user = await requireUser(req)
  const conversation = await visitorConversation(token, user?.id ?? null)
  if (!conversation) return new Response(null, { status: 204 })
  const since = Number(req.headers.get('last-event-id') || req.nextUrl.searchParams.get('since')) || 0
  return sseResponse(req.signal, async (send) => {
    let last = since
    let running: Promise<void> | null = null
    let again = false
    // Serialised catch-up: every hint reads what is new since the last message sent.
    const flush = () => {
      if (running) { again = true; return running }
      running = (async () => {
        do {
          again = false
          for (const message of await visitorMessagesSince(conversation.id, last)) { send('message', message, message.id); last = message.id }
        } while (again)
      })().catch(() => undefined).finally(() => { running = null })
      return running
    }
    const stop = await subscribe(conversationChannel(conversation.id), (event) => {
      if (event.type === 'message') void flush()
      else if (event.type === 'status') send('status', { status: event.status })
      else if (event.type === 'typing' && event.who === 'agent') send('typing', {})
    })
    send('ready', { status: conversation.status })
    await flush()
    return stop
  })
}

// ------------------------------------------------------------------ operators

const AGENT = ['support.chat', 'tickets.manage', 'settings.manage']

/** GET /api/admin/chat — ?view=list&status=&q= | ?id=&since= | ?view=stats | ?view=settings */
export async function GET_agent(req: NextRequest) {
  const guard = await adminGuard(req, 'livechat', AGENT)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    if (q.get('id')) return ok(await agentConversation(idOf(q.get('id')), Number(q.get('since')) || 0))
    if (q.get('view') === 'stats') return ok(await chatStats())
    if (q.get('view') === 'settings') return ok({ settings: await getChatSettings() })
    return ok(await agentList({ status: q.get('status') || '', q: q.get('q') || '', agentId: guard.admin.id }))
  } catch (error) { return failure(error) }
}

/** POST /api/admin/chat — {id, body} reply | {id, action: assign|close|reopen|to-bot|ticket} */
export async function POST_agent(req: NextRequest) {
  const guard = await adminGuard(req, 'livechat', AGENT)
  if ('response' in guard) return guard.response
  const input = await body(req)
  const id = idOf(input.id)
  try {
    if (input.action === 'typing') { if (id) await typing(id, 'agent'); return ok({ ok: true }) }
    if (input.action === 'ticket') { const ticketId = await chatToTicket(id, guard.admin.id); return ok({ ticketId }) }
    if (input.action) { await agentAction(id, guard.admin.id, String(input.action)); return ok({ ok: true }) }
    return ok({ message: await agentReply(id, guard.admin.id, input.body) })
  } catch (error) { return failure(error) }
}

/**
 * GET /api/admin/chat/stream — operators' live inbox: `activity` (a message or
 * status change in some conversation) and `typing` (a visitor is typing).
 * The panel then reads what changed through the normal API.
 */
export async function GET_agentStream(req: NextRequest) {
  const guard = await adminGuard(req, 'livechat', AGENT)
  if ('response' in guard) return guard.response
  return sseResponse(req.signal, async (send) => subscribe(AGENTS_CHANNEL, (event) => {
    if (event.type === 'typing') { if (event.who === 'visitor') send('typing', { conversationId: event.conversationId }) }
    else send('activity', { conversationId: event.conversationId, type: event.type, sender: event.sender ?? null, status: event.status ?? null })
  }))
}

export async function PUT_agent(req: NextRequest) {
  const guard = await adminGuard(req, 'livechat', ['settings.manage', 'support.chat'])
  if ('response' in guard) return guard.response
  const settings = await saveChatSettings((await body(req)).settings)
  await auditAdmin({ req, actor: guard.admin, action: 'livechat.settings', targetType: 'settings', targetId: 'livechat', metadata: { botEnabled: settings.botEnabled, hours: settings.hours.enabled } })
  return ok({ settings })
}

// ------------------------------------------------------------------ CRM

const CRM = ['users.manage', 'support.chat', 'tickets.manage', 'settings.manage']

/** GET /api/admin/crm — ?q=&tag=&segment= search | ?id= customer file. */
export async function GET_crm(req: NextRequest) {
  const guard = await adminGuard(req, null, CRM)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    if (q.get('id')) return ok(await crmProfile(idOf(q.get('id'))))
    return ok(await crmSearch({ q: q.get('q') || '', tag: q.get('tag') || '', segment: q.get('segment') || '' }))
  } catch (error) { return failure(error) }
}

/** POST /api/admin/crm — {id, note} | {id, tag, on} */
export async function POST_crm(req: NextRequest) {
  const guard = await adminGuard(req, null, CRM)
  if ('response' in guard) return guard.response
  const input = await body(req)
  const id = idOf(input.id)
  try {
    if (input.note !== undefined) await addNote(id, guard.admin.id, input.note)
    else if (input.tag !== undefined) await setTag(id, input.tag, input.on !== false)
    else return err('عملیات نامعتبر است', 400)
    await auditAdmin({ req, actor: guard.admin, action: input.note !== undefined ? 'crm.note' : 'crm.tag', targetType: 'user', targetId: String(id), metadata: { tag: input.tag ?? null, on: input.on ?? null } })
    return ok({ ok: true })
  } catch (error) { return failure(error) }
}
