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
import { reportBusinessExperience, decideBusinessReport } from './reports'
import { decidePurchaseProof, withdrawPurchaseProof } from './proofs'
import { businessTrustAdmin } from './trust-admin'

function failure(error: unknown) {
  if (error instanceof BusinessError || error instanceof ReviewError || error instanceof MarketplaceError) return err(error.message, error.status)
  console.error('[businesses] command failed')
  return err('Ø¹Ù…Ù„ÛŒØ§Øª Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯Ø› Ø¯ÙˆØ¨Ø§Ø±Ù‡ ØªÙ„Ø§Ø´ Ú©Ù†ÛŒØ¯', 500)
}
async function input(req: NextRequest) {
  if (Number(req.headers.get('content-length')) > 12000) throw new BusinessError('Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø¨ÛŒØ´ Ø§Ø² Ø­Ø¯ Ø¨Ø²Ø±Ú¯ Ø§Ø³Øª', 413)
  const reader = req.body?.getReader(), chunks: Uint8Array[] = []
  let size = 0
  if (!reader) throw new BusinessError('Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª')
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 12000) { await reader.cancel(); throw new BusinessError('Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø¨ÛŒØ´ Ø§Ø² Ø­Ø¯ Ø¨Ø²Ø±Ú¯ Ø§Ø³Øª', 413) }
    chunks.push(part.value)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  let value
  try { value = JSON.parse(raw) } catch { throw new BusinessError('Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BusinessError('Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª')
  return value as Record<string, unknown>
}
export async function GET(req: NextRequest) {
  try { return ok(await businessDirectory(Object.fromEntries(req.nextUrl.searchParams))) } catch (error) { return failure(error) }
}
export async function POST(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('Ø¨Ø±Ø§ÛŒ Ø«Ø¨Øª ØªØ¬Ø±Ø¨Ù‡ ÙˆØ§Ø±Ø¯ Ø­Ø³Ø§Ø¨ Ø´ÙˆÛŒØ¯', 401)
  if (!rateLimitHit(`business-write:${user.id}`, 30, 3_600_000).ok) return err('Ú©Ù…ÛŒ Ø¨Ø¹Ø¯ Ø¯ÙˆØ¨Ø§Ø±Ù‡ ØªÙ„Ø§Ø´ Ú©Ù†ÛŒØ¯', 429)
  try {
    const body = await input(req)
    if (body.action === 'review') return ok(await submitBusinessExperience(req, body))
    if (body.action === 'reply') return ok(await respondToBusinessExperience(req, body))
    if (body.action === 'request') return ok(await requestBusiness(req, body))
    if (body.action === 'report') return ok(await reportBusinessExperience(req, body))
    if (body.action === 'proof.withdraw') return ok(await withdrawPurchaseProof(req, body))
    return err('Ø¹Ù…Ù„ÛŒØ§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª', 400)
  } catch (error) { return failure(error) }
}
export async function GET_admin(req: NextRequest) {
  const guard = await adminGuard(req, 'businesses', ['businesses.manage'])
  if ('response' in guard) return guard.response
  try {
    const input = Object.fromEntries(req.nextUrl.searchParams)
    const response = ok(input.section === 'trust' ? await businessTrustAdmin(req, input) : await businessAdminData(input))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) { return failure(error) }
}
export async function POST_admin(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const guard = await adminGuard(req, 'businesses', ['businesses.manage'])
  if ('response' in guard) return guard.response
  try {
    const body = await input(req)
    if (body.action === 'profile.save') return ok(await saveBusinessProfile(req, body))
    if (body.action === 'request.decide') return ok(await decideBusinessRequest(req, body))
    if (body.action === 'report.decide') return ok(await decideBusinessReport(req, body))
    if (body.action === 'proof.decide') return ok(await decidePurchaseProof(req, body))
    if (body.action === 'approve' || body.action === 'reject') return ok(await decideBusinessExperience(req, body))
    return err('Ø¹Ù…Ù„ÛŒØ§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª', 400)
  } catch (error) { return failure(error) }
}
