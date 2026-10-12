import { NextRequest, type NextResponse } from 'next/server'
import { requirePerm, getRawToken } from '@/modules/identity/server/access'
import { changeGlobalRestrictions, globalRestrictionHistory } from '@/modules/identity/server/restrictions'
import { RestrictionError } from '@/modules/identity/domain/restrictions'
import { err, ok } from '@/platform/http/response'
import { logEvent } from '@/platform/observability/logger'

type Context = { params: Promise<{ id: string }> }
function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
function failure(error: unknown) {
  if (error instanceof RestrictionError) return noStore(err(error.message, error.status))
  logEvent('error', 'identity.global_restriction_unavailable', { error: error instanceof Error ? error.name : 'unknown' })
  return noStore(err('سرویس محدودیت موقتاً در دسترس نیست', 503))
}

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const actor = await requirePerm(req, 'users.manage')
    if (!actor) return noStore(err('forbidden', 403))
    const userId = Number((await params).id), cursor = req.nextUrl.searchParams.get('before')
    return noStore(ok(await globalRestrictionHistory({ req, actor }, userId, cursor === null ? undefined : Number(cursor), (await getRawToken(req))?.authAt)))
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const actor = await requirePerm(req, 'users.manage')
    if (!actor) return noStore(err('forbidden', 403))
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(err('درخواست معتبر نیست', 400))
    const allowed = body.action === 'issue' ? ['action', 'reason', 'days', 'startsAt'] : ['action', 'id', 'reason']
    if (Object.keys(body).some(key => !allowed.includes(key)) || !['issue', 'revoke'].includes(body.action) || (body.startsAt !== undefined && typeof body.startsAt !== 'string')) return noStore(err('هدف یا عملیات معتبر نیست', 400))
    return noStore(ok(await changeGlobalRestrictions({ req, actor }, Number((await params).id), body, (await getRawToken(req))?.authAt)))
  } catch (error) { return failure(error) }
}
