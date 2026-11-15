import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { listExtensionAdminState, saveExtensionState } from '@/extensions/server/state'
import { saveBusinessSettings } from '@/modules/businesses/server/businesses'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { auditAdminStrict } from '@/platform/audit/server'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok({ extensions: await listExtensionAdminState() })
}

export async function PATCH(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  try {
    const body = await readJsonObject(req, 64000)
    const id = String(body.id || '')
    if (!id) return err('extension id is required')
    const input = { enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined, settings: body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings as Record<string, unknown> : undefined }
    const state = id === 'businesses' ? await saveBusinessSettings(req, admin, input) : await saveExtensionState(id, input, { beforeCommit: async (tx, before, after) => {
      const current = await requirePerm(req, 'settings.manage', tx)
      if (!current || current.id !== admin.id) throw new Error('دسترسی مدیریت تغییر کرده است')
      await auditAdminStrict({ req, actor: current, action: 'extensions.configure', targetType: 'extension', targetId: id, metadata: { beforeEnabled: before.enabled, requestedEnabled: after.enabled, settingKeys: Object.keys(input.settings || {}) } }, tx)
    } })
    return ok({ saved: true, state })
  } catch (error) { return err(error instanceof Error ? error.message : 'invalid extension state', error instanceof JsonBodyError ? error.status : 400) }
}
