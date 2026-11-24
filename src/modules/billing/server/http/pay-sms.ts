import type { NextRequest } from 'next/server'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { apiOk } from '@/modules/public-api/server/v1'
import { PayError } from '@/modules/billing/domain/pay'
import { receiveSmsNotice } from '@/modules/billing/server/pay/sms/intake'
import { payHttpFailure } from './pay'

export async function POST_sms(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host'))) throw new PayError('مبدأ درخواست مجاز نیست', 403)
    if (!(await rateLimitStrict('pay-sms-ip:' + clientIp(req.headers), 240, 60000)).ok || !(await rateLimitStrict('pay-sms-source:' + id, 240, 60000)).ok) throw new PayError('تعداد درخواست زیاد است', 429)
    if (Number(req.headers.get('content-length')) > 24000) throw new PayError('حجم پیام معتبر نیست', 413)
    const authorization = req.headers.get('authorization') || '', bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1] || ''
    const reader = req.body?.getReader(), chunks: Uint8Array[] = []; let size = 0
    if (!reader) throw new PayError('پیام دریافت نشد', 422)
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 24000) { await reader.cancel(); throw new PayError('حجم پیام معتبر نیست', 413) } chunks.push(part.value) } } finally { reader.releaseLock() }
    return apiOk(await receiveSmsNotice(id, bearer, Buffer.concat(chunks)))
  } catch (error) { return payHttpFailure(error) }
}
