import type { NextRequest } from 'next/server'
import { requireAdmin } from '@/modules/identity/server/access'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { err, ok } from '@/platform/http/response'
import { decideReview, ReviewError, reviewHistory, reviewNow, saveReviewSchedule } from '../management-review'

const reply = (value: unknown) => {
  const response = ok(value)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

const failure = (error: unknown) => {
  if (error instanceof ReviewError || error instanceof JsonBodyError) return err(error.message, error.status)
  if (['P2002', 'P2034'].includes((error as { code?: string })?.code || '')) return err('گزارش هم‌زمان تغییر کرده است. دوباره بارگیری کنید.', 409)
  return err('تاریخچهٔ بررسی فعلاً در دسترس نیست', 503)
}

export async function GET(req: NextRequest) {
  try { return reply(await reviewHistory(req)) }
  catch (error) { return failure(error) }
}

const commands: Record<string, { fields: string[]; run: (req: NextRequest, body: Record<string, unknown>) => Promise<void> }> = {
  schedule: { fields: ['cadence', 'version'], run: (req, body) => saveReviewSchedule(req, body.cadence, body.version) },
  snapshot: { fields: [], run: reviewNow },
  decide: { fields: ['id', 'signalId', 'version', 'decision', 'outcome'], run: decideReview },
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin')
    if (!origin || !originIsThisSite(origin, req.nextUrl.host)) return err('درخواست باید از همین سایت باشد', 403)
    const actor = await requireAdmin(req)
    if (!actor) return err('دسترسی مجاز نیست', 403)
    if (!(await rateLimitStrict(`ai:management-reviews:${actor.id}`, 24, 60_000)).ok) return err('تعداد درخواست زیاد است', 429)
    const body = await readJsonObject(req, 1800)
    const command = typeof body.action === 'string' && Object.hasOwn(commands, body.action) ? commands[body.action] : null
    if (!command || Object.keys(body).some(key => key !== 'action' && !command.fields.includes(key))) return err('درخواست بررسی معتبر نیست', 422)
    await command.run(req, body)
    return reply(await reviewHistory(req))
  } catch (error) {
    return failure(error)
  }
}
