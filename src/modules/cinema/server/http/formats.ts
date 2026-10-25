import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireContentScope } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { auditAdminStrict } from '@/platform/audit/server'
import { CinemaFormatError } from '@/modules/cinema/domain/formats'
import { adminFormats, createFormat, deleteFormat, updateFormat } from '@/modules/cinema/server/formats'

const failure = (error: unknown) => error instanceof CinemaFormatError ? err(error.message, error.status) : err('ذخیرهٔ نوع ممکن نشد؛ دوباره تلاش کنید', 503)

/**
 * GET /api/admin/cinema/formats — the formats with their title counts. Whoever may edit titles reads it (an author
 * through the scope guard) to fill the title form's "type" list; formats are not anyone's own items.
 */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('cinema'); if (off) return off
  const scope = await requireContentScope(req, 'cinema.manage', 'cinema.author'); if (!scope) return err('forbidden', 403)
  const response = ok({ formats: await adminFormats() }); response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** POST creates, PATCH changes (`id` in the body), DELETE removes (`?id=`): the section manager only. */
async function write(req: NextRequest, mode: 'create' | 'update' | 'delete') {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const guard = await adminGuard(req, 'cinema', ['cinema.manage']); if ('response' in guard) return guard.response
  if (!(await rateLimitStrict(`cinema.formats:${guard.admin.id}`, 60)).ok) return err('تعداد درخواست زیاد است؛ کمی صبر کنید', 429)
  const audit = (tx: Parameters<typeof auditAdminStrict>[1], id: number, action: string, metadata: Record<string, unknown>) =>
    auditAdminStrict({ req, actor: guard.admin, action: `cinema.format.${action}`, targetType: 'cinema-format', targetId: id, metadata }, tx)
  try {
    if (mode === 'delete') {
      const id = Number(req.nextUrl.searchParams.get('id'))
      if (!Number.isSafeInteger(id) || id <= 0) return err('شناسه معتبر نیست', 422)
      return ok(await deleteFormat(id, audit))
    }
    let input: Record<string, unknown>
    try { input = await readJsonObject(req, 8000) } catch { return err('محتوای درخواست معتبر نیست', 422) }
    if (mode === 'create') return ok({ format: await createFormat(input, audit) }, 201)
    const id = Number(input.id)
    if (!Number.isSafeInteger(id) || id <= 0) return err('شناسه معتبر نیست', 422)
    return ok({ format: await updateFormat(id, input, audit) })
  } catch (error) { return failure(error) }
}
export const POST = (req: NextRequest) => write(req, 'create')
export const PATCH = (req: NextRequest) => write(req, 'update')
export const DELETE = (req: NextRequest) => write(req, 'delete')
