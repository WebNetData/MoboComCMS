import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireContentScope, requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { EditorError, blockEditorEnabled, documentAuthorPermission, documentPermission, documentWrittenBy, isDocumentEntity, loadDocument, saveDocument } from '@/modules/editor/server/documents'

type Context = { params: Promise<{ entity: string; id: string }> }
const failure = (error: unknown) => (error instanceof EditorError ? err(error.message, error.status, { code: error.code, ...error.details }) : err('the document could not be saved', 500))
const target = async (context: Context) => { const { entity, id } = await context.params; const n = Number(id); return isDocumentEntity(entity) && Number.isInteger(n) && n > 0 ? { entity, id: n } : null }

/**
 * Who may open or save this item's document: a manager of its section, or the section author who created it.
 * Someone else's item is not there for an author.
 */
async function callerOf(req: NextRequest, at: { entity: Parameters<typeof documentPermission>[0]; id: number }) {
  const scope = await requireContentScope(req, documentPermission(at.entity), documentAuthorPermission(at.entity))
  if (!scope) return { response: err('forbidden', 403) }
  if (scope.authorId && !await documentWrittenBy(at.entity, at.id, scope.authorId)) return { response: err('not found', 404) }
  return { admin: scope.admin }
}

/** GET /api/admin/editor/:entity/:id — the item's document and the version to save against. */
export async function GET(req: NextRequest, context: Context) {
  const at = await target(context)
  if (!at) return err('not found', 404)
  const caller = await callerOf(req, at)
  if ('response' in caller) return caller.response
  try { return ok({ ...await loadDocument(at.entity, at.id), enabled: await blockEditorEnabled() }) } catch (error) { return failure(error) }
}

/** PUT /api/admin/editor/:entity/:id { document, updatedAt } — saves the document made from that version of the item. */
export async function PUT(req: NextRequest, context: Context) {
  const at = await target(context)
  if (!at) return err('not found', 404)
  const caller = await callerOf(req, at)
  if ('response' in caller) return caller.response
  const admin = caller.admin
  const body = await req.json().catch(() => null)
  try {
    const saved = await saveDocument({ ...at, document: body?.document, expectedUpdatedAt: body?.updatedAt, actor: { id: admin.id, email: admin.email, roleId: admin.roleId ?? null, permissions: admin.permissions ?? null } })
    await auditAdmin({ req, actor: admin, action: 'document.save', targetType: at.entity === 'pages' ? 'page' : 'post', targetId: at.id, metadata: { unsupported: saved.unsupported.length, migrated: saved.migrated } })
    return ok(saved)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/editor — whether the block editor is on (whoever edits pages or articles may ask). */
export async function settingsGET(req: NextRequest) {
  if (!(await requirePerm(req, 'cms.pages')) && !(await requireContentScope(req, 'cms.posts', 'journal.author'))) return err('forbidden', 403)
  return ok({ enabled: await blockEditorEnabled() })
}
