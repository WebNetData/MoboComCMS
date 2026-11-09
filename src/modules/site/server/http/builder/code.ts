import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { auditAdminStrict } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { withPersonalAi } from '@/modules/ai/server/admin-context'
import { generate, AiError } from '@/modules/ai/server/client'
import { getSiteSeo } from '@/modules/site/server/seo'
import { SCRIPT_PERMISSION } from '@/modules/site/server/builder'
import { CodeAssistError, codePrompt, parseCodeRequest, parseCodeResult, scanCode } from '@/modules/ai/domain/code-assist'

const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }

/**
 * Code for the builder's advanced (script-running) code, so it needs the same permission as saving such code.
 * phase `generate` asks the configured API; `prepare`/`complete` let the admin's personal Chat web do the work.
 * It returns text for review only: nothing is saved, published or run on the server.
 */
export async function POST(req: NextRequest) {
  const site = process.env.NEXTAUTH_URL || req.url
  if (!URL.canParse(site) || mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(site).host] }) !== 'allow') return err('درخواست باید از همین سایت ارسال شود', 403)
  const off = await moduleGuard('page-builder') || await moduleGuard('ai-assistant')
  if (off) return off
  const actor = await requirePerm(req, SCRIPT_PERMISSION)
  if (!actor) return err('ساخت کد اجرایی فقط برای مدیر کل سایت مجاز است', 403)
  const raw = await req.text()
  if (raw.length > 400000) return err('درخواست بیش از اندازه بزرگ است', 413)
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return err('درخواست معتبر نیست') }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !['generate', 'prepare', 'complete'].includes(String(body.phase))) return err('درخواست معتبر نیست')
  if (body.phase !== 'complete' && !(await rateLimitStrict(`builder:code:${actor.id}`, 20, 10 * 60000)).ok) return err('سقف درخواست ساخت کد رسیده است؛ چند دقیقه صبر کنید', 429)
  try {
    const request = parseCodeRequest(body.input)
    const prompt = codePrompt(request, (await getSiteSeo('fa')).name)
    if (body.phase === 'prepare') return reply({ prompt: `${prompt.system}\n\n${prompt.user}` })
    let text: string, model: string
    if (body.phase === 'complete') {
      if (typeof body.text !== 'string' || !body.text.trim()) throw new CodeAssistError('پاسخ Chat وب خالی است')
      text = body.text; model = 'Chat وب · مرورگر شخصی'
    } else {
      const result = await withPersonalAi(actor.id, () => generate({ ...prompt, maxTokens: 12000, json: true }), 'builder')
      text = result.text; model = result.model
    }
    const code = parseCodeResult(text)
    await auditAdminStrict({ req, actor, action: 'builder.code.proposed', targetType: 'builder', targetId: request.target, metadata: { model, transport: body.phase === 'complete' ? 'chat-web' : 'api', bytes: code.html.length + code.css.length + code.js.length } })
    return reply({ code, warnings: scanCode(code, request.scope), model, proposalOnly: true })
  } catch (failure) {
    if (failure instanceof AiError || failure instanceof CodeAssistError) return err(failure.message, failure.status)
    return err('کد دریافت نشد؛ خواسته یا اتصال هوش مصنوعی را بررسی کنید', 422)
  }
}
