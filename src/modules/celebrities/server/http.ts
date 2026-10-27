import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { auditAdmin } from '@/platform/audit/server'
import { CelebrityError, adminCelebrities, joinCelebrities, setCelebrityFeatured, splitCelebrity, syncCelebrities } from '@/modules/celebrities/server/celebrities'

const failure = (error: unknown) => error instanceof CelebrityError ? err(error.message, error.status) : err('انجام نشد؛ دوباره تلاش کنید', 503)
const id = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0 }

/** GET /api/admin/celebrities — a cinema or a music manager sees the list. */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, null, ['cinema.manage', 'music.manage']); if ('response' in guard) return guard.response
  try { return ok(await adminCelebrities(req.nextUrl.searchParams)) } catch (error) { return failure(error) }
}

/**
 * POST /api/admin/celebrities { action, … } — featured by either manager; joining or splitting people touches both
 * sections, so it needs both permissions. Every change is audited.
 */
export async function POST(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const guard = await adminGuard(req, null, ['cinema.manage', 'music.manage']); if ('response' in guard) return guard.response
  if (!(await rateLimitStrict(`celebrities:${guard.admin.id}`, 60)).ok) return err('تعداد درخواست زیاد است؛ کمی صبر کنید', 429)
  let input: Record<string, unknown>
  try { input = await readJsonObject(req, 4000) } catch { return err('محتوای درخواست معتبر نیست', 422) }
  const action = String(input.action || '')
  if ((action === 'split' || action === 'join') && !(await requirePerm(req, 'cinema.manage') && await requirePerm(req, 'music.manage'))) return err('وصل یا جدا کردن چهره‌ها به دسترسی هر دو بخش فیلم و موسیقی نیاز دارد', 403)
  try {
    let result: unknown
    if (action === 'feature') result = await setCelebrityFeatured(id(input.id), input.featured === true)
    else if (action === 'split') result = await splitCelebrity(id(input.id))
    else if (action === 'join') result = await joinCelebrities(id(input.id), id(input.otherId))
    else if (action === 'sync') result = await syncCelebrities()
    else return err('عملیات ناشناخته', 422)
    await auditAdmin({ req, actor: guard.admin, action: `celebrities.${action}`, targetType: 'celebrity', targetId: input.id ? String(input.id) : undefined, metadata: { otherId: input.otherId ?? null, featured: input.featured ?? null } })
    return ok({ result })
  } catch (error) { return failure(error) }
}
