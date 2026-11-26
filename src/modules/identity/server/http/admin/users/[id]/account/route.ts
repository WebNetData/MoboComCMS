import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { requirePerm } from '@/modules/identity/server/access'
import { adminAccountView, changeAdminAccount, AdminAccountError } from '@/modules/identity/server/admin-account'
type Context = { params: Promise<{ id: string }> }
function failure(error: unknown) {
  if (error instanceof AdminAccountError || error instanceof JsonBodyError) return err(error.message, error.status)
  if (['P2002','P2034'].includes(String((error as { code?: string }).code))) return err('حساب یا اطلاعات تماس هم‌زمان تغییر کرده؛ پیش‌نویس را نگه دارید و اطلاعات را تازه کنید', 409)
  return err('تغییر حساب ثبت نشد؛ اطلاعات حفظ شده است', 503)
}
export async function GET(req: NextRequest, ctx: Context) {
  const id = Number((await ctx.params).id)
  if (!Number.isSafeInteger(id) || id < 1) return err('شناسه معتبر نیست', 422)
  try { const result = ok(await adminAccountView(req, id)); result.headers.set('cache-control','private, no-store'); return result } catch (error) { return failure(error) }
}
export async function PATCH(req: NextRequest, ctx: Context) {
  if (mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: true, hosts: [req.headers.get('host'), req.nextUrl.host] }) !== 'allow') return err('مبدأ درخواست معتبر نیست', 403)
  const actor = await requirePerm(req, 'users.manage')
  if (!actor) return err('دسترسی ندارید', 403)
  if (!(await rateLimitStrict(`admin:user-account:${actor.id}`,20,600000)).ok) return err('تعداد درخواست زیاد است؛ کمی بعد تلاش کنید',429)
  const id = Number((await ctx.params).id)
  if (!Number.isSafeInteger(id) || id < 1) return err('شناسه معتبر نیست',422)
  try { const result=ok(await changeAdminAccount(req,id,await readJsonObject(req,5000))); result.headers.set('cache-control','private, no-store'); return result } catch(error) { return failure(error) }
}
