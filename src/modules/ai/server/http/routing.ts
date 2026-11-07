import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { AI_PROVIDERS } from '../../domain/ai'
import { isAiPurpose } from '../../domain/routing'
import { AiError } from '../error'
import { saveAiRoute } from '../routing'
import { aiReadiness } from '../readiness'

const reply = (value: unknown) => { const response = ok(value); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (error: unknown) => error instanceof AiError || error instanceof JsonBodyError ? err(error.message, error.status) : err('تنظیم کاربرد هوش مصنوعی انجام نشد؛ اطلاعات قبلی حفظ شد', 503)
export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  try { return reply({ routes: await aiReadiness(actor.id), providers: AI_PROVIDERS }) } catch (error) { return failure(error) }
}
export async function PUT(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  if (!(await rateLimitStrict(`ai:routing:${actor.id}`, 30, 60_000)).ok) return err('درخواست‌های تنظیم زیاد است؛ کمی بعد تلاش کنید', 429)
  try {
    const input = await readJsonObject(req, 8_000)
    if (!isAiPurpose(input.purpose)) throw new AiError('کاربرد هوش مصنوعی معتبر نیست')
    await saveAiRoute(input.purpose, input, { req, actor, action: 'ai.routing.update', targetType: 'setting', targetId: `ai.routing.v1:${input.purpose}` })
    return reply({ routes: await aiReadiness(actor.id) })
  } catch (error) { return failure(error) }
}
