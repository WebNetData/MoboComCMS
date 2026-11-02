import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { rateLimitHit, clientIp } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { PopupError } from '@/modules/popups/domain/popups'
import { adminPopups, deletePopup, popupsFor, recordClick, recordSeen, restartPopup, savePopup, setPopupStatus } from '@/modules/popups/server/popups'

/** GET /api/popups — what this viewer may see now. Never stored: the answer depends on who asks. */
export async function GET_popups(req: NextRequest) {
  const off = await moduleGuard('popups')
  if (off) return off
  const response = ok({ popups: await popupsFor(await requireUser(req)) })
  response.headers.set('cache-control', 'private, no-store')
  return response
}

/** POST /api/popups/:id { action: 'seen' | 'click' } */
export async function POST_popup(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('popups')
  if (off) return off
  if (!rateLimitHit(`popups:${clientIp(req.headers)}`, 60, 60_000).ok) return err('too many requests', 429)
  const id = Number((await params).id), body = await req.json().catch(() => null)
  if (!Number.isSafeInteger(id) || id <= 0) return err('not found', 404)
  const user = await requireUser(req)
  if (body?.action === 'click') { await recordClick(id, user); return ok({ ok: true }) }
  if (body?.action === 'seen') return ok({ counted: await recordSeen(id, user) })
  return err('unknown action')
}

const PERMISSIONS = ['popups.manage', 'settings.manage']

/** GET /api/admin/popups */
export async function GET_admin(req: NextRequest) {
  const g = await adminGuard(req, 'popups', PERMISSIONS)
  if ('response' in g) return g.response
  return ok(await adminPopups())
}

/** POST /api/admin/popups { op: save | status | restart | delete, … } */
export async function POST_admin(req: NextRequest) {
  const g = await adminGuard(req, 'popups', PERMISSIONS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id) || 0
  try {
    switch (body?.op) {
      case 'save': {
        const saved = await savePopup(body.popup || {}, g.admin.id)
        await auditAdmin({ req, actor: g.admin, action: 'popup.save', targetType: 'popup', targetId: saved.id, metadata: { status: saved.status, audience: saved.audience } })
        return ok({ popup: { id: saved.id } })
      }
      case 'status': {
        const status = ['ACTIVE', 'PAUSED', 'DRAFT'].find((item) => item === body.status)
        if (!status || !await setPopupStatus(id, status as 'ACTIVE' | 'PAUSED' | 'DRAFT')) return err('پاپ‌آپ پیدا نشد', 404)
        await auditAdmin({ req, actor: g.admin, action: 'popup.status', targetType: 'popup', targetId: id, metadata: { status } })
        return ok({ ok: true })
      }
      case 'restart':
        await restartPopup(id)
        await auditAdmin({ req, actor: g.admin, action: 'popup.restart', targetType: 'popup', targetId: id })
        return ok({ ok: true })
      case 'delete':
        if (!await deletePopup(id)) return err('پاپ‌آپ پیدا نشد', 404)
        await auditAdmin({ req, actor: g.admin, action: 'popup.delete', targetType: 'popup', targetId: id })
        return ok({ ok: true })
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) {
    if (error instanceof PopupError) return err(error.message)
    throw error
  }
}
