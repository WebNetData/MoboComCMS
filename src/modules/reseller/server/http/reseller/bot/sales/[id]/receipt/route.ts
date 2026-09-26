import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err } from '@/platform/http/response'
import { requireReseller, resellerCan } from '@/modules/reseller/server/reseller'
import { bot, type BotResult } from '@/modules/notifications/server/telegram'
import { resellerBotConfig } from '@/modules/reseller/server/reseller-bot'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'sales.view')) return err('forbidden', 403)
  const id = Number((await context.params).id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('receipt not found', 404)
  const sale = await db.resellerSale.findFirst({ where: { id, resellerId: guard.reseller.id } })
  const row = sale ? await db.resellerBot.findFirst({ where: { id: sale.botId, resellerId: guard.reseller.id } }) : null
  if (!sale?.receiptFileId || !row) return err('receipt not found', 404)
  const cfg = resellerBotConfig(row)
  const fileId = sale.receiptFileId.replace(/^document:/, '')
  const found: BotResult<{ file_path?: string; file_size?: number }> = await bot('getFile', { file_id: fileId }, cfg)
  const path = found.result?.file_path || ''
  if (!found.ok || !/^[A-Za-z0-9_./-]+$/.test(path) || path.split('/').includes('..') || (found.result?.file_size || 0) > 8_000_000) return err('receipt unavailable', 502)
  const response = await fetch(`https://api.telegram.org/file/bot${cfg.token}/${path}`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) }).catch(() => null)
  if (!response?.ok || Number(response.headers.get('content-length') || 0) > 8_000_000) return err('receipt unavailable', 502)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 8_000_000) return err('receipt too large', 413)
  const mime = response.headers.get('content-type') || ''
  const display = /^(image\/(jpeg|png|webp)|application\/pdf)(;|$)/i.test(mime)
  return new Response(bytes, { headers: { 'content-type': display ? mime : 'application/octet-stream', 'content-disposition': `${display ? 'inline' : 'attachment'}; filename="receipt-${id}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
}
