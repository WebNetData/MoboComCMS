import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { FormsError } from '../../domain/forms'
import { changeRepairWork, getRepairWork } from '../repair-work'

const protect = <T extends Response>(response: T) => { response.headers.set('Cache-Control', 'private, no-store'); return response }
async function staff(req: NextRequest) {
  const builder = await requirePerm(req, 'cms.pages'), handler = builder || await requirePerm(req, 'forms.handle')
  return handler ? { user: handler, actor: { id: handler.id, builder: !!builder, handler: true } } : null
}
const failure = (error: unknown) => protect(error instanceof FormsError || error instanceof JsonBodyError ? err(error.message, error.status) : err('دریافت یا ثبت اطلاعات تعمیر ممکن نشد', 503))
export async function GET(req: NextRequest) {
  const access = await staff(req)
  if (!access) return protect(err('دسترسی مجاز نیست', 403))
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) return protect(err('شمارهٔ پذیرش معتبر نیست'))
  try { return protect(ok(await getRepairWork(id, access.actor))) } catch (error) { return failure(error) }
}
export async function PATCH(req: NextRequest) {
  if (!req.headers.get('origin') || mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: !!req.headers.get('cookie'), hosts: [req.headers.get('host'), req.nextUrl.host] }) !== 'allow') return protect(err('مبدأ درخواست معتبر نیست', 403))
  const access = await staff(req)
  if (!access) return protect(err('دسترسی مجاز نیست', 403))
  if (!(await rateLimitStrict(`repair:staff:${access.user.id}:${clientIp(req.headers)}`, 30, 60000)).ok) return protect(err('کمی بعد دوباره تلاش کنید', 429))
  try {
    const body = await readJsonObject(req, 6000), id = Number(body.id)
    if (!Number.isSafeInteger(id) || id <= 0) throw new FormsError('شمارهٔ پذیرش معتبر نیست')
    return protect(ok(await changeRepairWork(id, access.actor, body, { req, actor: access.user })))
  } catch (error) { return failure(error) }
}
