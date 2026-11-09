import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { moduleGuard } from '@/extensions/server/modules'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { SCRIPT_PERMISSION } from '@/modules/site/server/builder'
import { getComponentLibrary, saveComponentLibrary } from '@/modules/site/server/components'

const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (e: unknown) => {
  const status = (e as { status?: number })?.status
  if (e instanceof JsonBodyError) return err(e.message, e.status)
  return typeof status === 'number' && status >= 400 && status < 500 ? err((e as Error).message, status) : err('کتابخانهٔ کامپوننت ذخیره نشد', 503)
}
const BUILDERS = ['cms.pages', 'cms.posts', 'cms.products', 'settings.manage'] as const

/** Everyone who builds pages may read the library to place components; only a site admin may change the code. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('page-builder'); if (off) return off
  let actor = null
  for (const perm of BUILDERS) { actor = await requirePerm(req, perm); if (actor) break }
  if (!actor) return err('دسترسی مجاز نیست', 403)
  try { const library = await getComponentLibrary(); return reply({ library, revision: sectionSettingsRevision(library), canEdit: !!await requirePerm(req, SCRIPT_PERMISSION) }) } catch (e) { return failure(e) }
}

export async function PUT(req: NextRequest) {
  const off = await moduleGuard('page-builder'); if (off) return off
  const site = process.env.NEXTAUTH_URL || req.url
  if (!URL.canParse(site) || mutationOrigin({ origin: req.headers.get('origin'), referer: req.headers.get('referer'), secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(site).host] }) !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
  const actor = await requirePerm(req, SCRIPT_PERMISSION)
  if (!actor) return err('ساخت و ویرایش کامپوننت فقط برای مدیر کل سایت مجاز است', 403)
  if (!(await rateLimitStrict(`site-components:save:${actor.id}`, 30, 60000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const expected = req.headers.get('if-match')
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return err('نسخهٔ کتابخانه لازم است؛ صفحه را تازه کنید', 428)
  try {
    const body = await readJsonObject(req, 4_000_000)
    if (!body.library || typeof body.library !== 'object') return err('کتابخانه معتبر نیست', 422)
    const library = await saveComponentLibrary(body.library, { req, actor, expected })
    return reply({ library, revision: sectionSettingsRevision(library) })
  } catch (e) { return failure(e) }
}
