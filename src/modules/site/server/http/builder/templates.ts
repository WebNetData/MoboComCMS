import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import {
  BUILDER_PAGE_ID, SCRIPT_PERMISSION, addUserTemplate, docUsesScripts, listUserTemplates, permFor, removeUserTemplate,
} from '@/modules/site/server/builder'
import { BUNDLED_TEMPLATES, POST_TEMPLATES, type BundledTemplate } from '@/modules/site/domain/builder-templates'
import { parseBuilderDoc } from '@/modules/site/domain/builder'

const MAX_BODY = 600_000

function readPageId(value: unknown): string | null {
  const id = String(value || '').trim()
  return BUILDER_PAGE_ID.test(id) ? id : null
}

const summary = (template: BundledTemplate) => ({
  id: template.id,
  fa: template.fa,
  en: template.en,
  descFa: template.descFa,
  descEn: template.descEn,
  sections: template.doc.sections.length,
  doc: template.doc,
})

export async function GET(req: NextRequest) {
  const pageId = readPageId(req.nextUrl.searchParams.get('pageId'))
  if (!pageId) return err('Invalid page ID')
  if (!await requirePerm(req, permFor(pageId))) return err('forbidden', 403)
  return ok({
    bundled: BUNDLED_TEMPLATES.map(summary),
    postBundled: POST_TEMPLATES.map(summary),
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
  const name = String(body?.name || '').trim()
  if (!name) return err('Template name is required')
  let doc
  try { doc = parseBuilderDoc(body?.doc) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid document') }
  if (!doc.sections.length && doc.mode !== 'code') return err('The page is empty — add at least one section first')
  if (docUsesScripts(doc) && !await requirePerm(req, SCRIPT_PERMISSION)) {
    return err('Advanced code (JavaScript) requires the site settings permission', 403)
  }
  const kind = body?.kind === 'post' && pageId.startsWith('post-') ? 'post' : 'page'
  try {
    const result = await addUserTemplate({ name, nameEn: String(body?.nameEn || ''), doc, kind })
    await auditAdmin({ req, actor: admin, action: 'page.builder.template.create', targetType: 'Setting', targetId: pageId, metadata: { name, kind, sections: doc.sections.length } })
    return ok(result)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Could not save the template')
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
