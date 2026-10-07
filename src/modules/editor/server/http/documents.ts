import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { EditorError, blockEditorEnabled, documentPermission, isDocumentEntity, loadDocument, saveDocument } from '@/modules/editor/server/documents'

type Context = { params: Promise<{ entity: string; id: string }> }
const failure = (error: unknown) => (error instanceof EditorError ? err(error.message, error.status, { code: error.code, ...error.details }) : err('the document could not be saved', 500))
const target = async (context: Context) => { const { entity, id } = await context.params; const n = Number(id); return isDocumentEntity(entity) && Number.isInteger(n) && n > 0 ? { entity, id: n } : null }

/** GET /api/admin/editor/:entity/:id — the item's document and the version to save against. */
export async function GET(req: NextRequest, context: Context) {
  const at = await target(context)
  if (!at) return err('not found', 404)
  if (!await requirePerm(req, documentPermission(at.entity))) return err('forbidden', 403)
  try { return ok({ ...await loadDocument(at.entity, at.id), enabled: await blockEditorEnabled() }) } catch (error) { return failure(error) }
}

/** PUT /api/admin/editor/:entity/:id { document, updatedAt } — saves the document made from that version of the item. */
export async function PUT(req: NextRequest, context: Context) {
  const at = await target(context)
  if (!at) return err('not found', 404)
  const admin = await requirePerm(req, documentPermission(at.entity))
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  try {
    const saved = await saveDocument({ ...at, document: body?.document, expectedUpdatedAt: body?.updatedAt, actor: { id: admin.id, email: admin.email, roleId: admin.roleId ?? null, permissions: admin.permissions ?? null } })
    await auditAdmin({ req, actor: admin, action: 'document.save', targetType: at.entity === 'pages' ? 'page' : 'post', targetId: at.id, metadata: { unsupported: saved.unsupported.length, migrated: saved.migrated } })
    return ok(saved)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/editor — whether the block editor is on (whoever edits pages or articles may ask). */
export async function settingsGET(req: NextRequest) {
  if (!(await requirePerm(req, 'cms.pages')) && !(await requirePerm(req, 'cms.posts'))) return err('forbidden', 403)
  return ok({ enabled: await blockEditorEnabled() })
}
