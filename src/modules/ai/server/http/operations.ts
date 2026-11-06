import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { AiError } from '../error'
import { AiOperationError } from '../../domain/operations'
import { decideOperation, operationsActor, operationsView, proposeOperations } from '../operations/service'
import { saveOperationsPolicy } from '../operations/policy'
import { runDirectOperations } from '../operations/direct'

const response = (value: unknown) => { const out = ok(value); out.headers.set('Cache-Control', 'private, no-store'); return out }
function failure(error: unknown) {
  if (error instanceof AiError || error instanceof AiOperationError || error instanceof JsonBodyError) return err(error.message, error.status)
  const e = error as { code?: string; status?: number; message?: string }
  if (e?.code === 'P2002') return err('نشانی یا رکورد تکراری است؛ پیشنهاد تازه بگیرید', 409)
  if (e?.code === 'P2034') return err('عملیات هم‌زمان تغییر کرد؛ نتیجهٔ ثبت‌شده را تازه کنید', 409)
  // Owner errors are bounded UI messages, never model/provider exceptions or credentials.
  if (Number.isInteger(e?.status) && Number(e.status) >= 400 && Number(e.status) < 500) return err(String(e.message || 'این تغییر مجاز نیست').slice(0, 250), e.status)
  return err('عملیات انجام نشد؛ اطلاعات ثبت‌شده را تازه و دوباره بررسی کنید', 503)
}
export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  try { return response(await operationsView(req)) } catch (e) { return failure(e) }
}
export async function POST(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const access = await operationsActor(req); if (!access) return err('forbidden', 403)
  if (!(await rateLimitStrict(`ai:operations:requests:${access.actor.id}`, 90, 10 * 60_000)).ok) return err('تعداد درخواست‌های بررسی زیاد است؛ کمی بعد تلاش کنید', 429)
  try {
    const input = await readJsonObject(req, 10_000)
    if (input.action === 'propose' || input.action === 'run-direct') {
      if (!(await rateLimitStrict(`ai:operations:plan:${access.actor.id}`, 10, 10 * 60_000)).ok) return err('سقف تولید پیشنهاد پر شده است؛ پیشنهادهای فعلی را بررسی کنید', 429)
      return response(input.action === 'run-direct' ? await runDirectOperations(req, input) : await proposeOperations(req, input.instruction))
    }
    if (input.action === 'approve' || input.action === 'reject') return response(await decideOperation(req, input))
    return err('unknown action', 404)
  } catch (e) { return failure(e) }
}
export async function PUT(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  if (!(await rateLimitStrict(`ai:operations-policy:${actor.id}`, 20, 60_000)).ok) return err('درخواست‌های تنظیم زیاد است', 429)
  try { const input = await readJsonObject(req, 4_000); await saveOperationsPolicy(input.policy, { req, actor, action: 'ai.operation.policy', targetType: 'setting', targetId: 'ai.operations.v1' }); return response(await operationsView(req)) } catch (e) { return failure(e) }
}
