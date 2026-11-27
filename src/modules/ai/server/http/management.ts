import type { NextRequest } from 'next/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { requireAdmin } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { err, ok } from '@/platform/http/response'
import { managementAdvice, type ManagementReport } from '../../domain/management'
import { withPersonalAi } from '../admin-context'
import { AiError, generate } from '../client'
import { collectManagement, managementSectionExists } from '../management'

const reply = (value: unknown) => {
  const response = ok(value)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

// Only bounded counts and fixed diagnostic labels enter the prompt.
const evidence = (report: ManagementReport) => report.sections.flatMap(section =>
  section.signals.filter(signal => signal.count > 0).map(({ id, label, count, detail, tone }) => ({ id, label, count, detail, tone })),
)

export async function GET(req: NextRequest) {
  if (!await isModuleEnabled('ai-assistant')) return err('هوش مصنوعی غیرفعال است', 404)
  const actor = await requireAdmin(req)
  if (!actor) return err('دسترسی مجاز نیست', 403)
  const report = await collectManagement(actor)
  if (!report.sections.length) return err('بخش فعالی برای دسترسی شما وجود ندارد', 403)
  return reply(report)
}

export async function POST(req: NextRequest) {
  try {
    if (!await isModuleEnabled('ai-assistant')) return err('هوش مصنوعی غیرفعال است', 404)
    const actor = await requireAdmin(req)
    if (!actor) return err('دسترسی مجاز نیست', 403)
    const origin = mutationOrigin({
      origin: req.headers.get('origin'), referer: req.headers.get('referer'),
      secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: Boolean(req.headers.get('cookie')),
      hosts: [req.nextUrl.host, URL.canParse(process.env.NEXTAUTH_URL || '') ? new URL(process.env.NEXTAUTH_URL!).host : null],
    })
    if (origin !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
    const body = await readJsonObject(req, 1000)
    const selected = body.section
    if (Object.keys(body).some(key => key !== 'section') ||
      (selected !== undefined && (typeof selected !== 'string' || !managementSectionExists(selected)))) {
      return err('بخش انتخاب‌شده معتبر نیست', 422)
    }
    if (!(await rateLimitStrict(`ai:management:${actor.id}`, 8, 600_000)).ok) return err('تعداد درخواست زیاد است', 429)
    const report = await collectManagement(actor, selected)
    if (!report.sections.length) return err('دسترسی به این بخش مجاز نیست', 403)
    const facts = evidence(report)
    if (!facts.length) return err('در این بررسی، موردی برای تحلیل پیدا نشد', 409)
    const result = await withPersonalAi(actor.id, () => generate({
      system: 'فقط شیء JSON با کلید advice بنویس. advice آرایه‌ای از شیءهای signalId و text است. به فارسی برای هر نشانه یک گام مشخص پیشنهاد بده. فقط از شواهد داده‌شده استفاده کن. علت قطعی، شناسهٔ تازه، لینک یا اقدامی که انجام شده ادعا نکن.',
      user: JSON.stringify(facts),
      json: true,
      maxTokens: 1400,
    }), 'operations')
    const advice = managementAdvice(result.text, new Set(facts.map(fact => fact.id)))
    const current = await requireAdmin(req)
    if (current?.id !== actor.id || !await isModuleEnabled('ai-assistant')) return err('دسترسی تغییر کرده است', 403)
    const refreshed = await collectManagement(current, selected)
    if (JSON.stringify(evidence(refreshed)) !== JSON.stringify(facts)) return err('شواهد تغییر کرده‌اند. گزارش را دوباره بررسی کنید.', 409)
    await auditAdmin({ req, actor: current, action: 'ai.management.review', targetType: 'site', targetId: selected || 'all',
      metadata: { model: result.model, signals: facts.length } })
    return reply({ checkedAt: report.checkedAt, model: result.model, advice })
  } catch (error) {
    if (error instanceof JsonBodyError || error instanceof AiError) return err(error.message, error.status)
    return err('تحلیل هوش مصنوعی فعلاً در دسترس نیست', 503)
  }
}
