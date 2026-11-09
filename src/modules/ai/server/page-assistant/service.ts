import type { NextRequest } from 'next/server'
import { pageAssistantPrompt, pageTurns, type PageAssistantAnswer } from '../../domain/page-assistant'
import { defaultEngineeringPolicy } from '../../domain/engineering'
import { engineeringKnowledge } from '../engineering/knowledge'
import { generate } from '../generation'
import { withPersonalAi } from '../admin-context'
import { AiError } from '../error'
import { pageAssistantAccess } from './access'
import { pageAssistantRecord } from './record'

export async function answerPageAssistant(req: NextRequest, input: Record<string, unknown>): Promise<PageAssistantAnswer> {
  if (typeof input.instruction !== 'string' || input.instruction.trim().length < 3 || input.instruction.length > 2000) throw new AiError('درخواست باید بین ۳ تا ۲۰۰۰ نویسه باشد', 422)
  if (input.selectedText !== undefined && (typeof input.selectedText !== 'string' || input.selectedText.length > 4000)) throw new AiError('متن انتخابی باید حداکثر ۴۰۰۰ نویسه باشد', 422)
  if (input.includeRecord !== undefined && typeof input.includeRecord !== 'boolean') throw new AiError('انتخاب اطلاعات رکورد معتبر نیست', 422)
  const access = await pageAssistantAccess(req, input)
  if (input.expectedActorId !== access.actor.id) throw new AiError('حساب گفتگو تغییر کرده است؛ زمینهٔ صفحه را دوباره دریافت کنید', 409)
  if (input.includeRecord && !access.view.target) throw new AiError('ابتدا یک مورد ذخیره‌شده را برای ویرایش باز کنید', 422)
  const record = input.includeRecord ? await pageAssistantRecord(access.view.target, access.authorId) : null
  const knowledge = engineeringKnowledge(input.instruction, { ...defaultEngineeringPolicy(), contextChars: 8000 }, [])
  const prompt = pageAssistantPrompt({ view: access.view, instruction: input.instruction.trim(), selectedText: typeof input.selectedText === 'string' ? input.selectedText : '', record, turns: pageTurns(input.turns), knowledge: knowledge.context })
  const result = await withPersonalAi(access.actor.id, () => generate(prompt, undefined, access.view.purpose), access.view.purpose)
  // Reload current role/module/author scope and meaningful source fields, never replay inference.
  const current = await pageAssistantAccess(req, input)
  if (current.actor.id !== access.actor.id || JSON.stringify(current.view) !== JSON.stringify(access.view)) throw new AiError('دسترسی یا صفحه تغییر کرده است؛ دوباره بررسی کنید', 409)
  if (input.includeRecord && JSON.stringify(await pageAssistantRecord(current.view.target, current.authorId)) !== JSON.stringify(record)) throw new AiError('اطلاعات مورد انتخابی تغییر کرده است؛ پاسخ قبلی نمایش داده نشد', 409)
  const text = result.text.trim()
  if (!text || text.length > 6000) throw new AiError('پاسخ دستیار کامل یا در محدودهٔ مجاز نبود؛ درخواست خودکار تکرار نشد', 502)
  return { reply: text, context: current.view, model: result.model, provider: result.provider, advisory: true }
}
