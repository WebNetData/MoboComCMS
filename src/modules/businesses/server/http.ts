import { NextRequest } from 'next/server'
import { ok, err } from '@/platform/http/response'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { BusinessError } from '../domain/businesses'
import { ReviewError } from '@/modules/reviews/domain/reviews'
import { MarketplaceError } from '@/modules/marketplace/domain/marketplace'
import { businessDirectory, businessAdminData } from './queries'
import { saveBusinessProfile } from './commands'
import { submitBusinessExperience, decideBusinessExperience, respondToBusinessExperience } from './experiences'
import { requestBusiness, decideBusinessRequest } from './requests'

function failure(error: unknown) {
  if (error instanceof BusinessError || error instanceof ReviewError || error instanceof MarketplaceError) return err(error.message, error.status)
  console.error('[businesses] command failed')
  return err('عملیات انجام نشد؛ دوباره تلاش کنید', 500)
}
async function input(req: NextRequest) {
  if (Number(req.headers.get('content-length')) > 12000) throw new BusinessError('درخواست بیش از حد بزرگ است', 413)
  const reader = req.body?.getReader(), chunks: Uint8Array[] = []
  let size = 0
  if (!reader) throw new BusinessError('درخواست معتبر نیست')
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 12000) { await reader.cancel(); throw new BusinessError('درخواست بیش از حد بزرگ است', 413) }
    chunks.push(part.value)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  let value
  try { value = JSON.parse(raw) } catch { throw new BusinessError('درخواست معتبر نیست') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BusinessError('درخواست معتبر نیست')
  return value as Record<string, unknown>
}
export async function GET(req: NextRequest) {
  try { return ok(await businessDirectory(Object.fromEntries(req.nextUrl.searchParams))) } catch (error) { return failure(error) }
}
export async function POST(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('برای ثبت تجربه وارد حساب شوید', 401)
  if (!rateLimitHit(`business-write:${user.id}`, 30, 3_600_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  try {
    const body = await input(req)
    if (body.action === 'review') return ok(await submitBusinessExperience(req, body))
    if (body.action === 'reply') return ok(await respondToBusinessExperience(req, body))
    if (body.action === 'request') return ok(await requestBusiness(req, body))
    return err('عملیات معتبر نیست', 400)
  } catch (error) { return failure(error) }
}
export async function GET_admin(req: NextRequest) {
  const guard = await adminGuard(req, 'businesses', ['businesses.manage'])
  if ('response' in guard) return guard.response
  try { return ok(await businessAdminData(Object.fromEntries(req.nextUrl.searchParams))) } catch (error) { return failure(error) }
}
export async function POST_admin(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const guard = await adminGuard(req, 'businesses', ['businesses.manage'])
  if ('response' in guard) return guard.response
  try {
    const body = await input(req)
    if (body.action === 'profile.save') return ok(await saveBusinessProfile(req, body))
    if (body.action === 'request.decide') return ok(await decideBusinessRequest(req, body))
    if (body.action === 'approve' || body.action === 'reject') return ok(await decideBusinessExperience(req, body))
    return err('عملیات معتبر نیست', 400)
  } catch (error) { return failure(error) }
}
