import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdminStrict } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { JsonSettingMutationError } from '@/modules/settings/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { MEGA_SECTIONS, MegaMenuError, normalizeSectionConfig, type MegaSection } from '@/modules/navigation/domain/megamenu'
import { buildSectionBar, megaMenuAdminState, saveMegaConfig } from '@/modules/navigation/server/megamenu'
import { recordRevision } from '@/modules/content/server/revisions'
import { configurationSnapshot } from '@/modules/settings/server/configuration-history'
import { originIsThisSite } from '@/platform/http/origin-policy'

const guard = (req: NextRequest) => adminGuard(req, 'mega-menu', ['settings.manage'])

function failure(error: unknown) {
  if (error instanceof MegaMenuError) return err(error.message, error.status)
  if (error instanceof JsonSettingMutationError) return err('تنظیمات ذخیره‌شده نیاز به بررسی دارد؛ تغییری اعمال نشد', 409)
  console.error('[mega-menu]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

/** GET /api/admin/mega-menu — settings plus a preview per section. */
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  return ok(await megaMenuAdminState())
}

/** POST /api/admin/mega-menu { enabled, sections: { software: {...} } } — or { preview: section, config } for an unsaved preview. */
export async function POST(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const g = await guard(req)
  if ('response' in g) return g.response
  const raw = await req.text()
  if (raw.length > 250000) return err('حجم تنظیمات بیش از حد مجاز است', 413)
  let body
  try { body = JSON.parse(raw) } catch { return err('ساختار تنظیمات معتبر نیست') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('ساختار تنظیمات معتبر نیست')
  try {
    if (typeof body.preview === 'string') {
      if (!(MEGA_SECTIONS as readonly string[]).includes(body.preview)) return err('invalid section')
      const section = body.preview as MegaSection
      return ok({ preview: await buildSectionBar(section, { ...normalizeSectionConfig(body.config), enabled: true }) })
    }
    await saveMegaConfig(body, { revision: req.headers.get('if-match') ?? undefined, beforeCommit: async (tx, config, previous) => {
      const actor = await requirePerm(req, 'settings.manage', tx)
      if (!actor) throw new MegaMenuError('دسترسی مجاز نیست', 403)
      await recordRevision({ entityType: 'settings-navigation', entityId: 1, before: configurationSnapshot(previous), after: configurationSnapshot(config), actor, client: tx, strict: true })
      await auditAdminStrict({ req, actor, action: 'mega_menu.update', targetType: 'setting', targetId: 'site.megamenu.v1', metadata: { enabled: config.enabled } }, tx)
    } })
    return ok(await megaMenuAdminState())
  } catch (error) { return failure(error) }
}
