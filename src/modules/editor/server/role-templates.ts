/**
 * Default templates per role (owner decision 2026-10-20): a section manager picks, for each staff role that writes in
 * the section, the full template its new pages or articles start from. Only a new item with no body yet starts from
 * it, and only in the browser: nothing is stored until the writer saves, and they can start blank instead.
 */
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { requirePerm } from '@/modules/identity/server/access'
import { hasPermission, parsePermissions } from '@/modules/identity/rbac'
import type { MoboComDocument } from '@/modules/editor/domain/document'
import { readDocument } from '@/modules/editor/domain/validate'
import { activeEditorRegistry } from './blocks/registry'
import { blockEditorEnabled, documentAuthorPermission, documentPermission, isDocumentEntity, type DocumentEntity } from './documents'

/** Roles that can open this section's documents at all: its managers and, where the section has them, its authors. */
function writesIn(entity: DocumentEntity, permissions: string) {
  const granted = parsePermissions(permissions), author = documentAuthorPermission(entity)
  return hasPermission(granted, documentPermission(entity)) || (!!author && hasPermission(granted, author))
}

/** The template a new item of this section starts from for this staff member, or null (no role, no default, or it no longer reads cleanly). */
export async function startingTemplate(entity: DocumentEntity, roleId: number | null | undefined): Promise<{ id: number; title: string; document: MoboComDocument } | null> {
  if (roleId == null) return null
  const row = await db.editorRoleTemplate.findUnique({ where: { entity_roleId: { entity, roleId } }, include: { pattern: true } })
  if (!row || row.pattern.entity !== entity || row.pattern.kind !== 'template') return null
  const read = readDocument(row.pattern.contentDocument, await activeEditorRegistry())
  // A template that has blocks this site no longer has (a module switched off) is not offered half-read.
  if (read.unsupported.length || read.issues.length || !read.document.blocks.length) return null
  return { id: row.pattern.id, title: row.pattern.title, document: read.document }
}

/** GET/PUT /api/admin/editor/role-templates?entity=pages|posts — the section manager's table of role defaults. */
export async function roleTemplates(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get('entity')
  if (!isDocumentEntity(entity)) return err('not found', 404)
  const permission = documentPermission(entity)
  if (req.method !== 'GET' && (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host))) return err('forbidden', 403)
  const admin = await requirePerm(req, permission)
  if (!admin) return err('فقط مدیر همین بخش قالب پیش‌فرض نقش‌ها را تعیین می‌کند.', 403)
  if (!await blockEditorEnabled()) return err('ویرایشگر غیرفعال است', 404)
  if (req.method === 'GET') {
    const [roles, templates, assignments] = await Promise.all([
      db.role.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, nameFa: true, permissions: true } }),
      db.editorPattern.findMany({ where: { entity, kind: 'template' }, orderBy: { title: 'asc' }, select: { id: true, title: true } }),
      db.editorRoleTemplate.findMany({ where: { entity }, select: { roleId: true, patternId: true } }),
    ])
    const response = ok({
      roles: roles.filter((role) => writesIn(entity, role.permissions)).map((role) => ({ id: role.id, name: role.nameFa || role.name })),
      templates,
      assignments: Object.fromEntries(assignments.map((row) => [row.roleId, row.patternId])),
    })
    response.headers.set('Cache-Control', 'private, no-store'); return response
  }
  if (req.method !== 'PUT') return err('method not allowed', 405)
  try {
    const body = await readJsonObject(req, 2_000)
    const roleId = Number(body.roleId), patternId = body.patternId == null ? null : Number(body.patternId)
    if (!Number.isSafeInteger(roleId) || roleId <= 0 || (patternId !== null && (!Number.isSafeInteger(patternId) || patternId <= 0))) return err('نقش یا قالب معتبر نیست.', 422)
    const result = await db.$transaction(async (tx) => {
      if (!await requirePerm(req, permission, tx)) throw new JsonBodyError('forbidden', 403)
      const role = await tx.role.findUnique({ where: { id: roleId }, select: { id: true, permissions: true } })
      if (!role || !writesIn(entity, role.permissions)) throw new JsonBodyError('این نقش در این بخش نمی‌نویسد.', 422)
      const before = await tx.editorRoleTemplate.findUnique({ where: { entity_roleId: { entity, roleId } } })
      if (patternId === null) await tx.editorRoleTemplate.deleteMany({ where: { entity, roleId } })
      else {
        const template = await tx.editorPattern.findFirst({ where: { id: patternId, entity, kind: 'template' }, select: { id: true } })
        if (!template) throw new JsonBodyError('قالب پیدا نشد؛ فقط «قالب کامل» همین بخش پذیرفته می‌شود.', 422)
        await tx.editorRoleTemplate.upsert({ where: { entity_roleId: { entity, roleId } }, create: { entity, roleId, patternId, updatedById: admin.id }, update: { patternId, updatedById: admin.id } })
      }
      await auditAdminStrict({ req, actor: admin, action: 'editor.role-template.set', targetType: 'Role', targetId: roleId, metadata: { entity, from: before?.patternId ?? null, to: patternId } }, tx)
      return { roleId, patternId }
    }, { isolationLevel: 'Serializable' })
    return ok(result)
  } catch (error) {
    if (error instanceof JsonBodyError) return err(error.message, error.status)
    if ((error as { code?: string }).code === 'P2034') return err('هم‌زمان تغییر کرد؛ دوباره امتحان کنید.', 409)
    throw error
  }
}
