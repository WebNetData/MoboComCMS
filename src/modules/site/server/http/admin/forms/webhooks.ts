import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import { FormsError } from '@/modules/forms/domain/forms'
import { listFormWebhookDeliveries, replayFormWebhook, testFormWebhook, WEBHOOK_STATUSES } from '@/modules/forms/server/webhooks'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { err, ok } from '@/platform/http/response'

const isId = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 2147483647
const failure = (error: unknown) => { if (error instanceof FormsError) return err(error.message, error.status); throw error }

export async function GET(req: NextRequest) {
  const disabled = await moduleGuard('forms')
  if (disabled) return disabled
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const query = req.nextUrl.searchParams
  const formId = Number(query.get('formId'))
  const before = query.has('before') ? Number(query.get('before')) : undefined
  const status = WEBHOOK_STATUSES.find(value => value === query.get('status'))
  if (!isId(formId) || (before !== undefined && !isId(before)) || (query.has('status') && !status)) return err('فیلتر تاریخچهٔ ارسال معتبر نیست')
  try { return ok(await listFormWebhookDeliveries(formId, { status, before })) } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest) {
  const disabled = await moduleGuard('forms')
  if (disabled) return disabled
  const actor = await requirePerm(req, 'cms.pages')
  if (!actor) return err('دسترسی مجاز نیست', 403)
  const raw = await req.text()
  if (raw.length > 4096) return err('درخواست بیش از حد بزرگ است', 413)
  let input: unknown
  try { input = JSON.parse(raw) } catch { return err('درخواست ارسال معتبر نیست') }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return err('درخواست ارسال معتبر نیست')
  const body = input as Record<string, unknown>
  if (!isId(body.formId) || (body.op !== 'test' && body.op !== 'replay')) return err('درخواست ارسال معتبر نیست')
  const { formId } = body
  try {
    if (body.op === 'test' && typeof body.targetIndex === 'number') {
      if (!(await rateLimitStrict(`forms:webhook:test:${actor.id}`, 12, 60_000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
      return ok(await testFormWebhook(req, actor, formId, body.targetIndex), 202)
    }
    if (body.op === 'replay' && isId(body.id)) {
      if (!(await rateLimitStrict(`forms:webhook:replay:${actor.id}`, 12, 60_000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
      return ok(await replayFormWebhook(req, actor, formId, body.id, body.reason, body.confirmed), 202)
    }
    return err('درخواست ارسال معتبر نیست')
  } catch (error) { return failure(error) }
}
