import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { accountOverview } from '@/modules/account/server/overview'

/** GET /api/my/overview — the signed-in member's account home. */
export async function GET_overview(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('وارد شوید', 401)
  const data = await accountOverview(user.id)
  const response = data ? ok(data) : err('حساب پیدا نشد', 404)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
