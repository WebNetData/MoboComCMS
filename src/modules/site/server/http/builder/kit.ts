import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { updateJsonSetting } from '@/modules/settings/server'
import { KIT_KEY, validateKit } from '@/modules/site/domain/builder-kit'
import { getBuilderKit } from '@/modules/site/server/builder-kit'

// Anyone who builds pages reads the kit (the editor shows its colours); changing it changes every built page,
// so it takes the site settings permission.
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('forbidden', 403)
  return ok({ kit: await getBuilderKit() })
}

export async function PUT(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 8000) return err('Invalid kit')
  const kit = validateKit(body.kit)
  await updateJsonSetting(KIT_KEY, async (value) => { for (const key of Object.keys(value)) delete value[key]; Object.assign(value, kit) })
  await auditAdmin({ req, actor: admin, action: 'page.builder.kit.update', targetType: 'Setting', targetId: KIT_KEY, metadata: { colors: kit.colors.filter((color) => color.hex).length, buttons: kit.buttons, radius: kit.radius } })
  return ok({ kit })
}
