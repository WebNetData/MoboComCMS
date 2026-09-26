import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { handleResellerUpdate } from '@/modules/reseller/server/reseller-bot-sales'
import { secretMatches } from '@/modules/reseller/server/reseller-bot'

export async function POST(req: NextRequest, context: { params: Promise<{ botId: string }> }) {
  const { botId } = await context.params
  if (!/^\d+$/.test(botId)) return new Response(null, { status: 404 })
  const row = await db.resellerBot.findUnique({ where: { botId } })
  if (!row?.active || !secretMatches(row.webhookSecret, req.headers.get('x-telegram-bot-api-secret-token'))) return new Response(null, { status: 403 })
  const length = Number(req.headers.get('content-length') || 0)
  if (length > 256_000) return new Response(null, { status: 413 })
  const raw = await req.text()
  if (Buffer.byteLength(raw, 'utf8') > 256_000) return new Response(null, { status: 413 })
  let update: { update_id?: number }
  try { update = JSON.parse(raw) } catch { return new Response(null, { status: 400 }) }
  if (!Number.isSafeInteger(update.update_id)) return new Response(null, { status: 400 })
  const updateId = String(update.update_id)
  const claimed = await db.resellerBotUpdate.create({ data: { botId: row.id, updateId } }).then(() => true).catch((error: { code?: string }) => { if (error.code === 'P2002') return false; throw error })
  if (!claimed) return Response.json({ ok: true, duplicate: true })
  try {
    await handleResellerUpdate(row, update)
    return Response.json({ ok: true })
  } catch (error) {
    await db.resellerBotUpdate.delete({ where: { botId_updateId: { botId: row.id, updateId } } }).catch(() => {})
    await db.resellerBot.update({ where: { id: row.id }, data: { lastError: error instanceof Error ? error.message.slice(0, 500) : 'Webhook failed' } }).catch(() => {})
    return new Response(null, { status: 500 })
  }
}
