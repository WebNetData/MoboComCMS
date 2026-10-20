import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireContentScope, requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { hasPermission } from '@/modules/identity/rbac'
import { DOCUMENT_VERSION } from '@/modules/editor/domain/document'
import { checkDocument } from '@/modules/editor/domain/validate'
import { activeEditorRegistry } from '@/modules/editor/server/blocks/registry'
import { EditorError, blockEditorEnabled, documentAuthorPermission, documentPermission, documentWrittenBy, isDocumentEntity, loadDocument, saveDocument } from '@/modules/editor/server/documents'

type Context = { params: Promise<{ entity: string; id: string }> }
const failure = (error: unknown) => error instanceof EditorError ? err(error.message, error.status, { code: error.code, ...error.details }) : error instanceof JsonBodyError ? err(error.message, error.status) : (error as { code?: string }).code === 'P2034' ? err('محتوا هم‌زمان تغییر کرده است؛ دوباره بررسی کنید', 409, { code: 'CHANGED' }) : err('the document could not be saved', 500)
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
  try {
    const actor = caller.admin
    const canManagePatterns = actor.roleId == null || hasPermission(actor.permissions ?? [], documentPermission(at.entity))
    const response = ok({ ...await loadDocument(at.entity, at.id), enabled: await blockEditorEnabled(), canManagePatterns })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) { return failure(error) }
}

/** PUT /api/admin/editor/:entity/:id { document, updatedAt } — saves the document made from that version of the item. */
export async function PUT(req: NextRequest, context: Context) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const at = await target(context)
  if (!at) return err('not found', 404)
  const caller = await callerOf(req, at)
  if ('response' in caller) return caller.response
  const admin = caller.admin
  try {
    const body = await readJsonObject(req, 2_100_000)
    const saved = await saveDocument({ ...at, document: body.document, expectedUpdatedAt: body.updatedAt, actor: { id: admin.id, email: admin.email, roleId: admin.roleId ?? null, permissions: admin.permissions ?? null }, commit: async tx => { await auditAdminStrict({ req, actor: admin, action: 'document.save', targetType: at.entity === 'pages' ? 'page' : 'post', targetId: at.id }, tx) } })
    return ok(saved)
  } catch (error) { return failure(error) }
}

/** Guarded read-only module preview; it grants no authority over the referenced section. */
export async function POST_preview(req: NextRequest, context: Context) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const at = await target(context)
  if (!at) return err('not found', 404)
  const caller = await callerOf(req, at)
  if ('response' in caller) return caller.response
  try {
    if (!await blockEditorEnabled()) return err('ویرایشگر غیرفعال است', 404)
    await loadDocument(at.entity, at.id)
    const body = await readJsonObject(req, 80_000), registry = await activeEditorRegistry(), actor = caller.admin
    const permissions = (permission: string) => actor.permissions === null || !actor.permissions?.length ? actor.roleId == null : hasPermission(actor.permissions, permission)
    if (body.action === 'items') {
      const definition = registry.get(String(body.type || ''))
      if (!definition?.owner || !definition.dataSource) return err('بلوک معتبر نیست', 422)
      if (definition.permission && !permissions(definition.permission)) return err('forbidden', 403)
      const { moduleItemChoices } = await import('@/modules/editor/server/blocks/choices')
      const response = ok(await moduleItemChoices(definition, body.query, body.ids))
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    const checked = checkDocument({ version: DOCUMENT_VERSION, blocks: [body.block] }, registry, { permissions })
    const definition = registry.get(checked.document.blocks[0]?.type || '')
    if (!checked.ok || !(definition?.owner || definition?.dataSource?.kind === 'pattern') || checked.unsupported.length) return err('بلوک یا تنظیمات پیش‌نمایش معتبر نیست؛ ویرایشگر را تازه کنید', 422)
    const { publicDocumentHtml } = await import('@/modules/editor/server/blocks/render')
    const response = ok({ html: await publicDocumentHtml(checked.document, registry, true) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) { return failure(error) }
}

/** GET /api/admin/editor — whether the block editor is on (whoever edits pages or articles may ask). */
export async function settingsGET(req: NextRequest) {
  if (!(await requirePerm(req, 'cms.pages')) && !(await requireContentScope(req, 'cms.posts', 'journal.author'))) return err('forbidden', 403)
  return ok({ enabled: await blockEditorEnabled() })
}
