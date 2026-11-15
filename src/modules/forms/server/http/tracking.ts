import { createHmac } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { authSecret } from '@/platform/config/env'
import { err as apiError, ok } from '@/platform/http/response'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { verifyHuman } from '@/modules/identity/server/human-check'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { parseTrackingCode } from '../tracking-code'
import { RepairTrackingError, lookupRepair, requestRepairCode, trackingNumber, verifyRepairCode } from '../tracking'

const privateResponse = <T extends Response>(out: T) => { out.headers.set('Cache-Control', 'private, no-store'); out.headers.set('Referrer-Policy', 'no-referrer'); return out }
const response = (value: unknown) => privateResponse(ok(value))
const err = (...args: Parameters<typeof apiError>) => privateResponse(apiError(...args))
async function limit(key: string, count: number, ms: number) { if (!(await rateLimitStrict(key, count, ms)).ok) throw new RepairTrackingError('تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره تلاش کنید', 429) }

export async function POST(req: NextRequest) {
  if (!req.headers.get('origin') || mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: !!req.headers.get('cookie'), hosts: [req.headers.get('host'), req.nextUrl.host] }) !== 'allow') return err('مبدأ درخواست معتبر نیست', 403)
  try {
    const ip = clientIp(req.headers)
    await limit(`repair:tracking:ip:${ip}`, 30, 10 * 60_000)
    const body = await readJsonObject(req, 3000)
    if (!['lookup', 'request-code', 'verify-code'].includes(String(body.action))) throw new RepairTrackingError('روش پیگیری معتبر نیست')
    if (!await verifyHuman(body.humanCheck, req.headers, 'entry')) return err('بررسی امنیتی را کامل کنید', 400, { code: 'HUMAN_CHECK' })
    const number = body.action === 'lookup' ? parseTrackingCode(body.trackingCode)?.id : trackingNumber(body.number)
    if (!number) throw new RepairTrackingError('شمارهٔ پذیرش یا کد پیگیری معتبر نیست')
    await limit(`repair:tracking:receipt:${number}:${ip}`, 12, 10 * 60_000)
    if (body.action === 'lookup') return response({ request: await lookupRepair(body.trackingCode) })
    const phone = normalizeMobile(body.phone)
    if (!phone) throw new RepairTrackingError('شمارهٔ موبایل معتبر نیست')
    const contact = createHmac('sha256', authSecret()).update(`repair-tracking:${phone}`).digest('hex')
    if (body.action === 'request-code') {
      await limit(`repair:tracking:request:${number}:${contact}`, 1, 60_000)
      await limit(`repair:tracking:send:${contact}`, 5, 60 * 60_000)
      return response(await requestRepairCode({ number, phone, ip }))
    }
    await limit(`repair:tracking:verify:${number}:${contact}`, 10, 10 * 60_000)
    return response({ request: await verifyRepairCode({ number, phone, code: body.code }) })
  } catch (error) {
    if (error instanceof RepairTrackingError || error instanceof JsonBodyError) return err(error.message, error.status)
    return err('پیگیری در این لحظه ممکن نشد؛ دوباره تلاش کنید', 503)
  }
}
