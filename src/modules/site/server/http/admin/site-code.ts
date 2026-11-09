import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { SCRIPT_PERMISSION } from '@/modules/site/server/builder'
import { getSiteCode, saveSiteCode } from '@/modules/site/server/site-code'

const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (e: unknown) => {
  const status = (e as { status?: number })?.status
  if (e instanceof JsonBodyError) return err(e.message, e.status)
  return typeof status === 'number' && status >= 400 && status < 500 ? err((e as Error).message, status) : err('ذخیرهٔ کد سفارشی انجام نشد', 503)
}

/** Site-wide code runs for every visitor, so it needs the same permission as the builder's script code. */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, SCRIPT_PERMISSION)) return err('فقط مدیر کل سایت به کد سفارشی دسترسی دارد', 403)
  try { const settings = await getSiteCode(); return reply({ settings, revision: sectionSettingsRevision(settings), disabledByServer: process.env.SITE_CODE_DISABLED === '1' }) } catch (e) { return failure(e) }
}

/** PUT { settings } with If-Match: the revision read; a stale page keeps its edits and gets 409. */
export async function PUT(req: NextRequest) {
  const site = process.env.NEXTAUTH_URL || req.url
  if (!URL.canParse(site) || mutationOrigin({ origin: req.headers.get('origin'), referer: req.headers.get('referer'), secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(site).host] }) !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
  const actor = await requirePerm(req, SCRIPT_PERMISSION)
  if (!actor) return err('فقط مدیر کل سایت به کد سفارشی دسترسی دارد', 403)
  if (!(await rateLimitStrict(`site-code:save:${actor.id}`, 30, 60000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const expected = req.headers.get('if-match')
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return err('نسخهٔ تنظیمات لازم است؛ صفحه را تازه کنید', 428)
  try {
    const body = await readJsonObject(req, 2_000_000)
    if (!body.settings || typeof body.settings !== 'object') return err('تنظیمات معتبر نیست', 422)
    const settings = await saveSiteCode(body.settings, { req, actor, expected })
    return reply({ settings, revision: sectionSettingsRevision(settings) })
  } catch (e) { return failure(e) }
}
