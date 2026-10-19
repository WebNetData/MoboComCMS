import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { requireContentScope, requirePerm } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { checkDocument } from '@/modules/editor/domain/validate'
import { moduleBlocks, MODULE_BLOCK_LIMIT } from '@/modules/editor/domain/module-blocks'
import { activeEditorRegistry } from './blocks/registry'
import { blockEditorEnabled, documentAuthorPermission, documentPermission, isDocumentEntity } from './documents'

/** Patterns and full templates share the editor's canonical document and section permission. */
export async function editorPatterns(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get('entity')
  if (!isDocumentEntity(entity)) return err('not found', 404)
  const permission = documentPermission(entity)
  const scope = await requireContentScope(req, permission, documentAuthorPermission(entity))
  if (!scope) return err('forbidden', 403)
  if (!await blockEditorEnabled()) return err('ویرایشگر غیرفعال است', 404)
  if (req.method === 'GET') {
    const rows = await db.editorPattern.findMany({ where: { entity }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, title: true, kind: true, contentDocument: true, updatedAt: true } })
    const response = ok({ patterns: rows.map(({ contentDocument, ...row }) => ({ ...row, document: JSON.parse(contentDocument) })) })
    response.headers.set('Cache-Control', 'private, no-store'); return response
  }
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, permission)
  if (!admin) return err('فقط مدیر همین بخش الگوها را مدیریت می‌کند.', 403)
  try {
    const body = await readJsonObject(req, 210_000)
    if (req.method === 'POST') {
      const title = typeof body.title === 'string' ? body.title.trim() : '', kind = body.kind
      if (!title || title.length > 100 || (kind !== 'pattern' && kind !== 'template')) return err('نام و نوع الگو معتبر نیست.', 422)
      const registry = await activeEditorRegistry(), checked = checkDocument(body.document, registry, { permissions: key => admin.roleId == null || hasPermission(admin.permissions ?? [], key) })
      if (!checked.ok || !checked.document.blocks.length || checked.unsupported.length || moduleBlocks(checked.document, registry).length > MODULE_BLOCK_LIMIT) return err('الگو باید شامل بلوک‌های معتبر و فعال باشد.', 422)
      const contentDocument = JSON.stringify(checked.document)
      if (Buffer.byteLength(contentDocument) > 200_000) return err('الگو بیش از حد بزرگ است.', 413)
      const created = await db.$transaction(async tx => {
        if (!await requirePerm(req, permission, tx)) throw new JsonBodyError('forbidden', 403)
        if (await tx.editorPattern.count({ where: { entity } }) >= 100) throw new JsonBodyError('حداکثر ۱۰۰ الگو برای هر بخش؛ ابتدا الگوهای اضافی را حذف کنید.', 422)
        const row = await tx.editorPattern.create({ data: { entity, kind, title, contentDocument, createdById: admin.id } })
        await auditAdminStrict({ req, actor: admin, action: 'editor.pattern.create', targetType: 'EditorPattern', targetId: row.id, metadata: { entity, kind } }, tx)
        return row
      }, { isolationLevel: 'Serializable' })
      return ok({ id: created.id, updatedAt: created.updatedAt }, 201)
    }
    if (req.method !== 'DELETE') return err('method not allowed', 405)
    const id = Number(body.id), updatedAt = typeof body.updatedAt === 'string' ? new Date(body.updatedAt) : null
    if (!Number.isSafeInteger(id) || id <= 0 || !updatedAt || !Number.isFinite(+updatedAt)) return err('نسخهٔ الگو الزامی است.', 400)
    await db.$transaction(async tx => {
      if (!await requirePerm(req, permission, tx)) throw new JsonBodyError('forbidden', 403)
      const removed = await tx.editorPattern.deleteMany({ where: { id, entity, updatedAt } })
      if (removed.count !== 1) throw new JsonBodyError('الگو تغییر کرده یا حذف شده است؛ دوباره بارگذاری کنید.', 409)
      await auditAdminStrict({ req, actor: admin, action: 'editor.pattern.delete', targetType: 'EditorPattern', targetId: id, metadata: { entity } }, tx)
    }, { isolationLevel: 'Serializable' })
    return ok({ deleted: true })
  } catch (error) {
    if (error instanceof JsonBodyError) return err(error.message, error.status)
    if ((error as { code?: string }).code === 'P2034') return err('تغییر هم‌زمان؛ دوباره تلاش کنید.', 409)
    console.error('[editor.patterns]', error); return err('الگو ذخیره نشد.', 500)
  }
}
