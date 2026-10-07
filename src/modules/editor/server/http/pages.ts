import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { EditorError, blockEditorEnabled, loadPageDocument, savePageDocument, setBlockEditorEnabled } from '@/modules/editor/server/documents'

const failure = (error: unknown) => (error instanceof EditorError ? err(error.message, error.status, { code: error.code, ...error.details }) : err('the document could not be saved', 500))
const idOf = async (context: { params: Promise<{ id: string }> }) => { const id = Number((await context.params).id); return Number.isInteger(id) && id > 0 ? id : 0 }

/** GET /api/admin/editor/pages/:id — the page's document and the version to save against. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await requirePerm(req, 'cms.pages')) return err('forbidden', 403)
  const id = await idOf(context)
  if (!id) return err('invalid id')
  try { return ok({ ...await loadPageDocument(id), enabled: await blockEditorEnabled() }) } catch (error) { return failure(error) }
}

/** PUT /api/admin/editor/pages/:id { document, updatedAt } — saves the document made from that version of the page. */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requirePerm(req, 'cms.pages')
  if (!admin) return err('forbidden', 403)
  const id = await idOf(context)
  if (!id) return err('invalid id')
  const body = await req.json().catch(() => null)
  try {
    const saved = await savePageDocument({ id, document: body?.document, expectedUpdatedAt: body?.updatedAt, actor: { id: admin.id, email: admin.email, roleId: admin.roleId ?? null, permissions: admin.permissions ?? null } })
    await auditAdmin({ req, actor: admin, action: 'page.document.save', targetType: 'page', targetId: id, metadata: { unsupported: saved.unsupported.length, migrated: saved.migrated } })
    return ok(saved)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/editor — whether the block editor is on. POST { enabled } turns it on or off (site settings). */
export async function settingsGET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('forbidden', 403)
  return ok({ enabled: await blockEditorEnabled() })
}

export async function settingsPOST(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') return err('enabled must be true or false')
  const saved = await setBlockEditorEnabled(body.enabled)
  await auditAdmin({ req, actor: admin, action: 'editor.blocks.switch', targetType: 'setting', targetId: 'editor.blocks', metadata: saved })
  return ok(saved)
}
