import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { err } from '@/platform/http/response'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { isHumanSurface } from '@/modules/identity/domain/human-check'
import { issueHumanCheck } from '@/modules/identity/server/human-check'

/** GET /api/human-check?surface=comment — what the form must do: nothing, Turnstile, or a signed challenge to solve. */
export async function GET(req: NextRequest) {
  const surface = req.nextUrl.searchParams.get('surface')
  if (!isHumanSurface(surface)) return err('surface نامعتبر است', 400)
  const limit = await rateLimitStrict(`human-check:${clientIp(req.headers)}`, 60)
  if (!limit.ok) return err('درخواست زیاد است؛ کمی بعد دوباره تلاش کنید.', 429)
  return NextResponse.json(await issueHumanCheck(surface), { headers: { 'Cache-Control': 'no-store' } })
}
