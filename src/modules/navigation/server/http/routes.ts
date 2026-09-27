import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { MEGA_SECTIONS, MegaMenuError, normalizeSectionConfig, type MegaSection } from '@/modules/navigation/domain/megamenu'
import { buildSectionBar, megaMenuAdminState, saveMegaConfig } from '@/modules/navigation/server/megamenu'

const guard = (req: NextRequest) => adminGuard(req, 'mega-menu', ['settings.manage'])

function failure(error: unknown) {
  if (error instanceof MegaMenuError) return err(error.message, error.status)
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
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (typeof body.preview === 'string') {
      if (!(MEGA_SECTIONS as readonly string[]).includes(body.preview)) return err('invalid section')
      const section = body.preview as MegaSection
      return ok({ preview: await buildSectionBar(section, { ...normalizeSectionConfig(body.config), enabled: true }) })
    }
    const config = await saveMegaConfig(body)
    await auditAdmin({ req, actor: g.admin, action: 'mega_menu.update', targetType: 'setting', targetId: 'site.megamenu.v1', metadata: { enabled: config.enabled } })
    return ok(await megaMenuAdminState())
  } catch (error) { return failure(error) }
}
