import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { PackageError } from '@/modules/packages/domain/format'
import { PackageAuthorityError } from '@/modules/packages/server/store'
import { applySolutionPack, previewSolutionPack, SolutionPlanConflict } from '@/modules/packages/server/solution-packs'

type Context = { params: Promise<{ id: string }> }
function failure(error: unknown) {
  if (error instanceof PackageAuthorityError) return err('forbidden', 403)
  if (error instanceof SolutionPlanConflict) return err(error.message, 409)
  if (error instanceof JsonBodyError) return err(error.message, error.status)
  if (error instanceof PackageError) return err(error.message, 400)
  return err('دریافت یا اعمال بسته ناموفق بود؛ دوباره تلاش کنید.', 500)
}

export async function GET(req: NextRequest, { params }: Context) {
  const actor = await requirePerm(req, 'settings.manage')
  if (!actor) return err('forbidden', 403)
  try { return ok({ plan: await previewSolutionPack((await params).id, { req, actor }) }) }
  catch (error) { return failure(error) }
}

export async function POST(req: NextRequest, { params }: Context) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const actor = await requirePerm(req, 'settings.manage')
  if (!actor) return err('forbidden', 403)
  try {
    const body = await readJsonObject(req, 2048)
    if (Object.keys(body).some(key => key !== 'token') || typeof body.token !== 'string') return err('توکن پیش‌نمایش لازم است.')
    return ok(await applySolutionPack((await params).id, body.token, { req, actor }))
  } catch (error) { return failure(error) }
}
