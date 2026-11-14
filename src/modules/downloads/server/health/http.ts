import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject } from '@/platform/http/read-json'
import { healthSettings, saveHealthSettings } from './settings'
import { healthDashboard, syncHealthInventory, scheduleLinkHealth } from './worker'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { sectionSettingsSaveWith } from '@/modules/settings/server/http/section-history'

export async function GET(req: NextRequest) {
  const g = await adminGuard(req, 'download-guard', ['downloads.manage']); if ('response' in g) return g.response
  try { const settings = await healthSettings(); return ok({ settings, settingsRevision: sectionSettingsRevision(settings), links: await healthDashboard() }) } catch { return err('وضعیت پایش دریافت نشد؛ دوباره تلاش کنید', 503) }
}
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin'); if (!origin || !originIsThisSite(origin, req.headers.get('host') || req.nextUrl.host)) return err('forbidden origin', 403)
  const g = await adminGuard(req, 'download-guard', ['downloads.manage']); if ('response' in g) return g.response
  if (!(await rateLimitStrict(`download-health:${g.admin.id}`, 10)).ok) return err('کمی بعد تلاش کنید', 429)
  try {
    const body = await readJsonObject(req, 8192)
    if (body.action === 'save') {
      if (!req.headers.get('if-match')) return err('ابتدا تنظیمات فعلی را تازه‌سازی کنید', 409)
      return sectionSettingsSaveWith(req, g.admin, context => saveHealthSettings(body.settings, context), settings => ({ settings }))
    }
    if (body.action === 'refresh') { const inventory = await syncHealthInventory(); await scheduleLinkHealth(); return ok(inventory) }
    return err('عملیات معتبر نیست')
  } catch { return err('پایش انجام نشد؛ دوباره تلاش کنید', 503) }
}
