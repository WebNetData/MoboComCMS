import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { auditAdmin, auditAdminStrict } from '@/platform/audit/server'
import { db } from '@/platform/database/prisma'
import { ArtistProfileError } from '@/modules/music/domain/artist-profile'
import { PersonProfileError } from '@/modules/cinema/domain/person-profile'
import { CelebrityError, adminCelebrities, celebrityProfile, joinCelebrities, saveCelebrityProfile, setCelebrityFeatured, splitCelebrity, syncCelebrities } from '@/modules/celebrities/server/celebrities'

// The sections' own checks speak for themselves (a picture address, a name taken, an English name for the address).
const failure = (error: unknown) => error instanceof CelebrityError || error instanceof ArtistProfileError || error instanceof PersonProfileError ? err(error.message, error.status)
  : error instanceof Error && /[\u0600-\u06FF]/.test(error.message) ? err(error.message, 422) : err('انجام نشد؛ دوباره تلاش کنید', 503)
const id = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0 }

/** GET /api/admin/celebrities — a cinema or a music manager sees the list. */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, null, ['cinema.manage', 'music.manage']); if ('response' in guard) return guard.response
  try {
    const one = id(req.nextUrl.searchParams.get('id'))
    return ok(one ? { profile: await celebrityProfile(one) } : await adminCelebrities(req.nextUrl.searchParams))
  } catch (error) { return failure(error) }
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
  try { input = await readJsonObject(req, 80000) } catch { return err('محتوای درخواست معتبر نیست', 422) }
  const action = String(input.action || '')
  if ((action === 'split' || action === 'join') && !(await requirePerm(req, 'cinema.manage') && await requirePerm(req, 'music.manage'))) return err('وصل یا جدا کردن چهره‌ها به دسترسی هر دو بخش فیلم و موسیقی نیاز دارد', 403)
  try {
    let result: unknown
    if (action === 'save') {
      // The profile is written into every section the person is in (or is added to): each needs its own permission.
      const current = id(input.id) ? await db.celebrity.findUnique({ where: { id: id(input.id) }, select: { cinemaPersonId: true, musicArtistId: true } }) : null
      if ((input.music === true || current?.musicArtistId) && !await requirePerm(req, 'music.manage')) return err('ویرایش این هنرمند در بخش موسیقی به دسترسی مدیریت موسیقی نیاز دارد', 403)
      if ((input.cinema === true || current?.cinemaPersonId) && !await requirePerm(req, 'cinema.manage')) return err('ویرایش این هنرمند در فیلم و سریال به دسترسی مدیریت فیلم و سریال نیاز دارد', 403)
      result = await saveCelebrityProfile(input, { id: guard.admin.id, email: guard.admin.email }, (tx, personId, created) => auditAdminStrict({ req, actor: guard.admin, action: created ? 'cinema.person.created' : 'cinema.person.updated', targetType: 'cinema-person', targetId: personId, metadata: { from: 'celebrities' } }, tx))
    } else if (action === 'feature') result = await setCelebrityFeatured(id(input.id), input.featured === true)
    else if (action === 'split') result = await splitCelebrity(id(input.id))
    else if (action === 'join') result = await joinCelebrities(id(input.id), id(input.otherId))
    else if (action === 'sync') result = await syncCelebrities()
    else return err('عملیات ناشناخته', 422)
    await auditAdmin({ req, actor: guard.admin, action: `celebrities.${action}`, targetType: 'celebrity', targetId: input.id ? String(input.id) : undefined, metadata: { otherId: input.otherId ?? null, featured: input.featured ?? null } })
    return ok({ result })
  } catch (error) { return failure(error) }
}
