import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireContentScope } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { auditAdminStrict } from '@/platform/audit/server'
import { VocabularyError } from '@/modules/vocabulary/domain/vocabulary'
import { isVocabularySection, VOCABULARY_SECTIONS } from '@/modules/vocabulary/domain/registry'
import { adminLists, createEntry, deleteEntry, updateEntry } from '@/modules/vocabulary/server/vocabulary'

const failure = (error: unknown) => error instanceof VocabularyError ? err(error.message, error.status) : err('ذخیرهٔ فهرست ممکن نشد؛ دوباره تلاش کنید', 503)

/**
 * GET /api/admin/vocabulary?section=games — a section's managed lists with how many items use each entry. Whoever
 * may edit the section's items reads it (its author through the scope guard) to fill the item form.
 */
export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section')
  if (!isVocabularySection(section)) return err('بخش معتبر نیست', 404)
  const { module, manage, author } = VOCABULARY_SECTIONS[section]
  const off = await moduleGuard(module); if (off) return off
  if (!await requireContentScope(req, manage, author)) return err('forbidden', 403)
  const response = ok({ lists: await adminLists(section) }); response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** POST creates (`list`, `code`, …), PATCH changes (`id` in the body), DELETE removes (`&id=`): the section's manager only. */
async function write(req: NextRequest, mode: 'create' | 'update' | 'delete') {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const section = req.nextUrl.searchParams.get('section')
  if (!isVocabularySection(section)) return err('بخش معتبر نیست', 404)
  const { module, manage } = VOCABULARY_SECTIONS[section]
  const guard = await adminGuard(req, module, [manage]); if ('response' in guard) return guard.response
  if (!(await rateLimitStrict(`vocabulary:${guard.admin.id}`, 90)).ok) return err('تعداد درخواست زیاد است؛ کمی صبر کنید', 429)
  const audit = (tx: Parameters<typeof auditAdminStrict>[1], id: number, action: string, metadata: Record<string, unknown>) =>
    auditAdminStrict({ req, actor: guard.admin, action: `vocabulary.${action}`, targetType: 'vocabulary', targetId: id, metadata }, tx)
  try {
    if (mode === 'delete') {
      const id = Number(req.nextUrl.searchParams.get('id'))
      if (!Number.isSafeInteger(id) || id <= 0) return err('شناسه معتبر نیست', 422)
      return ok(await deleteEntry(section, id, audit))
    }
    let input: Record<string, unknown>
    try { input = await readJsonObject(req, 8000) } catch { return err('محتوای درخواست معتبر نیست', 422) }
    if (mode === 'create') return ok({ entry: await createEntry(section, input, audit) }, 201)
    const { id, ...changes } = input
    const entryId = Number(id)
    if (!Number.isSafeInteger(entryId) || entryId <= 0) return err('شناسه معتبر نیست', 422)
    return ok({ entry: await updateEntry(section, entryId, changes, audit) })
  } catch (error) { return failure(error) }
}
export const POST = (req: NextRequest) => write(req, 'create')
export const PATCH = (req: NextRequest) => write(req, 'update')
export const DELETE = (req: NextRequest) => write(req, 'delete')
