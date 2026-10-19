import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { listExtensionAdminState, saveExtensionState } from '@/extensions/server/state'
import { saveBusinessSettings } from '@/modules/businesses/server/businesses'
import { originIsThisSite } from '@/platform/http/origin-policy'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok({ extensions: await listExtensionAdminState() })
}

export async function PATCH(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = String(body?.id || '')
  if (!id) return err('extension id is required')
  try {
    const input = { enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined, settings: body?.settings && typeof body.settings === 'object' ? body.settings : undefined }
    const state = id === 'businesses' ? await saveBusinessSettings(req, admin, input) : await saveExtensionState(id, input)
    return ok({ saved: true, state })
  } catch (error) { return err(error instanceof Error ? error.message : 'invalid extension state') }
}
