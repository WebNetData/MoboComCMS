import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { monitoringDays } from '../../domain/telemetry'
import { saveUsagePolicy, usageCost, usagePolicy, usageToday } from '../usage'
import { AI_PURPOSES } from '../../domain/routing'

const reply = (body: unknown) => { const response = ok(body); response.headers.set('Cache-Control', 'private, no-store'); return response }

/** GET /api/admin/ai/usage?days=1|7|30 → the ceilings, cache times and prices, today's use and the period's cost. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  try {
    const days = monitoringDays(req.nextUrl.searchParams.get('days'))
    const [policy, cost, today] = await Promise.all([usagePolicy(), usageCost(new Date(Date.now() - days * 86_400_000)), Promise.all(AI_PURPOSES.map(async p => [p.id, await usageToday(p.id)] as const))])
    return reply({ policy, purposes: AI_PURPOSES.map(p => ({ id: p.id, label: p.label })), today: Object.fromEntries(today), days, cost })
  } catch { return err('گزارش مصرف فعلاً در دسترس نیست؛ وضعیت پایگاه داده و مهاجرت نسخه را بررسی کنید', 503) }
}

/** PUT /api/admin/ai/usage { purposes, prices } → saved (audited) policy. */
export async function PUT(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  if (!(await rateLimitStrict(`ai:usage:${actor.id}`, 20, 60_000)).ok) return err('درخواست تنظیم زیاد است؛ کمی بعد تلاش کنید', 429)
  try { return reply({ policy: await saveUsagePolicy(await readJsonObject(req, 40_000), { req, actor }) }) }
  catch (error) { return error instanceof JsonBodyError ? err(error.message, error.status) : err('ذخیرهٔ تنظیمات مصرف انجام نشد؛ اطلاعات قبلی حفظ شد', 503) }
}
