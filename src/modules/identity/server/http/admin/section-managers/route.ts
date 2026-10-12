import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { AUTHOR_SECTIONS, SITE_SECTIONS } from '@/modules/identity/domain/sections'
import { StaffError, listStaff, setSectionAuthor, setSectionManager } from '@/modules/identity/server/section-managers'
import { auditAdmin } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { bulkSameOrigin } from '@/modules/content/server/bulk'

/** GET /api/admin/section-managers — the staff and the sections each manages. */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'roles.manage')) return err('forbidden', 403)
  return ok({ sections: SITE_SECTIONS, authorSections: AUTHOR_SECTIONS.map(({ id, label, hint }) => ({ id, label, hint })), staff: await listStaff() })
}

/**
 * POST /api/admin/section-managers { email | userId, sections: string[], as?: 'author' } — an empty list removes the
 * account from the staff. With `as: 'author'` the sections are the ones the account writes in, not the ones it manages.
 */
export async function POST(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'roles.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return err('داده نامعتبر است')
  try {
    if (body.as !== undefined && body.as !== 'author' && body.as !== 'manager') return err('داده نامعتبر است')
    const author = body.as === 'author'
    const result = await (author ? setSectionAuthor : setSectionManager)(admin.id, { userId: body.userId, email: body.email }, body.sections)
    await auditAdmin({ req, actor: admin, action: author ? 'staff.authors' : 'staff.sections', targetType: 'user', targetId: result.id, metadata: { email: result.email, sections: result.sections, roleId: result.roleId } })
    return ok({ ...result, staff: await listStaff() })
  } catch (error) {
    if (error instanceof StaffError) return err(error.message, error.status)
    throw error
  }
}
