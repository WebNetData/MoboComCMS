import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { BUILDER_PAGE_ID, addUserTemplate, listUserTemplates, permFor, removeUserTemplate } from '@/modules/site/server/builder'
import { parseBuilderDoc } from '@/modules/site/domain/builder'
import { BUNDLED_TEMPLATES, POST_TEMPLATES } from '@/modules/site/domain/builder-templates'

const MAX_BODY = 400_000

function readPageId(value: unknown, fallback = 'home'): string | null {
  const id = String(value || '').trim() || fallback
  return BUILDER_PAGE_ID.test(id) ? id : null
}

export async function GET(req: NextRequest) {
  const pageId = readPageId(req.nextUrl.searchParams.get('pageId'))
  if (!pageId) return err('Invalid page ID')
  if (!await requirePerm(req, permFor(pageId))) return err('forbidden', 403)
  return ok({
    bundled: BUNDLED_TEMPLATES.map(({ id, fa, en, descFa, descEn, doc }) => ({ id, fa, en, descFa, descEn, sections: doc.sections.length, doc })),
    postBundled: POST_TEMPLATES.map(({ id, fa, en, descFa, descEn, doc }) => ({ id, fa, en, descFa, descEn, sections: doc.sections.length, doc })),
    mine: await listUserTemplates(),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const pageId = readPageId(body?.pageId)
  if (!pageId) return err('Invalid page ID')
  const admin = await requirePerm(req, permFor(pageId))
  if (!admin) return err('forbidden', 403)
  if (JSON.stringify(body?.doc ?? null).length > MAX_BODY) return err('Template too large', 413)
  let doc
  try { doc = parseBuilderDoc(body?.doc) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid document') }
  try {
    const result = await addUserTemplate({ name: String(body?.name || ''), nameEn: String(body?.nameEn || ''), kind: body?.kind === 'post' ? 'post' : 'page', doc })
    await auditAdmin({ req, actor: admin, action: 'page.builder.template.create', targetType: 'Setting', targetId: 'page.builder.templates.v1', metadata: { name: body?.name, kind: body?.kind === 'post' ? 'post' : 'page', pageId, sections: doc.sections.length } })
    return ok(result)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Could not save template')
  }
}

export async function DELETE(req: NextRequest) {
  const pageId = readPageId(req.nextUrl.searchParams.get('pageId'))
  if (!pageId) return err('Invalid page ID')
  const admin = await requirePerm(req, permFor(pageId))
  if (!admin) return err('forbidden', 403)
  const id = String(req.nextUrl.searchParams.get('id') || '')
  const result = await removeUserTemplate(id)
  if (!result.removed) return err('Template not found', 404)
  await auditAdmin({ req, actor: admin, action: 'page.builder.template.delete', targetType: 'Setting', targetId: id, metadata: { pageId } })
  return ok(result)
}
