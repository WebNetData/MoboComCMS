import type { NextRequest } from 'next/server'
import { apiOk } from '@/modules/public-api/server/v1'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { PayError } from '@/modules/billing/domain/pay'
import { settlementCenter, saveSettlementDestination, settlementQueue, decideSettlementBatch, settlementReceipt, webhookOverview, saveWebhookEndpoint, recoverWebhookDelivery, type PayActor } from '@/modules/billing/server/pay'

async function limit(key: string, count: number) {
  if (!(await rateLimitStrict(key, count, 60000)).ok) throw new PayError('تعداد درخواست زیاد است؛ کمی بعد تلاش کنید', 429)
}
export async function payCenterGet(req: NextRequest, actor: PayActor, resource: string, admin = false): Promise<Response | null> {
  if (!['webhooks','settlement-center','settlement-receipt'].includes(resource)) return null
  if (actor.machine) throw new PayError('مرکز عملیات از پنل در دسترس است', 403)
  if (resource === 'webhooks') return apiOk(await webhookOverview(actor, req.nextUrl.searchParams, admin))
  if (resource === 'settlement-center') return apiOk(admin ? await settlementQueue(actor, req.nextUrl.searchParams) : await settlementCenter(actor))
  const receipt = await settlementReceipt(actor, req.nextUrl.searchParams.get('id') || '', admin)
  if (req.nextUrl.searchParams.get('format') !== 'html') return apiOk(receipt.settlement)
  return new Response(receipt.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-disposition': `attachment; filename="${receipt.filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': `default-src 'none'; style-src 'nonce-${receipt.nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox` } })
}
export async function payCenterWrite(actor: PayActor, resource: string, method: string, input: Record<string, unknown>, admin = false): Promise<Response | null> {
  if (!['webhooks','webhook-deliveries','settlement-destinations','settlement-batches'].includes(resource)) return null
  if (actor.machine) throw new PayError('مرکز عملیات از پنل در دسترس است', 403)
  if (resource === 'webhooks' && (admin ? method === 'PATCH' : method === 'POST')) {
    await limit('pay-webhook-config:' + actor.id, 12)
    return apiOk(await saveWebhookEndpoint(actor, input, admin))
  }
  if (resource === 'webhook-deliveries' && method === 'POST') {
    await limit('pay-webhook-replay:' + actor.id, 30)
    return apiOk(await recoverWebhookDelivery(actor, input, admin))
  }
  if (resource === 'settlement-destinations' && !admin && ['POST','PATCH'].includes(method)) return apiOk(await saveSettlementDestination(actor, input), method === 'POST' ? 201 : 200)
  if (resource === 'settlement-batches' && admin && method === 'POST') {
    await limit('pay-settlement-batch:' + actor.id, 10)
    return apiOk(await decideSettlementBatch(actor, input))
  }
  throw new PayError('عملیات پشتیبانی نمی‌شود', 405)
}
