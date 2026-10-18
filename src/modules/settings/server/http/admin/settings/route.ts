import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { requirePerm } from '@/modules/identity/server/access'
import { generalSettingsState, generalSettingsRevision, saveGeneralSettings } from '@/modules/settings/server'
import { RevisionError } from '@/modules/content/server/revisions'

async function answer() {
  const state = await generalSettingsState()
  const response = ok(Object.fromEntries(Object.entries(state).filter(([, value]) => value !== null)))
  response.headers.set('ETag', generalSettingsRevision(state))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return answer()
}
export async function PATCH(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 80_000) } catch { return err('درخواست معتبر نیست', 422) }
  try {
    await saveGeneralSettings(body, { req, actor: admin }, req.headers.get('if-match'))
    return answer()
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    if ((error as { code?: string }).code === 'P2034' || (error as { code?: string }).code === 'P2002') return err('تنظیمات هم‌زمان تغییر کرده است؛ دوباره بررسی کنید', 409)
    console.error('[settings.general]', error)
    return err('ذخیره نشد؛ دوباره تلاش کنید', 500)
  }
}
