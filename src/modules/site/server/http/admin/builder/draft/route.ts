import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import {
  BUILDER_PAGE_ID, clearBuilderDraft, permFor, saveBuilderDraft, sanitizeBuilderDoc,
} from '@/modules/site/server/builder'
import { parseBuilderDoc } from '@/modules/site/domain/builder'

const MAX_BODY = 600_000

function readPageId(value: unknown): string | null {
  const id = String(value || '').trim()
  return BUILDER_PAGE_ID.test(id) ? id : null
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const pageId = readPageId(body?.pageId)
  if (!pageId) return err('Invalid page ID')
  if (!await requirePerm(req, permFor(pageId))) return err('forbidden', 403)
  if (JSON.stringify(body?.doc ?? null).length > MAX_BODY) return err('Draft too large', 413)
  let doc
  try { doc = sanitizeBuilderDoc(parseBuilderDoc(body?.doc)) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid document') }
  await saveBuilderDraft(pageId, doc)
  return ok({ draft: true, pageId })
}

export async function DELETE(req: NextRequest) {
  const pageId = readPageId(req.nextUrl.searchParams.get('pageId'))
  if (!pageId) return err('Invalid page ID')
  if (!await requirePerm(req, permFor(pageId))) return err('forbidden', 403)
  await clearBuilderDraft(pageId)
  return ok({ cleared: true, pageId })
}
