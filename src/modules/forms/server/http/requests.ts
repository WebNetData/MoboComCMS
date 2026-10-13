import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { myRequests } from '@/modules/forms/server/paid'

/** GET /api/me/requests — the signed-in member's own form answers: what they sent, the bill and where the work stands. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  return ok({ requests: await myRequests(user.id) })
}
