import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { db } from '@/platform/database/prisma'
import { getSiteConfig, SITE_KEY } from '@/modules/site/config/store'
import { validateSite } from '@/modules/site/config/validation'
import { bundledThemes } from '@/themes/registry'
import { extensionCatalog } from '@/extensions/generated/catalog'
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  return ok({ config: await getSiteConfig(), themes: bundledThemes })
}
export async function PUT(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  const raw = await req.text()
  if (raw.length > 250000) return err('حجم تنظیمات بیش از حد مجاز است', 413)
  let value: unknown
  try { value = JSON.parse(raw) } catch { return err('ساختار تنظیمات معتبر نیست') }
  if (!validateSite(value)) return err('تنظیمات، لینک‌ها یا قالب معتبر نیستند')
  if (![...bundledThemes, ...value.themes].some(t => t.id === value.themeId)) return err('قالب انتخابی نصب نشده است')
  if (value.themes.some(t => bundledThemes.some(b => b.id === t.id))) return err('شناسه قالب با قالب داخلی تداخل دارد')
  // Legacy keys are retained for old site documents, but runtime activation is
  // exclusively owned by the extension manager.
  if (Object.keys(value.plugins).some(id => !extensionCatalog.some(p => p.id === id))) return err('افزونه در پروژه ثبت نشده است')
  await db.setting.upsert({ where: { key: SITE_KEY }, create: { key: SITE_KEY, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
  return ok({ saved: true })
}
