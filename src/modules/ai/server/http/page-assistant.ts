import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { AiError } from '../error'
import { pageAssistantAccess } from '../page-assistant/access'
import { answerPageAssistant } from '../page-assistant/service'

const response = (body: unknown) => { const result = ok(body); result.headers.set('Cache-Control', 'private, no-store'); return result }
const failure = (e: unknown) => e instanceof AiError || e instanceof JsonBodyError ? err(e.message, e.status) : err('دستیار فعلاً پاسخ نداد؛ تنظیم سرویس و اتصال را بررسی کنید', 503)
export async function GET(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get('kind'), id = req.nextUrl.searchParams.get('id')
    return response((await pageAssistantAccess(req, { path: req.nextUrl.searchParams.get('path'), ...(kind || id ? { target: { kind, id } } : {}) })).view)
  } catch (e) { return failure(e) }
}
export async function POST(req: NextRequest) {
  if (mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: true, hosts: [req.headers.get('host'), req.nextUrl.host] }) !== 'allow') return err('مبدأ درخواست معتبر نیست', 403)
  try {
    const input = await readJsonObject(req, 40_000), access = await pageAssistantAccess(req, input)
    if (!(await rateLimitStrict(`ai:page-assistant:${access.actor.id}`, 20, 10 * 60_000)).ok) return err('تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید', 429)
    return response(await answerPageAssistant(req, input))
  } catch (e) { return failure(e) }
}
