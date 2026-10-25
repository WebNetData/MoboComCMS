import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireContentScope } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { auditAdminStrict } from '@/platform/audit/server'
import { VocabularyError } from '@/modules/games/domain/vocabulary'
import { adminVocabulary, createVocabulary, deleteVocabulary, updateVocabulary } from '@/modules/games/server/vocabulary'

const failure = (error: unknown) => error instanceof VocabularyError ? err(error.message, error.status) : err('ذخیرهٔ فهرست ممکن نشد؛ دوباره تلاش کنید', 503)

/**
 * GET /api/admin/games/vocabulary — platforms, stores, play modes and localisations with how many games use each.
 * Whoever may edit games reads it (an author through the scope guard) for the game form; the lists are nobody's own.
 */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('games'); if (off) return off
  const scope = await requireContentScope(req, 'games.manage', 'games.author'); if (!scope) return err('forbidden', 403)
  const response = ok({ lists: await adminVocabulary() }); response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** POST creates (`list`, `code`, …), PATCH changes (`id` in the body), DELETE removes (`?id=`): the games manager only. */
async function write(req: NextRequest, mode: 'create' | 'update' | 'delete') {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const guard = await adminGuard(req, 'games', ['games.manage']); if ('response' in guard) return guard.response
  if (!(await rateLimitStrict(`games.vocabulary:${guard.admin.id}`, 90)).ok) return err('تعداد درخواست زیاد است؛ کمی صبر کنید', 429)
  const audit = (tx: Parameters<typeof auditAdminStrict>[1], id: number, action: string, metadata: Record<string, unknown>) =>
    auditAdminStrict({ req, actor: guard.admin, action: `games.vocabulary.${action}`, targetType: 'game-vocabulary', targetId: id, metadata }, tx)
  try {
    if (mode === 'delete') {
      const id = Number(req.nextUrl.searchParams.get('id'))
      if (!Number.isSafeInteger(id) || id <= 0) return err('شناسه معتبر نیست', 422)
      return ok(await deleteVocabulary(id, audit))
    }
    let input: Record<string, unknown>
    try { input = await readJsonObject(req, 8000) } catch { return err('محتوای درخواست معتبر نیست', 422) }
    if (mode === 'create') return ok({ entry: await createVocabulary(input, audit) }, 201)
    const id = Number(input.id)
    if (!Number.isSafeInteger(id) || id <= 0) return err('شناسه معتبر نیست', 422)
    const { id: _id, ...changes } = input
    return ok({ entry: await updateVocabulary(id, changes, audit) })
  } catch (error) { return failure(error) }
}
export const POST = (req: NextRequest) => write(req, 'create')
export const PATCH = (req: NextRequest) => write(req, 'update')
export const DELETE = (req: NextRequest) => write(req, 'delete')
