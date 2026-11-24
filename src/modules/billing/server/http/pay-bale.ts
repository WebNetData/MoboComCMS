import type { NextRequest } from 'next/server'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { apiOk } from '@/modules/public-api/server/v1'
import { PayError } from '@/modules/billing/domain/pay'
import { receiveBaleBankMessage } from '@/modules/billing/server/pay'
import { payHttpFailure } from './pay'

export async function POST_bale(req: NextRequest) {
  try {
    if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host'))) throw new PayError('مبدأ درخواست مجاز نیست', 403)
    if (!(await rateLimitStrict('pay-bale-ip:' + clientIp(req.headers), 240, 60000)).ok) throw new PayError('تعداد درخواست زیاد است', 429)
    if (Number(req.headers.get('content-length')) > 24000) throw new PayError('حجم پیام بله معتبر نیست', 413)
    const reader = req.body?.getReader(), chunks: Uint8Array[] = []; let size = 0
    if (!reader) throw new PayError('پیام دریافت نشد', 422)
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 24000) { await reader.cancel(); throw new PayError('حجم پیام بله معتبر نیست', 413) } chunks.push(part.value) }
    } finally { reader.releaseLock() }
    return apiOk(await receiveBaleBankMessage(req.headers.get('x-hub-signature-256') || '', req.headers.get('x-goomni-event-id') || '', Buffer.concat(chunks)))
  } catch (error) { return payHttpFailure(error) }
}
