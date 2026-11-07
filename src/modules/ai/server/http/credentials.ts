import type { NextRequest } from 'next/server'
import { ok, err } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { credentialPoolsView, saveCredentialPool } from '../credentials'
import { AiError } from '../error'
const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (error: unknown) => error instanceof AiError || error instanceof JsonBodyError ? err(error.message, error.status) : err('خواندن یا ذخیرهٔ کلیدها انجام نشد؛ تنظیمات حفظ شد', 503)
export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  try { return reply(await credentialPoolsView()) } catch (e) { return failure(e) }
}
export async function PUT(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  if (mutationOrigin({ origin: req.headers.get('origin'), referer: req.headers.get('referer'), secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(process.env.NEXTAUTH_URL || req.url).host] }) !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
  if (!(await rateLimitStrict(`ai:credentials:${actor.id}`, 20, 60000)).ok) return err('درخواست‌های تنظیم زیاد است', 429)
  try { await saveCredentialPool(await readJsonObject(req, 16000), { req, actor, action: 'ai.credentials.update', targetType: 'setting', targetId: 'ai.credentials.v1' }); return reply(await credentialPoolsView()) } catch (e) { return failure(e) }
}
