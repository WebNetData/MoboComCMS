import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getSiteConfig, SITE_KEY } from '@/modules/site/config/store'
import { validateSite } from '@/modules/site/config/validation'
import { bundledThemes } from '@/themes/registry'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { createHash } from 'node:crypto'
import { getSiteConfigFrom } from '@/modules/site/config/store'
import { updateJsonSetting, JsonSettingMutationError } from '@/modules/settings/server'
import { auditAdminStrict } from '@/platform/audit/server'
const revision = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  const config = await getSiteConfig()
  return ok({ config, revision: revision(config), themes: bundledThemes })
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
  try {
    await updateJsonSetting(SITE_KEY, async (stored, tx) => {
      const actor = await requirePerm(req, 'settings.manage', tx)
      if (!actor) throw new JsonSettingMutationError('forbidden')
      const current = await getSiteConfigFrom(tx, true)
      if (req.headers.has('if-match') && req.headers.get('if-match') !== revision(current)) throw new JsonSettingMutationError('stale')
      Object.keys(stored).forEach(key => delete stored[key])
      Object.assign(stored, value)
      await auditAdminStrict({ req, actor, action: 'site.update', targetType: 'setting', targetId: SITE_KEY }, tx)
    })
    return ok({ saved: true, revision: revision(value) })
  } catch (error) {
    if (error instanceof JsonSettingMutationError && error.message === 'forbidden') return err('دسترسی مجاز نیست', 403)
    if (error instanceof JsonSettingMutationError || (error instanceof Error && error.message.includes('invalid stored'))) return err('تنظیمات تغییر کرده یا نیاز به بررسی دارد؛ صفحه را تازه‌سازی کنید و دوباره ذخیره کنید', 409)
    console.error('[site.update]', error)
    return err('ذخیره نشد؛ دوباره تلاش کنید', 500)
  }
}
