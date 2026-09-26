import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { listExtensionAdminState, saveExtensionState } from '@/extensions/server/state'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok({ extensions: await listExtensionAdminState() })
}

export async function PATCH(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = String(body?.id || '')
  if (!id) return err('extension id is required')
  try {
    const state = await saveExtensionState(id, { enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined, settings: body?.settings && typeof body.settings === 'object' ? body.settings : undefined })
    return ok({ saved: true, state })
  } catch (error) { return err(error instanceof Error ? error.message : 'invalid extension state') }
}
