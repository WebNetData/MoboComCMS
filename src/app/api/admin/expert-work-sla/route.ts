import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import { RevisionError } from '@/modules/content/server/revisions'
import { EXPERT_WORK_POLICY_FIELDS, isExpertWorkMinute } from '@/modules/support/domain/expert-work-sla'
import { expertWorkQueue, expertWorkSettings } from '@/modules/support/server/expert-work-sla'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'

async function expertWorkSla(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source')
  if (source !== 'store' && source !== 'form') return err('نوع درخواست معتبر نیست', 400)
  const disabled = await moduleGuard(source === 'store' ? 'store' : 'forms')
  if (disabled) return disabled
  const actor = await requirePerm(req, source === 'store' ? 'orders.manage' : 'cms.pages')
  if (!actor) return err('دسترسی مجاز نیست', 403)
  const rawAfter = req.nextUrl.searchParams.get('after')
  const after = rawAfter === null ? null : Number(rawAfter)
  if (after !== null && (!Number.isSafeInteger(after) || after < 1 || after > 2_147_483_647)) return err('شمارهٔ پیگیری صف معتبر نیست', 400)
  try {
    if (req.method === 'POST') {
      const origin = req.headers.get('origin')
      if (!origin || !originIsThisSite(origin, req.nextUrl.host)) return err('مبدأ درخواست معتبر نیست', 403)
      const input = await readJsonObject(req, 2048)
      if (!EXPERT_WORK_POLICY_FIELDS.every(field => isExpertWorkMinute(input[field])) || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) {
        return err('مهلت‌ها را به دقیقه و به‌صورت عدد صحیح وارد کنید', 422)
      }
      await expertWorkSettings(source).save(input, { req, actor, expected: input.revision })
    }
    return ok(await expertWorkQueue(source, req.method === 'POST' ? null : after))
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    if (error instanceof JsonBodyError) return err(error.message, error.status)
    throw error
  }
}

export { expertWorkSla as GET, expertWorkSla as POST }
