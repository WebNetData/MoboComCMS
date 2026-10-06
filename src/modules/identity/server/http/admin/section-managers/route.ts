import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { SITE_SECTIONS } from '@/modules/identity/domain/sections'
import { StaffError, listStaff, setSectionManager } from '@/modules/identity/server/section-managers'
import { auditAdmin } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { bulkSameOrigin } from '@/modules/content/server/bulk'

/** GET /api/admin/section-managers — the staff and the sections each manages. */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'roles.manage')) return err('forbidden', 403)
  return ok({ sections: SITE_SECTIONS, staff: await listStaff() })
}

/** POST /api/admin/section-managers { email | userId, sections: string[] } — an empty list removes the account from the staff. */
export async function POST(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'roles.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return err('داده نامعتبر است')
  try {
    const result = await setSectionManager(admin.id, { userId: body.userId, email: body.email }, body.sections)
    await auditAdmin({ req, actor: admin, action: 'staff.sections', targetType: 'user', targetId: result.id, metadata: { email: result.email, sections: result.sections, roleId: result.roleId } })
    return ok({ ...result, staff: await listStaff() })
  } catch (error) {
    if (error instanceof StaffError) return err(error.message, error.status)
    throw error
  }
}
