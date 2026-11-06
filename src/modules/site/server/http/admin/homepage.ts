import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { ThemeIndexError } from '@/modules/site/server/theme-templates'
import { createHomepageDraft, homepageSettings, selectHomepage } from '@/modules/site/server/homepage-settings'

const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (e: unknown) => e instanceof ThemeIndexError || e instanceof JsonBodyError ? err(e.message, e.status) : err('تغییر طرح انجام نشد؛ طرح فعلی و مدارک قبلی حفظ شده‌اند', 503)
export async function GET(req: NextRequest) { try { return reply(await homepageSettings(req)) } catch (e) { return failure(e) } }
async function mutate(req: NextRequest, create: boolean) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  try { const input = await readJsonObject(req, 4000); return reply(create ? await createHomepageDraft(req, input.presetId) : await selectHomepage(req, input)) } catch (e) { return failure(e) }
}
export const POST = (req: NextRequest) => mutate(req, true)
export const PUT = (req: NextRequest) => mutate(req, false)
