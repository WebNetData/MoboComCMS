import type { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { moduleGuard } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { generate, getAiConfig } from '@/modules/ai/server/generation'
import { assemblePrompt, cleanText, enhancementPrompt, inputChecklist, normalizeInput, PromptError } from '../domain/prompts'
import { policy, templateBySlug } from './queries'
import { isMember } from '@/modules/membership/server/membership'
import { promptTransaction } from './transaction'
import { pruneHistory } from './commands'

export async function generatePrompt(req: NextRequest, raw: Record<string, unknown>) {
  const input = normalizeInput(raw), settings = await policy(), actor = await requireUser(req)
  if (!actor && !settings.allowGuests) throw new PromptError('برای ساخت پرامپت وارد حساب شوید', 401)
  if (!(await rateLimitStrict(`prompts:generate:${clientIp(req.headers)}`, settings.minuteLimit, 60000)).ok) throw new PromptError('تعداد ساخت‌ها زیاد است؛ یک دقیقه بعد دوباره تلاش کنید', 429)
  if (actor && !(await rateLimitStrict(`prompts:member:${actor.id}`, settings.minuteLimit, 60000)).ok) throw new PromptError('تعداد ساخت‌ها زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
  const template = input.templateSlug ? await templateBySlug(input.templateSlug, db, { userId: actor?.id || null, member: await isMember(actor?.id) }) : null
  if (input.templateSlug && !template) throw new PromptError('الگوی انتخاب‌شده منتشر نشده یا حذف شده است', 404)
  if (template?.paywall && !template.paywall.open) throw new PromptError('برای استفاده از این الگو، ابتدا از صفحهٔ پرامپت آن را خریداری کنید', 402)
  if (template && template.kind !== input.kind) throw new PromptError('نوع الگو با نوع پرامپت یکی نیست')
  let output = assemblePrompt(input, template), model = '', engine = 'STRUCTURED'
  if (raw.engine === 'ai') {
    if (!actor) throw new PromptError('بهبود هوشمند برای اعضای واردشده فعال است', 401)
    if (!settings.aiEnabled || !await isModuleEnabled('ai-assistant')) throw new PromptError('بهبود هوشمند فعال نیست؛ از ساخت ساختاریافته استفاده کنید', 409)
    if (raw.consent !== true) throw new PromptError('برای ارسال ورودی به سرویس هوش مصنوعی، موافقت خود را اعلام کنید')
    if (!(await rateLimitStrict(`prompts:ai:${actor.id}`, settings.aiDailyLimit, 86400000)).ok) throw new PromptError('سقف بهبود هوشمند امروز شما پر شده است', 429)
    const config = await getAiConfig()
    if (!config.apiKey && config.provider !== 'custom') throw new PromptError('سرویس هوش مصنوعی آماده نیست؛ از ساخت ساختاریافته استفاده کنید', 503)
    try { const result = await generate(enhancementPrompt(input, output), config); output = cleanText(result.text, 24000); model = result.model; engine = 'AI' }
    catch { throw new PromptError('پاسخ سرویس هوش مصنوعی دریافت نشد؛ کمی بعد تلاش کنید یا حالت ساختاریافته را انتخاب کنید', 502) }
    if (output.length < 10) throw new PromptError('پاسخ سرویس کامل نبود؛ دوباره تلاش کنید', 502)
  } else if (raw.engine !== undefined && raw.engine !== 'structured') throw new PromptError('روش ساخت معتبر نیست')
  if (await moduleGuard('prompt-master', db)) throw new PromptError('پرامپت مستر فعال نیست', 404)
  if (actor && !(await requireUser(req))) throw new PromptError('نشست تغییر کرده؛ دوباره وارد حساب شوید', 401)
  const record = actor && raw.saveHistory !== false ? await promptTransaction(req, false, async (tx, current) => {
    if (current.id !== actor.id) throw new PromptError('نشست تغییر کرده؛ صفحه را تازه کنید', 401)
    const item = await tx.promptGeneration.create({ data: { userId: current.id, title: input.idea.slice(0,160), kind: input.kind, input: JSON.stringify(input), output, model, engine } })
    await pruneHistory(tx, current.id, (await policy(tx)).historyLimit)
    return item
  }) : null
  return { output, engine, model, input, checklist: inputChecklist(input), item: record }
}
