import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { ok, err } from '@/platform/http/response'
import { editorAssistPlan } from '../editor-assist'
import { AiError } from '../error'

export async function POST(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'cms.posts'); if (!actor) return err('forbidden', 403)
  const siteUrl = process.env.NEXTAUTH_URL || req.url
  if (!URL.canParse(siteUrl)) return err('نشانی پیکربندی‌شدهٔ سایت معتبر نیست', 503)
  if (mutationOrigin({ origin: req.headers.get('origin'), referer: req.headers.get('referer'), secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(siteUrl).host] }) !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
  if (!(await rateLimitStrict(`ai:chat-web:${actor.id}`, 30, 600000)).ok) return err('درخواست‌های دستیار زیاد است؛ کمی بعد تلاش کنید', 429)
  try {
    const body = await readJsonObject(req, 300000)
    if (body.version !== 1 || !['prepare', 'complete'].includes(String(body.phase)) || Object.keys(body).some(k => !['version', 'phase', 'input', 'text'].includes(k))) throw new AiError('نسخه یا قالب درخواست معتبر نیست')
    if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)) throw new AiError('اطلاعات نوشته معتبر نیست')
    const input = body.input as Record<string, unknown>, limits: Record<string, number> = { mode: 10, content: 60000, title: 200, source: 40000, url: 2000, keywords: 300 }
    if (Object.entries(input).some(([k, v]) => !limits[k] || typeof v !== 'string' || v.length > limits[k])) throw new AiError('اطلاعات نوشته بیش از حد طولانی یا نامعتبر است')
    const plan = await editorAssistPlan(input)
    let result: unknown
    if (body.phase === 'prepare') result = { version: 1, prompt: `${plan.prompt.system}\n\n${plan.prompt.user}` }
    else {
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 60000) throw new AiError('پاسخ پل خالی یا بیش از حد بزرگ است')
      result = plan.parse({ text: body.text, model: 'ChatGPT web · personal browser', provider: 'chatgpt-web' })
    }
    const response = ok(result); response.headers.set('Cache-Control', 'private, no-store'); return response
  } catch (e) { return e instanceof AiError || e instanceof JsonBodyError ? err(e.message, e.status) : err('آماده‌سازی یا خواندن پاسخ پل انجام نشد', 503) }
}
